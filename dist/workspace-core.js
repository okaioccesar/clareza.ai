(function(root){
  'use strict';
  const D=root.Clareza||(typeof require==='function'?require('./domain.js'):null);
  function dayTasks(workspace,filter='today',today=D.dateKey()){
    return workspace.tasks.filter(task=>{
      if(filter==='done')return task.done&&task.completedAt&&D.dateKey(new Date(task.completedAt))===today;
      if(task.done)return false;
      if(filter==='late')return !!task.date&&task.date<today;
      if(filter==='focus')return task.pinned;
      return task.pinned||!!task.date&&task.date<=today;
    });
  }
  function summary(workspace,today=D.dateKey()){
    const open=dayTasks(workspace,'today',today).length,done=dayTasks(workspace,'done',today).length;
    return {open,done,late:dayTasks(workspace,'late',today).length,focus:dayTasks(workspace,'focus',today).length,total:open+done,percent:open+done?Math.round(done/(open+done)*100):0};
  }
  function createTask(input,workspace,now=new Date()){
    const title=String(input.title||'').trim();
    if(!title||title.length>200)throw Error('Escreva uma tarefa com até 200 caracteres.');
    if(input.date&&!D.validDate(input.date))throw Error('Escolha uma data válida.');
    const task={id:D.id(),title,date:input.date||'',areaId:input.areaId||'',projectId:input.projectId||'',priority:'normal',status:'todo',done:false,createdAt:now.toISOString()};
    return D.normalize({...workspace,tasks:[task]}).tasks[0];
  }
  const api={dayTasks,summary,createTask};root.ClarezaWorkspace=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
