const test=require('node:test'),assert=require('node:assert/strict'),D=require('./dist/domain.js'),W=require('./dist/workspace-core.js');
const fixture=()=>D.normalize({tasks:[{id:'today',title:'Hoje',date:'2026-10-20'},{id:'late',title:'Atrasada',date:'2026-10-19'},{id:'future',title:'Futura',date:'2026-10-24'},{id:'pin',title:'Fixada',date:'2026-10-25',pinned:true},{id:'inbox',title:'Sem prazo'},{id:'done',title:'Feita',done:true,completedAt:new Date(2026,9,20,12).toISOString()}]});
test('resumo do dia considera atrasadas e fixadas sem antecipar outras tarefas futuras',()=>{
  const state=fixture();assert.deepEqual(W.summary(state,'2026-10-20'),{open:3,done:1,late:1,focus:1,total:4,percent:25});
  assert.deepEqual(W.dayTasks(state,'today','2026-10-20').map(t=>t.id),['today','late','pin']);
  assert.equal(state.tasks.find(t=>t.id==='pin').date,'2026-10-25');
});
test('filtros separam fixadas, atrasadas e conclusões do dia',()=>{
  const state=fixture();assert.deepEqual(W.dayTasks(state,'focus','2026-10-20').map(t=>t.id),['pin']);assert.deepEqual(W.dayTasks(state,'late','2026-10-20').map(t=>t.id),['late']);assert.deepEqual(W.dayTasks(state,'done','2026-10-20').map(t=>t.id),['done']);
  assert.equal(W.summary(D.normalize({tasks:[]}),'2026-10-20').percent,0);
});
test('captura rápida valida título e prazo, normaliza associações e preserva o espaço',()=>{
  const state=D.normalize({tasks:[],areas:[{id:'a',title:'Trabalho'}],projects:[{id:'p',title:'Projeto',areaId:'a'}]});
  const task=W.createTask({title:'  Revisar proposta  ',date:'2026-10-20',projectId:'p',areaId:'a'},state,new Date(2026,9,20,12));
  assert.equal(task.title,'Revisar proposta');assert.equal(task.projectId,'p');assert.equal(task.areaId,'a');assert.equal(task.repeat,'none');assert.deepEqual(task.subtasks,[]);assert.equal(state.tasks.length,0);
  assert.throws(()=>W.createTask({title:'   '},state));assert.throws(()=>W.createTask({title:'x',date:'2026-02-30'},state));assert.throws(()=>W.createTask({title:'x'.repeat(201)},state));
});
