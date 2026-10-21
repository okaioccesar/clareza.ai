/* Views use the existing workspace and persistence; no data migration is needed. */
(function(){
  'use strict';
  const W=ClarezaWorkspace,drafts=new Map(),reduce=window.matchMedia('(prefers-reduced-motion:reduce)');
  let dayFilter='today',lastRoute='',routeAnimation;
  const draftKey=()=>route.view+'/'+route.id;
  function quickCapture(){
    const draft=drafts.get(draftKey())||{title:'',date:route.view==='today'?D.dateKey():''};
    return `<form class="quick-capture" id="quick-task-form" aria-label="Adicionar tarefa rapidamente"><span class="capture-plus" aria-hidden="true">${icon('plus')}</span><label class="sr-only" for="quick-task-title">Título da nova tarefa</label><input id="quick-task-title" name="title" required maxlength="200" autocomplete="off" placeholder="O que precisa ser feito?" value="${esc(draft.title)}"><label class="capture-date"><span class="sr-only">Prazo da nova tarefa</span><input id="quick-task-date" name="date" type="date" value="${esc(draft.date)}"></label><button type="submit" class="capture-submit" aria-label="Adicionar tarefa" title="Adicionar tarefa">${icon('arrow')}</button></form>`;
  }
  todayView=function(){
    const today=D.dateKey(),stats=W.summary(state,today),tasks=filteredTasks(W.dayTasks(state,dayFilter,today));
    const filters=[['today','Todas',stats.open],['focus','Fixadas',stats.focus],['late','Atrasadas',stats.late],['done','Concluídas',stats.done]];
    const activeProjects=state.projects.filter(p=>!p.archived);
    const emptyCopy=dayFilter==='done'?['Tudo que você concluir, aqui.','As tarefas concluídas hoje aparecem nesta lista.']:dayFilter==='focus'?['O que merece sua atenção?','Use o alfinete de uma tarefa para deixá-la fixada aqui.']:dayFilter==='late'?['Os prazos estão em dia.','Você não tem tarefas atrasadas.']:['Um pouco de espaço para começar.','Adicione uma tarefa acima ou organize o dia com o assistente.'];
    return `<section class="overview-panel" aria-labelledby="day-title"><div class="overview-heading"><div><p class="overline">${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</p><h1 id="day-title">Seu dia, com clareza.</h1><p class="lead">Um lugar para organizar o que importa hoje.</p></div><div class="overview-actions"><button class="button secondary" data-action="day-assistant">${icon('list')}Organizar meu dia</button>${btn('Nova tarefa','new-task','primary','plus')}</div></div><div class="overview-stats" aria-label="Resumo de hoje">${[['today','Na sua mesa',stats.open,'sun','Para hoje ou fixadas por você'],['done','Concluídas hoje',stats.done,'check','Cada passo conta'],['late','Precisam de atenção',stats.late,'calendar','Tarefas com o prazo anterior a hoje']].map(([filter,label,count,symbol,description])=>`<button class="overview-stat" data-day-filter="${filter}" aria-label="${label}: ${count}. Ver tarefas"><span class="stat-copy"><span>${label}</span><strong>${count}<small>tarefa${count===1?'':'s'}</small></strong><span class="stat-description">${description}</span></span><span class="stat-icon ${filter==='late'&&count?'attention':''}">${icon(symbol)}</span></button>`).join('')}</div><div class="week-strip" aria-label="Dias desta semana">${D.weekDates().map(date=>`<button data-action="open-day" data-date="${date}" class="${date===today?'current':''}" ${date===today?'aria-current="date"':''} aria-label="Abrir ${dateLabel(date)} na semana"><span>${new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}</span><strong>${Number(date.slice(-2))}</strong><i class="${state.tasks.some(t=>t.date===date&&!t.done)?'has-tasks':''}"></i></button>`).join('')}<button class="week-strip-link" data-action="nav" data-view="week">Ver semana ${icon('arrow')}</button></div></section>
    <div class="home-columns"><div class="home-main"><section class="task-panel" aria-labelledby="tasks-heading"><div class="section-heading"><div><h2 id="tasks-heading">Na sua mesa</h2><p class="panel-description">Seus próximos passos, um de cada vez.</p></div><button class="text-button" data-action="nav" data-view="all">Ver todas ${icon('arrow')}</button></div><div class="day-filters" role="group" aria-label="Filtrar tarefas do dia">${filters.map(([key,label,count])=>`<button data-day-filter="${key}" data-focus-key="day-filter-${key}" aria-pressed="${dayFilter===key}" class="${dayFilter===key?'selected':''}">${label}<span>${count}</span></button>`).join('')}</div>${quickCapture()}<div class="day-task-results">${tasks.length?taskList(tasks):empty(...emptyCopy)}</div></section><section class="projects-panel" aria-labelledby="projects-heading"><div class="section-heading"><h2 id="projects-heading">Projetos em movimento</h2><button class="text-button" data-action="nav" data-view="projects">Ver projetos ${icon('arrow')}</button></div><div class="project-grid home-projects">${activeProjects.slice(0,2).map(projectCard).join('')||`<button class="project-new" data-action="new-project">${icon('plus')}<span>Um espaço para o próximo projeto</span><small>Reúna tarefas e ideias em torno de um objetivo.</small></button>`}</div></section></div><aside class="home-side" aria-label="Seu espaço de apoio"><section class="day-progress"><div class="section-heading"><h2>Seu progresso</h2><span class="progress-symbol">${icon('check')}</span></div><p class="progress-number">${stats.percent}<span>%</span></p><div class="day-progress-track" role="progressbar" aria-label="Progresso de hoje" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${stats.percent}" aria-valuetext="${stats.done} concluídas de ${stats.total} tarefas consideradas hoje"><i style="width:${stats.percent}%"></i></div><p>${stats.total?`<strong>${stats.done} de ${stats.total}</strong> tarefas concluídas hoje.`:'Seu progresso aparece conforme você organiza o dia.'}</p></section><section class="daily-note"><div class="section-heading"><h2>Intenção do dia</h2>${icon('sun')}</div><p>O que faria hoje valer a pena?</p><textarea id="daily-note" aria-label="Intenção do dia" maxlength="5000" placeholder="Hoje, quero dar atenção a…">${esc(state.daily[today]||'')}</textarea><span class="small muted">Seu lembrete. Salvo automaticamente.</span></section><section class="quick-note"><div class="section-heading"><h2>Rascunho</h2>${icon('file')}</div><textarea id="scratch" aria-label="Rascunho" maxlength="20000" placeholder="Uma ideia, um lembrete, qualquer coisa…">${esc(state.scratch)}</textarea><div class="scratch-actions"><button class="text-button" data-action="scratch-task">Criar tarefa ${icon('arrow')}</button><button class="text-button" data-action="scratch-page">Criar página ${icon('arrow')}</button></div></section><button class="notebook-link" data-action="nav" data-view="pages">${icon('book')}<div>Seu caderno<small>${state.pages.length} página${state.pages.length===1?'':'s'} com suas ideias</small></div>${icon('arrow')}</button></aside></div>`;
  };
  taskSection=function(tasks){const list=filteredTasks(tasks.filter(t=>statusFilter==='all'||(statusFilter==='done'?t.done:!t.done)));return toolbar()+quickCapture()+`<div id="task-results">${mode==='board'?board(list):taskList(list)}</div>`;};
  const previousInbox=inboxView;
  inboxView=function(){return previousInbox().replace('<div class="task-list">',quickCapture()+'<div class="task-list">').replace('<div class="empty">',quickCapture()+'<div class="empty">');};
  // Filtering an area must never pull unrelated tasks into the result list.
  updateTaskResults=function(){const source=route.view==='area'?state.tasks.filter(t=>effectiveArea(t)===route.id):route.view==='project'?state.tasks.filter(t=>t.projectId===route.id):state.tasks;const list=filteredTasks(source.filter(t=>statusFilter==='all'||(statusFilter==='done'?t.done:!t.done)));$('#task-results').innerHTML=mode==='board'?board(list):taskList(list);};
  const previousTaskRow=taskRow;
  taskRow=function(task){return previousTaskRow(task).replace('class="task-row ','data-task-row="'+esc(task.id)+'" class="task-row ');};
  function rememberFocus(){
    const element=document.activeElement;
    if(!element||!$('#view').contains(element)&&!$('#sidebar').contains(element))return null;
    const row=element.closest('[data-task-row]');
    return {element,id:element.id,key:element.dataset.focusKey,action:element.dataset.action,view:element.dataset.view,entity:element.dataset.id,change:element.dataset.change,tag:element.tagName,nextId:row?.nextElementSibling?.dataset.taskRow||row?.previousElementSibling?.dataset.taskRow,start:element.selectionStart,end:element.selectionEnd};
  }
  function restoreFocus(saved,changedRoute){
    if(!saved||saved.element.isConnected)return;
    let next=saved.id?document.getElementById(saved.id):null;
    if(!next&&!changedRoute){next=[...document.querySelectorAll('#view [data-focus-key],#view [data-action],#sidebar [data-action],#view [data-change]')].find(el=>saved.key?el.dataset.focusKey===saved.key:el.tagName===saved.tag&&el.dataset.action===saved.action&&el.dataset.view===saved.view&&el.dataset.id===saved.entity&&el.dataset.change===saved.change);}
    if(!next&&saved.nextId&&!changedRoute)next=[...document.querySelectorAll('[data-task-row]')].find(el=>el.dataset.taskRow===saved.nextId)?.querySelector('input');
    if(next){next.focus({preventScroll:true});try{if(saved.start!==null)next.setSelectionRange(saved.start,saved.end);}catch{}}
    else if(!changedRoute&&saved.element.closest?.('.task-row'))$('#quick-task-title')?.focus({preventScroll:true});
  }
  const previousRender=render;
  render=function(){
    const focus=rememberFocus(),key=route.view+'/'+route.id,changed=lastRoute!==key&&!!lastRoute;
    routeAnimation?.cancel();previousRender();
    document.querySelectorAll('.segmented [data-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.mode===mode)));
    restoreFocus(focus,changed);
    if(changed&&document.body.dataset.input==='keyboard')$('#view').focus({preventScroll:true});
    if(changed&&!reduce.matches&&document.body.dataset.input==='pointer'&&$('#view').animate)routeAnimation=$('#view').animate([{opacity:.6},{opacity:1}],{duration:140,easing:'cubic-bezier(0.23,1,0.32,1)'});
    lastRoute=key;
  };
  document.addEventListener('click',event=>{
    const filter=event.target.closest('[data-day-filter]');
    if(filter){dayFilter=filter.dataset.dayFilter;render();return;}
    if(event.target.closest('[data-action="day-assistant"]')){$('#assistant-open').click();$('#assistant-input').value='Organize meu dia';$('#assistant-input').focus();}
  });
  document.addEventListener('input',event=>{
    const form=event.target.closest('#quick-task-form');if(!form)return;
    event.target.setCustomValidity('');drafts.set(draftKey(),{title:form.elements.title.value,date:form.elements.date.value});
  });
  document.addEventListener('submit',event=>{
    if(event.target.id!=='quick-task-form')return;event.preventDefault();const form=event.target;
    try{
      const task=W.createTask({title:form.elements.title.value,date:form.elements.date.value,areaId:route.view==='area'?route.id:'',projectId:route.view==='project'?route.id:''},state);
      state.tasks.push(task);if(!save()){state.tasks=state.tasks.filter(t=>t.id!==task.id);return;}
      const snapshot=JSON.stringify(task);drafts.delete(draftKey());if(route.view==='today')dayFilter='today';render();$('#quick-task-title')?.focus();
      toast(task.date?'Tarefa criada para '+dateLabel(task.date).toLocaleLowerCase('pt-BR')+'.':'Tarefa criada sem prazo.',()=>{
        const current=state.tasks.find(t=>t.id===task.id);if(!current)return;
        if(JSON.stringify(current)!==snapshot){toast('A tarefa foi alterada. Abra os detalhes para ajustá-la.');return;}
        const before=state.tasks;state.tasks=state.tasks.filter(t=>t.id!==task.id);if(!save()){state.tasks=before;return;}render();toast('Tarefa removida.');
      });
    }catch(error){form.elements.title.setCustomValidity(error.message);form.elements.title.reportValidity();}
  });
  render();
})();
