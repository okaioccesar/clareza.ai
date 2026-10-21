const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {JSDOM,VirtualConsole}=require('jsdom'),D=require('./dist/domain.js');
const key='clareza.workspace.v3',uid='11111111-1111-4111-8111-111111111111';
const empty=()=>D.normalize({tasks:[]}),session={access_token:'test-session-token',user:{id:uid,email:'owner@test.invalid'}};
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
async function boot(t,{guest=empty(),signedIn=false,cache=null,offline=false}={}){
  const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://clareza.example/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const w=dom.window,$=selector=>w.document.querySelector(selector);let active=signedIn?session:null,listener,networkDown=offline;
  const remote={revision:0,data:null},writes=[];let holdGet=null,holdPut=null;
  w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.structuredClone=structuredClone;w.crypto.randomUUID=crypto.randomUUID;
  Object.defineProperty(w.navigator,'onLine',{get:()=>!networkDown});w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
  w.localStorage.setItem(key,JSON.stringify(guest));if(cache)w.localStorage.setItem(key+'.account.'+uid,JSON.stringify(cache));
  w.ClarezaAuth={createClient:()=>({auth:{onAuthStateChange(fn){listener=fn},getSession:async()=>({data:{session:active}}),signInWithPassword:async()=>{active=session;listener('SIGNED_IN',active);return {data:{session:active}}},signOut:async()=>{active=null;listener('SIGNED_OUT',null);return {}},signUp:async()=>({data:{session:null}}),resetPasswordForEmail:async()=>({}),updateUser:async()=>({})}})};
  w.fetch=async(url,options={})=>{
    if(url==='/api/config')return {ok:true,json:async()=>({configured:true,url:'https://example.supabase.co',publishableKey:'sb_publishable_test'})};
    if(networkDown)throw Error('Network unavailable');
    assert.equal(url,'/api/workspace');assert.equal(options.headers.Authorization,'Bearer test-session-token');
    if(options.method==='PUT'){
      const input=JSON.parse(options.body);writes.push(input);if(holdPut)await holdPut;
      if(input.revision!==remote.revision)return {ok:false,status:409,json:async()=>({...remote,status:'conflict',user:session.user})};
      remote.revision++;remote.data=input.data;return {ok:true,status:200,json:async()=>({status:'ok',revision:remote.revision,user:session.user})};
    }
    if(holdGet)await holdGet;
    return {ok:true,status:200,json:async()=>({...remote,user:session.user})};
  };
  const scripts=['theme.js','domain.js','app.js','organization.js','shell.js','workspace-core.js','workspace.js','assistant-core.js','assistant.js','sync-core.js','cloud.js'];
  for(const file of scripts)vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),dom.getInternalVMContext(),{filename:file});
  t.after(()=>{w.close();assert.deepEqual(errors,[])});await tick();
  return {w,$,remote,writes,network(value){networkDown=value},auth(event,next){active=next;listener(event,next)},setSession(next){active=next},hold(method){let release;const promise=new Promise(resolve=>release=resolve);if(method==='GET')holdGet=promise;else holdPut=promise;return ()=>{if(method==='GET')holdGet=null;else holdPut=null;release()}},data:()=>JSON.parse(w.eval('JSON.stringify(state)')),async login(){$('#account-open').click();$('#account-email-input').value='owner@test.invalid';$('#account-password').value='test-password';$('#account-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();},add(title){$('#quick-task-title').value=title;$('#quick-task-title').dispatchEvent(new w.Event('input',{bubbles:true}));$('#quick-task-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));},async sync(){$('[data-account-action="sync"]').click();await tick();}};
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
