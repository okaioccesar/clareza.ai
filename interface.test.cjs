const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const D=require('./dist/domain.js');
const scripts=['theme.js','domain.js','app.js','organization.js','shell.js','workspace-core.js','workspace.js','assistant-core.js','assistant.js','filters.js'];

test('seletor de projetos filtra tarefas e permite fechar com Escape',async t=>{
  const app=boot(t,{projects:[{id:'a',title:'Projeto <longo> com nome completo'},{id:'b',title:'Outro'}],tasks:[{id:'one',title:'Tarefa A',projectId:'a'},{id:'two',title:'Tarefa B',projectId:'b'}]});
  app.w.eval("route={view:'all'};render()");
  await new Promise(resolve=>setImmediate(resolve));
  const select=app.$('[data-change="filter-project"]');
  assert.equal(select.hidden,true);
  const picker=select.closest('details');
  picker.open=true;
  picker.querySelector('[data-value="a"]').click();
  assert.equal(select.value,'a');
  assert.match(app.$('#task-results').textContent,/Tarefa A/);
  assert.doesNotMatch(app.$('#task-results').textContent,/Tarefa B/);
  assert.match(picker.querySelector('summary').textContent,/<longo>/);
  assert.equal(picker.querySelector('longo'),null);
  picker.open=true;
  picker.querySelector('button').dispatchEvent(new app.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(picker.open,false);
  assert.equal(app.w.document.activeElement,picker.querySelector('summary'));
});

test('chat mantém contexto de propostas e limpa a conversa ao perder acesso', async t => {
  const app=boot(t);
  const sent=[];
  app.w.ClarezaAccount={accessToken:async()=> 'session-token'};
  app.w.fetch=async(url,options)=>{
    if(!options)return {ok:true,json:async()=>({configured:true})};
    sent.push(JSON.parse(options.body));
    assert.equal(options.headers.Authorization,'Bearer session-token');
    return {ok:true,json:async()=>({message:'Sugiro esta tarefa.',actions:[{type:'create',title:'Estudar',date:''}]})};
  };
  app.$('#assistant-open').click();
  app.$('#assistant-mode').value='online';
  app.$('#assistant-mode').dispatchEvent(new app.w.Event('change'));
  app.input('#assistant-input','Preciso estudar');
  app.$('#assistant-form').dispatchEvent(new app.w.Event('submit',{cancelable:true}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.data().tasks.length,0);
  app.input('#assistant-input','Pode explicar a proposta?');
  app.$('#assistant-form').dispatchEvent(new app.w.Event('submit',{cancelable:true}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(sent[1].history.some(message=>message.content.includes('Proposta (pending)')));
  app.w.document.dispatchEvent(new app.w.Event('clareza:workspace-locked'));
  assert.equal(app.$('#assistant-messages').textContent,'');
  assert.equal(app.$('#assistant-dialog').open,false);
});

test('parar resposta cancela requisição sem criar tarefas', async t => {
  const app=boot(t);
  app.w.ClarezaAccount={accessToken:async()=> 'session-token'};
  app.w.fetch=async(url,options)=>{
    if(!options)return {ok:true,json:async()=>({configured:true})};
    return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new app.w.DOMException('Aborted','AbortError'))));
  };
  app.$('#assistant-open').click();
  app.$('#assistant-mode').value='online';
  app.$('#assistant-mode').dispatchEvent(new app.w.Event('change'));
  app.input('#assistant-input','Organize meu dia');
  app.$('#assistant-form').dispatchEvent(new app.w.Event('submit',{cancelable:true}));
  await new Promise(resolve=>setImmediate(resolve));
  app.$('#assistant-stop').click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(app.$('#assistant-messages').textContent,/Resposta interrompida/);
  assert.equal(app.$('#assistant-send').disabled,false);
  assert.equal(app.data().tasks.length,0);
});
function boot(t,{tasks=[],areas=[],projects=[],pages=[],mobile=false,storageBlocked=false}={}){
  const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error));
  const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://clareza.example/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  // Component tests exercise the workspace after the authentication gate.
  dom.window.document.querySelector("#app-shell").hidden=false;
  dom.window.document.querySelector("#app-shell").removeAttribute("inert");
  dom.window.document.querySelector("#login-landing").hidden=true;
  const w=dom.window,mediaQueries=[];
  w.matchMedia=query=>{const listeners=[];const media={matches:query.includes('max-width')?mobile:false,addEventListener(name,fn){listeners.push(fn)},removeEventListener(){}};mediaQueries.push({query,media,listeners});return media;};
  w.scrollTo=()=>{};w.structuredClone=structuredClone;w.crypto.randomUUID=crypto.randomUUID;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
  w.localStorage.setItem('clareza.workspace.v3',JSON.stringify({tasks,areas,projects,pages,daily:{},scratch:''}));
  if(storageBlocked)w.Storage.prototype.setItem=function(){throw Error('quota exceeded')};
  for(const file of scripts)vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),dom.getInternalVMContext(),{filename:file});
  t.after(()=>{dom.window.close();assert.deepEqual(errors,[])});
  const $=selector=>w.document.querySelector(selector),data=()=>JSON.parse(w.eval('JSON.stringify(state)'));
  const input=(selector,value)=>{const el=$(selector);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const submit=()=>$('#quick-task-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  const resize=mobile=>mediaQueries.filter(item=>item.query.includes('max-width')).forEach(({media,listeners})=>{media.matches=mobile;listeners.forEach(listener=>listener(media));});
  return {w,$,data,input,submit,resize};
}
test('interface cria tarefa, atualiza resumo e desfaz sem apagar outros registros',t=>{
  const app=boot(t,{tasks:[{id:'old',title:'Tarefa existente'}]});
  app.input('#quick-task-title','Revisar proposta');app.submit();
  assert.equal(app.data().tasks.length,2);assert.equal(app.data().tasks[1].date,D.dateKey());
  assert.equal(app.$('.overview-stat strong').childNodes[0].textContent,'1');
  assert.equal(app.w.document.activeElement.id,'quick-task-title');
  app.$('#toast button').click();assert.deepEqual(app.data().tasks.map(t=>t.id),['old']);
});
test('falha ao salvar captura mantém rascunho e não acrescenta uma tarefa apenas em memória',t=>{
  const app=boot(t,{storageBlocked:true});app.input('#quick-task-title','Não perder este rascunho');app.submit();
  assert.equal(app.data().tasks.length,0);assert.equal(app.$('#quick-task-title').value,'Não perder este rascunho');
  assert.match(app.$('#toast span').textContent,/salvar/i);
});
test('conclusão mantém foco na próxima tarefa e filtro mostra a tarefa concluída',t=>{
  const today=D.dateKey(),app=boot(t,{tasks:[{id:'a',title:'Primeira',date:today},{id:'b',title:'Segunda',date:today}]});
  const check=app.$('[data-task-row="a"] input');check.focus();check.click();
  assert.equal(app.data().tasks[0].done,true);assert.equal(app.w.document.activeElement.dataset.id,'b');
  app.$('[data-focus-key="day-filter-done"]').click();assert.match(app.$('.day-task-results').textContent,/Primeira/);assert.doesNotMatch(app.$('.day-task-results').textContent,/Segunda/);
});
test('rascunho da captura e cursor da intenção sobrevivem à atualização da tela',t=>{
  const app=boot(t);app.input('#quick-task-title','Uma tarefa ainda não enviada');app.$('[data-focus-key="day-filter-focus"]').click();assert.equal(app.$('#quick-task-title').value,'Uma tarefa ainda não enviada');
  app.input('#daily-note','Meu texto de intenção');app.$('#daily-note').focus();app.$('#daily-note').setSelectionRange(4,9);app.w.eval('render()');
  assert.equal(app.w.document.activeElement.id,'daily-note');assert.equal(app.$('#daily-note').selectionStart,4);assert.equal(app.$('#daily-note').selectionEnd,9);
});
test('buscar dentro de uma área mantém resultados restritos a essa área',t=>{
  const app=boot(t,{areas:[{id:'work',title:'Trabalho'},{id:'study',title:'Estudos'}],tasks:[{id:'a',title:'Revisar trabalho',areaId:'work'},{id:'b',title:'Revisar estudo',areaId:'study'}]});
  app.w.eval("route={view:'area',id:'work'};render()");app.input('#task-search','Revisar');
  assert.match(app.$('#task-results').textContent,/Revisar trabalho/);assert.doesNotMatch(app.$('#task-results').textContent,/Revisar estudo/);
  app.input('#quick-task-title','Nova tarefa de trabalho');app.submit();assert.equal(app.data().tasks.at(-1).areaId,'work');
});
test('barra lateral recolhível salva preferência e menu móvel isola conteúdo de fundo',t=>{
  const desktop=boot(t);desktop.$('#sidebar-collapse').click();assert.equal(desktop.w.document.body.dataset.sidebar,'compact');assert.equal(desktop.w.localStorage.getItem('clareza.sidebar'),'compact');assert.equal(desktop.$('#sidebar-collapse').getAttribute('aria-expanded'),'false');
  const mobile=boot(t,{mobile:true});assert.equal(mobile.$('#sidebar').inert,true);mobile.$('#mobile-menu').click();assert.equal(mobile.$('main').inert,true);assert.equal(mobile.$('#sidebar').inert,false);assert.equal(mobile.$('#sidebar-backdrop').hidden,false);
  mobile.$('#sidebar-backdrop').click();assert.equal(mobile.$('main').inert,false);assert.equal(mobile.$('#sidebar').inert,true);assert.equal(mobile.w.document.activeElement.id,'mobile-menu');
  mobile.$('#mobile-menu').click();mobile.$('#navigation [data-view="all"]').click();assert.equal(mobile.$('main').inert,false);assert.equal(mobile.w.document.activeElement.id,'view');
});
test('assistente continua criando propostas e as tarefas escapam conteúdo HTML',t=>{
  const app=boot(t);app.$('[data-action="day-assistant"]').click();assert.equal(app.$('#assistant-dialog').open,true);assert.equal(app.$('#assistant-input').value,'Organize meu dia');
  app.$('#assistant-dialog').close();app.input('#quick-task-title','<img src=x onerror=alert(1)>');app.submit();assert.equal(app.$('.day-task-results img'),null);assert.match(app.$('.day-task-results').textContent,/<img src=x/);
});
test('atalho de pular navegação mantém a rota e foca o conteúdo',t=>{
  const app=boot(t);app.w.eval("route={view:'all',id:''};render()");app.$('.skip-link').click();
  assert.equal(app.w.document.activeElement.id,'view');assert.equal(app.w.eval('route.view'),'all');assert.equal(app.w.location.hash,'');
});

test('redimensionar entre desktop e celular não deixa foco em controles ocultos',t=>{
  const app=boot(t);
  app.$('#navigation .nav-item').focus();
  app.resize(true);
  assert.equal(app.$('#sidebar').inert,true);
  assert.equal(app.w.document.activeElement.id,'mobile-menu');
  app.resize(false);
  assert.equal(app.$('#sidebar').inert,false);
  assert.equal(app.w.document.activeElement.id,'view');
});

test('menu móvel ignora campos desabilitados e fora da ordem de tabulação',t=>{
  const app=boot(t,{mobile:true});
  const sidebar=app.$('#sidebar');
  sidebar.insertAdjacentHTML('beforeend','<input disabled><input tabindex="-1">');
  // JSDOM has no layout; visible candidates receive a synthetic rectangle.
  sidebar.querySelectorAll('a,button,input').forEach(el=>{el.getClientRects=()=>[{}];});
  app.$('#mobile-menu').click();
  app.$('#account-open').focus();
  const tab=new app.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});
  app.$('#account-open').dispatchEvent(tab);
  assert.equal(tab.defaultPrevented,true);
  assert.equal(app.w.document.activeElement,app.$('#sidebar .brand'));
  app.w.document.dispatchEvent(new app.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(app.$('main').inert,false);
  assert.equal(app.w.document.activeElement.id,'mobile-menu');
});
