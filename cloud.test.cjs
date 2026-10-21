const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {JSDOM,VirtualConsole}=require('jsdom'),D=require('./dist/domain.js');
const key='clareza.workspace.v3',uid='11111111-1111-4111-8111-111111111111';
const empty=()=>D.normalize({tasks:[]}),session={access_token:'test-session-token',user:{id:uid,email:'owner@test.invalid'}};
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
async function boot(t,{guest=empty(),signedIn=false,cache=null,offline=false,googleEnabled=true,oauthError=null,sessionError=null,url='https://clareza.example/'}={}){
  const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const w=dom.window,$=selector=>w.document.querySelector(selector);let active=signedIn?session:null,listener,networkDown=offline;
  const remote={revision:0,data:null},writes=[],oauthCalls=[];let holdGet=null,holdPut=null,clientOptions;
  w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.structuredClone=structuredClone;w.crypto.randomUUID=crypto.randomUUID;
  Object.defineProperty(w.navigator,'onLine',{get:()=>!networkDown});w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
  w.localStorage.setItem(key,JSON.stringify(guest));if(cache)w.localStorage.setItem(key+'.account.'+uid,JSON.stringify(cache));
  w.ClarezaAuth={createClient:(_url,_key,options)=>{clientOptions=options;return {auth:{onAuthStateChange(fn){listener=fn},getSession:async()=>({data:{session:active},error:sessionError}),signInWithOAuth:async options=>{oauthCalls.push(options);return {data:{url:'https://example.supabase.co/auth/v1/authorize'},error:oauthError}},signInWithPassword:async()=>{active=session;listener('SIGNED_IN',active);return {data:{session:active}}},signOut:async()=>{active=null;listener('SIGNED_OUT',null);return {}},signUp:async()=>({data:{session:null}}),resetPasswordForEmail:async()=>({}),updateUser:async()=>({})}}}};
  w.fetch=async(url,options={})=>{
    if(url==='/api/config')return {ok:true,json:async()=>({configured:true,url:'https://example.supabase.co',publishableKey:'sb_publishable_test'})};
    if(networkDown)throw Error('Network unavailable');
    if(url==='https://example.supabase.co/auth/v1/settings')return {ok:true,json:async()=>({external:{google:googleEnabled}})};
    assert.equal(url,'/api/workspace');assert.equal(options.headers.Authorization,'Bearer test-session-token');
    if(options.method==='PUT'){
      const input=JSON.parse(options.body);writes.push(input);if(holdPut)await holdPut;
      if(input.revision!==remote.revision)return {ok:false,status:409,json:async()=>({...remote,status:'conflict',user:session.user})};
      remote.revision++;remote.data=input.data;return {ok:true,status:200,json:async()=>({status:'ok',revision:remote.revision,user:session.user})};
    }
    const snapshot=JSON.parse(JSON.stringify(remote));if(holdGet)await holdGet;
    return {ok:true,status:200,json:async()=>({...snapshot,user:session.user})};
  };
  const scripts=['theme.js','domain.js','app.js','organization.js','shell.js','workspace-core.js','workspace.js','assistant-core.js','assistant.js','sync-core.js','cloud.js'];
  for(const file of scripts)vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),dom.getInternalVMContext(),{filename:file});
  t.after(()=>{w.close();assert.deepEqual(errors,[])});await tick();
  return {w,$,remote,writes,oauthCalls,clientOptions,network(value){networkDown=value},auth(event,next){active=next;listener(event,next)},setSession(next){active=next},hold(method){let release;const promise=new Promise(resolve=>release=resolve);if(method==='GET')holdGet=promise;else holdPut=promise;return ()=>{if(method==='GET')holdGet=null;else holdPut=null;release()}},data:()=>JSON.parse(w.eval('JSON.stringify(state)')),async login(){$('#account-open').click();$('#account-email-input').value='owner@test.invalid';$('#account-password').value='test-password';$('#account-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();},add(title){$('#quick-task-title').value=title;$('#quick-task-title').dispatchEvent(new w.Event('input',{bubbles:true}));$('#quick-task-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));},async sync(){$('[data-account-action="sync"]').click();await tick();}};
}
test('login não envia dados locais antes da importação e logout não mistura contas',async t=>{
  const guest=D.normalize({tasks:[{id:'guest',title:'Tarefa local'}]}),app=await boot(t,{guest});await app.login();
  assert.equal(app.data().tasks.length,0);assert.equal(app.writes.length,0);assert.equal(JSON.parse(app.w.localStorage.getItem(key)).tasks.length,1);
  app.$('[data-account-action="import"]').click();await app.sync();assert.equal(app.remote.data.tasks[0].title,'Tarefa local');
  app.add('Só na minha conta');await app.sync();assert.equal(app.remote.data.tasks.length,2);
  app.$('[data-account-action="logout"]').click();await tick();assert.deepEqual(app.data().tasks.map(task=>task.id),['guest']);assert.equal(app.$('#profile-name').textContent,'Espaço pessoal');
});
test('alterações offline sobrevivem na cópia da conta e são enviadas quando a conexão volta',async t=>{
  const app=await boot(t,{signedIn:true});app.network(true);app.add('Tarefa offline');await app.sync();
  const cached=JSON.parse(app.w.localStorage.getItem(key+'.account.'+uid));assert.equal(cached.dirty,true);assert.equal(cached.data.tasks[0].title,'Tarefa offline');assert.equal(app.remote.revision,0);
  app.network(false);app.w.dispatchEvent(new app.w.Event('online'));await tick();assert.equal(app.remote.data.tasks[0].title,'Tarefa offline');assert.equal(app.$('#save-status').textContent,'Sincronizado');
});
test('conflito exige escolha e guarda cópia antes de carregar a versão remota',async t=>{
  const app=await boot(t,{signedIn:true});app.add('Minha versão');app.remote.revision=1;app.remote.data=D.normalize({tasks:[{id:'remote',title:'Versão do outro dispositivo'}]});await app.sync();
  assert.equal(app.$('#account-conflict').hidden,false);assert.equal(app.data().tasks[0].title,'Minha versão');
  app.$('[data-account-action="use-remote"]').click();assert.equal(app.data().tasks[0].title,'Versão do outro dispositivo');assert.equal(app.$('#account-backup').hidden,false);
  const backupKey=Object.keys(app.w.localStorage).find(k=>k.includes('.backup.'));assert.equal(JSON.parse(app.w.localStorage.getItem(backupKey)).data.tasks[0].title,'Minha versão');
});
test('cópia pendente é carregada sem ser apagada por uma conta ainda vazia',async t=>{
  const cache={format:1,revision:0,data:D.normalize({tasks:[{id:'offline',title:'Pendente de envio'}]}),dirty:true,writeId:crypto.randomUUID()},app=await boot(t,{signedIn:true,cache});
  assert.equal(app.data().tasks[0].title,'Pendente de envio');await app.sync();assert.equal(app.remote.data.tasks[0].title,'Pendente de envio');
});

test('edições durante um envio permanecem pendentes até o próximo envio',async t=>{
  const app=await boot(t,{signedIn:true}),release=app.hold('PUT');app.add('Primeira');await app.sync();
  app.add('Segunda');release();await tick();
  let cached=JSON.parse(app.w.localStorage.getItem(key+'.account.'+uid));assert.equal(cached.dirty,true);assert.equal(cached.data.tasks.length,2);assert.equal(app.remote.data.tasks.length,1);
  await app.sync();cached=JSON.parse(app.w.localStorage.getItem(key+'.account.'+uid));assert.equal(cached.dirty,false);assert.equal(app.remote.data.tasks.length,2);assert.equal(app.remote.revision,2);
});

test('sair durante a abertura da conta impede que a resposta substitua o espaço local',async t=>{
  const guest=D.normalize({tasks:[{id:'guest',title:'Local preservado'}]}),app=await boot(t,{guest}),release=app.hold('GET');
  await app.login();app.auth('SIGNED_OUT',null);await tick();release();await tick();
  assert.equal(app.data().tasks[0].title,'Local preservado');assert.equal(app.$('#profile-name').textContent,'Espaço pessoal');assert.equal(app.writes.length,0);
});

test('uma sessão de outra conta não pode receber alterações da conta anterior',async t=>{
  const app=await boot(t,{signedIn:true});app.add('Privada da primeira conta');
  app.setSession({...session,user:{id:'22222222-2222-4222-8222-222222222222',email:'second@test.invalid'}});await app.sync();
  assert.equal(app.writes.length,0);assert.equal(app.$('#save-status').textContent,'Entre novamente para sincronizar');
  assert.equal(JSON.parse(app.w.localStorage.getItem(key+'.account.'+uid)).dirty,true);
});

test('recuperação mantém o formulário de nova senha visível depois de carregar a conta',async t=>{
  const app=await boot(t);app.auth('PASSWORD_RECOVERY',session);await tick();await tick();
  assert.equal(app.$('#account-auth').hidden,false);assert.equal(app.$('#account-email-label').hidden,true);assert.equal(app.$('#account-submit').textContent,'Salvar nova senha');assert.equal(app.$('#account-dialog').open,true);
});

test('uma leitura antiga não substitui alterações já sincronizadas durante a espera',async t=>{
  const app=await boot(t,{signedIn:true}),release=app.hold('GET');
  app.w.document.dispatchEvent(new app.w.Event('visibilitychange'));await tick();
  app.add('Alteração mais recente');await app.sync();assert.equal(app.remote.revision,1);
  release();await tick();assert.equal(app.data().tasks[0].title,'Alteração mais recente');
  assert.equal(JSON.parse(app.w.localStorage.getItem(key+'.account.'+uid)).revision,1);
});

test('Google inicia OAuth com PKCE, retorno ao próprio site e sem enviar dados locais',async t=>{
  const guest=D.normalize({tasks:[{id:'guest',title:'Dado local privado'}]}),app=await boot(t,{guest});
  app.$('#account-open').click();app.$('#account-google').click();await tick();
  assert.equal(app.clientOptions.auth.flowType,'pkce');assert.equal(app.clientOptions.auth.detectSessionInUrl,true);
  assert.equal(app.oauthCalls.length,1);assert.equal(app.oauthCalls[0].provider,'google');assert.equal(app.oauthCalls[0].options.redirectTo,'https://clareza.example/');
  assert.equal(app.oauthCalls[0].options.queryParams.prompt,'select_account');assert.equal(app.oauthCalls[0].options.scopes,undefined);
  assert.equal(app.writes.length,0);assert.equal(JSON.parse(app.w.localStorage.getItem(key)).tasks[0].id,'guest');
  app.auth('SIGNED_IN',session);await tick();await tick();assert.equal(app.data().tasks.length,0);assert.equal(app.writes.length,0);
});

test('Google desabilitado não inicia redirecionamento e mantém login por e-mail disponível',async t=>{
  const app=await boot(t,{googleEnabled:false});app.$('#account-open').click();await tick();
  assert.equal(app.$('#account-google').disabled,true);assert.match(app.$('#account-google-status').textContent,/disponível em breve/);
  app.$('#account-google').click();assert.equal(app.oauthCalls.length,0);assert.equal(app.$('#account-submit').disabled,false);
});

test('Google não redireciona se a cópia local falhar ao salvar',async t=>{
  const app=await boot(t);app.$('#account-open').click();
  const original=app.w.Storage.prototype.setItem;app.w.Storage.prototype.setItem=function(k,v){if(k===key)throw Error('Quota');return original.call(this,k,v)};
  app.$('#account-google').click();await tick();assert.equal(app.oauthCalls.length,0);assert.match(app.$('#account-message').textContent,/Exporte uma cópia/);
});

test('falha ao abrir Google não revela resposta do provedor e permite tentar de novo',async t=>{
  const app=await boot(t,{oauthError:{message:'sensitive-provider-detail'}});app.$('#account-open').click();app.$('#account-google').click();await tick();
  assert.match(app.$('#account-message').textContent,/Não foi possível abrir o Google/);assert.doesNotMatch(app.$('#account-message').textContent,/sensitive-provider-detail/);assert.equal(app.$('#account-google').disabled,false);
});

test('retorno cancelado limpa parâmetros de autenticação e preserva a rota e os dados locais',async t=>{
  const guest=D.normalize({tasks:[{id:'local',title:'Continuar aqui'}]}),app=await boot(t,{guest,url:'https://clareza.example/?error=access_denied&error_description=private-provider-error&keep=1#today'});
  assert.equal(app.$('#account-dialog').open,true);assert.match(app.$('#account-message').textContent,/Entrada cancelada/);
  assert.equal(app.w.location.search,'?keep=1');assert.equal(app.w.location.hash,'#today');assert.equal(app.data().tasks[0].id,'local');assert.equal(app.writes.length,0);
});

test('código de retorno expirado é removido e oferece nova tentativa de login',async t=>{
  const app=await boot(t,{sessionError:Error('Expired code'),url:'https://clareza.example/?code=expired-code#inbox'});
  assert.equal(app.w.location.search,'');assert.equal(app.w.location.hash,'#inbox');assert.equal(app.$('#account-dialog').open,true);assert.match(app.$('#account-message').textContent,/link pode ter expirado/);
});

test('retorno sem verificador PKCE não simula sucesso nem deixa código na URL',async t=>{
  const app=await boot(t,{url:'https://clareza.example/?code=unprocessed-code'});
  assert.equal(app.w.location.search,'');assert.match(app.$('#account-message').textContent,/tente entrar novamente/);assert.equal(app.$('#account-dialog').open,true);assert.equal(app.writes.length,0);
});
