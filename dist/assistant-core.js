(function (root) {
  const D = root.Clareza || (typeof require === 'function' ? require('./domain.js') : null);
  const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const array = value => Array.isArray(value) ? value : [];
  const addDays = (date, days) => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + days); return D.dateKey(d); };
  const response = (message, actions = []) => ({ message, actions });
  function extractDate(text, today) {
    let match = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (match) return { date: D.validDate(match[0]) ? match[0] : '', matched: match[0], invalid: !D.validDate(match[0]) };
    match = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
    if (match) { const date = `${match[3] || today.slice(0,4)}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`; return { date: D.validDate(date) ? date : '', matched: match[0], invalid: !D.validDate(date) }; }
    match = text.match(/\bdepois de amanh[ãa](?=\s|[,.!?;]|$)/i);
    if (match) return { date: addDays(today, 2), matched: match[0] };
    match = text.match(/\bamanh[ãa](?=\s|[,.!?;]|$)/i);
    if (match) return { date: addDays(today, 1), matched: match[0] };
    match = text.match(/\bhoje\b/i);
    if (match) return { date: today, matched: match[0] };
    match = text.match(/\b(?:(?:pr[óo]xima|pr[óo]ximo)\s+)?(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:-feira)?\b/i);
    if (match) { const weekdays = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'], current = new Date(today + 'T12:00:00').getDay(), target = weekdays.indexOf(fold(match[1])); let days = (target - current + 7) % 7; if (!days && /^proxim/.test(fold(match[0]))) days = 7; return { date: addDays(today, days), matched: match[0] }; }
    return { date: '', matched: '' };
  }
  function findTask(query, workspace) { const q = fold(query).trim(); if (!q) return []; const pending = workspace.tasks.filter(t => !t.done); const exact = pending.filter(t => fold(t.title) === q); return exact.length ? exact : pending.filter(t => fold(t.title).includes(q)); }
  function sortedPending(workspace) { return workspace.tasks.filter(t => !t.done).sort((a,b) => Number(b.priority === 'high') - Number(a.priority === 'high') || (a.date || '9999').localeCompare(b.date || '9999')); }
  function parse(input, workspace, today = D.dateKey()) {
    const text = String(input || '').trim(), normalized = fold(text), pending = sortedPending(workspace);
    if (!text) return response('Escreva uma tarefa ou peça um resumo.');
    if (/^(resumo|resuma|listar|liste|mostr[ae])\b/.test(normalized)) {
      const due = pending.filter(t => t.date === today), late = pending.filter(t => t.date && t.date < today), high = pending.filter(t => t.priority === 'high');
      return response(`Você tem ${pending.length} tarefas em aberto: ${due.length} para hoje, ${late.length} atrasadas e ${high.length} com prioridade alta.${pending.length ? '\n\nPróximos passos:\n' + pending.slice(0,5).map(t => `• ${t.title}${t.date ? ' — ' + t.date : ' — sem prazo'}`).join('\n') : '\nSeu espaço está livre. Que tal adicionar o primeiro compromisso?'}`);
    }
    if (/organize.*(meu dia|hoje)|planej[ae].*(meu dia|hoje)/.test(normalized)) {
      const candidates = pending.filter(t => !t.date || t.date <= today).slice(0,3);
      return candidates.length ? response('Separei até três tarefas para o seu foco de hoje, considerando prioridade e prazo. Revise a proposta antes de aplicar.', candidates.map(t => ({ type:'update', id:t.id, title:t.title, date:today, pinned:true }))) : response('Você não tem tarefas pendentes para hoje ou sem prazo. As tarefas futuras ficaram nas datas originais.');
    }
    if (/planej[ae].*semana|organize.*semana/.test(normalized)) {
      const candidates = pending.filter(t => !t.date || t.date <= addDays(today,6)).slice(0,20);
      return candidates.length ? response('Distribuí as tarefas ao longo dos próximos sete dias, começando pelas prioridades. Esta é uma sugestão; revise os prazos antes de aplicar.', candidates.map((t,i) => ({ type:'update', id:t.id, title:t.title, date:addDays(today,Math.min(Math.floor(i/3),6)) }))) : response('Não há tarefas em aberto para distribuir nos próximos sete dias.');
    }
    if (/^(conclu[ai]|concluir|finaliz[ae])\b/.test(normalized)) {
      const title = text.replace(/^(?:conclu[ai]|concluir|finaliz[ae])\s+(?:a\s+)?(?:tarefa\s+)?/i,'').trim(), matches = findTask(title,workspace);
      if (matches.length !== 1) return response(matches.length ? 'Encontrei mais de uma tarefa. Use o título completo:\n' + matches.slice(0,5).map(t => '• ' + t.title).join('\n') : 'Não encontrei uma tarefa em aberto com esse título.');
      return response('Posso marcar esta tarefa como concluída. Se for recorrente, a próxima ocorrência será criada.', [{ type:'update',id:matches[0].id,title:matches[0].title,status:'done' }]);
    }
    if (/^(adi[ae]|adiar|reagend[ae]|mova|mover)\b/.test(normalized)) {
      const date = extractDate(text,today);
      if (!date.date) return response('Informe um prazo válido, como “Adie revisar proposta para amanhã” ou “Reagende revisar proposta para 28/10”.');
      const title = text.replace(/^(?:adi[ae]|adiar|reagend[ae]|mova|mover)\s+(?:a\s+)?(?:tarefa\s+)?/i,'').replace(date.matched,'').replace(/\s+(?:para|em|no dia|na|no)\s*$/i,'').trim(), matches = findTask(title,workspace);
      if (matches.length !== 1) return response(matches.length ? 'Encontrei mais de uma tarefa. Informe o título completo.' : 'Não encontrei essa tarefa em aberto. Use o título que aparece na lista.');
      return response('Aqui está a mudança de prazo para você revisar.', [{ type:'update', id:matches[0].id, title:matches[0].title, date:date.date }]);
    }
    if (/^(crie|criar|adicione|adicionar|anote|nova tarefa|tarefas?:)\b/.test(normalized) || /^(crie|criar|adicione|adicionar|anote|nova tarefa|tarefas?):/i.test(text)) {
      const body = text.replace(/^(?:crie|criar|adicione|adicionar|anote)\s*(?:as?\s+)?(?:tarefas?\s*)?:?\s*/i,'').replace(/^(?:nova tarefa|tarefas?)\s*:?\s*/i,'');
      const chunks = body.split(/[;\n]+/).map(s => s.replace(/^\s*(?:[-•]\s+|\d+[.)]\s+)/,'').trim()).filter(Boolean);
      if (chunks.length > 20) return response('Envie no máximo 20 tarefas por vez.');
      const actions = [];
      for (const chunk of chunks) {
        const date = extractDate(chunk,today); if (date.invalid) return response(`O prazo em “${chunk}” não é válido. Ajuste a data antes de continuar.`);
        let title = chunk;
        if (date.matched) title = title.replace(new RegExp('(?:\\s+(?:para|em|no dia|na|no))?\\s*' + date.matched.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'');
        const priority = /prioridade\s+alta|alta\s+prioridade/i.test(title) ? 'high' : 'normal';
        title = title.replace(/\s*(?:com\s+)?(?:prioridade\s+(?:alta|normal)|(?:alta|normal)\s+prioridade)\b/ig,'');
        let areaId = ''; const normalizedTitle = fold(title);
        for (const a of array(workspace.areas)) { const marker = 'na area ' + fold(a.title), index = normalizedTitle.indexOf(marker); if (index >= 0) { areaId = a.id; title = title.slice(0,index) + title.slice(index + marker.length); break; } }
        title = title.replace(/^(?:uma?\s+)?tarefa\s*:?\s*/i,'').replace(/^[\s,:-]+|[\s,:.-]+$/g,'').trim();
        if (!title || title.length > 200) return response('Cada tarefa precisa de um título de até 200 caracteres.');
        actions.push({type:'create',title,date:date.date,priority,areaId});
      }
      return actions.length ? response(`Preparei ${actions.length === 1 ? 'uma tarefa' : actions.length + ' tarefas'}. Confira os títulos e prazos antes de adicionar.`,actions) : response('Escreva o título depois de “Crie”, por exemplo: “Crie revisar proposta amanhã”.');
    }
    return response('No modo local, posso criar tarefas, resumir pendências, planejar o dia ou a semana, concluir e reagendar.\n\nExemplos:\n• Crie revisar proposta amanhã com prioridade alta\n• Crie tarefas: estudar; treinar; organizar documentos\n• Adie revisar proposta para segunda\n• Organize meu dia\n\nPara pedidos mais livres, selecione IA online quando ela estiver configurada.');
  }
  function validatePlan(raw, workspace) {
    if (!raw || typeof raw.message !== 'string' || !Array.isArray(raw.actions) || raw.actions.length > 20) throw new Error('O assistente retornou uma proposta inválida.');
    const actions = raw.actions.map(action => {
      if (!action || !['create','update'].includes(action.type)) throw new Error('Ação não suportada.');
      const clean = { type:action.type, title:String(action.title || '').trim().slice(0,200) };
      if (action.type === 'update') { const t = workspace.tasks.find(t => t.id === action.id); if (!t || t.done) throw new Error('Uma tarefa da proposta não está mais em aberto. Peça uma nova proposta.'); clean.id = t.id; clean.title = t.title; }
      if (!clean.title) throw new Error('A tarefa precisa de um título.');
      if (action.date !== undefined) { if (action.date !== '' && !D.validDate(action.date)) throw new Error('O assistente sugeriu uma data inválida.'); clean.date = action.date; }
      if (action.priority !== undefined) { if (!['normal','high'].includes(action.priority)) throw new Error('Prioridade inválida.'); clean.priority = action.priority; }
      if (action.status !== undefined) { if (!['todo','doing','done'].includes(action.status)) throw new Error('Status inválido.'); clean.status = action.status; }
      if (action.areaId !== undefined) { if (action.areaId && !array(workspace.areas).some(a => a.id === action.areaId)) throw new Error('Área não encontrada.'); clean.areaId = action.areaId; }
      if (action.pinned !== undefined) clean.pinned = !!action.pinned;
      return clean;
    });
    const ids = actions.filter(a => a.type === 'update').map(a => a.id); if (new Set(ids).size !== ids.length) throw new Error('A proposta tenta alterar a mesma tarefa duas vezes.');
    return { message:raw.message.slice(0,6000), actions };
  }
  function applyPlan(raw, workspace, now = new Date()) {
    const plan = validatePlan(raw,workspace), before = structuredClone(workspace), next = structuredClone(workspace);
    for (const action of plan.actions) {
      if (action.type === 'create') next.tasks.push({id:D.id(),title:action.title,notes:'',date:action.date||'',priority:action.priority||'normal',areaId:action.areaId||'',projectId:'',status:'todo',done:false,pinned:!!action.pinned,repeat:'none',repeatDay:1,nextTaskId:'',generatedFrom:'',subtasks:[],completedAt:null,createdAt:now.toISOString()});
      else { const t = next.tasks.find(t => t.id === action.id); if (action.date !== undefined) { t.date = action.date; t.repeatDay = Number(action.date.slice(-2)) || 1; if (!action.date) t.repeat = 'none'; } if (action.priority !== undefined) t.priority = action.priority; if (action.areaId !== undefined) t.areaId = action.areaId; if (action.pinned !== undefined) t.pinned = action.pinned; if (action.status) D.changeStatus(next.tasks,t,action.status,now); }
    }
    return {before,next};
  }
  const api = {parse,extractDate,validatePlan,applyPlan}; root.ClarezaAssistant = api; if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
