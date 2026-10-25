(function () {
  const engine = ClarezaAssistant, messages = [], log = $('#assistant-messages');
  let busy = false, mode = 'local', request = null, conversation = 0, cancelled = false;
  function scrollEnd() { log.scrollTop = log.scrollHeight; }
  function addMessage(role, text, plan) {
    const message = {id:D.id(),role,text,plan,status:'pending',baseTasks:(plan?.actions||[]).filter(a=>a.type==='update').map(a=>structuredClone(state.tasks.find(t=>t.id===a.id)))}; messages.push(message); renderMessage(message); scrollEnd(); return message;
  }
  function actionLabel(action) { return [action.type === 'create' ? 'Nova tarefa' : 'Atualizar', action.date !== undefined ? dateLabel(action.date) : '', action.priority === 'high' ? 'Prioridade alta' : '', action.pinned ? 'Fixar em Hoje' : '', action.status === 'done' ? 'Concluir' : '', action.areaId ? area(action.areaId)?.title : ''].filter(Boolean).join(' · '); }
  function renderMessage(message) {
    const element = document.createElement('article'); element.className = 'chat-message ' + message.role; element.dataset.messageId = message.id;
    const author = document.createElement('span'); author.className = 'chat-author'; author.textContent = message.role === 'user' ? 'Você' : mode === 'online' ? 'Assistente · IA online' : 'Assistente · local'; element.append(author);
    const text = document.createElement('p'); text.textContent = message.text; element.append(text);
    if (message.plan?.actions.length) {
      const proposal = document.createElement('div'); proposal.className = 'chat-plan';
      const list = document.createElement('ul'); list.className = 'chat-plan-list';
      for (const action of message.plan.actions) { const item = document.createElement('li'), title = document.createElement('strong'), detail = document.createElement('small'); title.textContent = action.title; detail.textContent = actionLabel(action); item.append(title,detail); list.append(item); }
      const controls = document.createElement('div'); controls.className = 'chat-plan-actions';
      const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'button primary'; apply.textContent = 'Aplicar proposta';
      const discard = document.createElement('button'); discard.type = 'button'; discard.className = 'button secondary'; discard.textContent = 'Descartar';
      apply.onclick = () => {
        if (message.status !== 'pending' || busy) return;
        try {
          if (message.baseTasks.some(before=>JSON.stringify(before)!==JSON.stringify(state.tasks.find(t=>t.id===before.id)))) throw new Error('Uma tarefa mudou desde esta proposta. Peça uma nova proposta para usar as informações atuais.');
          const result = engine.applyPlan(message.plan,state), previous = state; state = result.next;
          if (!save()) { state = previous; return; }
          message.status = 'applied'; render(); controls.replaceChildren(); const status = document.createElement('p'); status.className = 'chat-plan-status'; status.textContent = 'Proposta aplicada. As alterações estão nas suas tarefas.'; controls.append(status);
          const appliedState=JSON.stringify(state), undoButton=document.createElement('button');
          undoButton.type='button'; undoButton.className='text-button'; undoButton.textContent='Desfazer alterações';
          const undoApplied=()=>{
            if(message.status!=='applied')return;
            if(JSON.stringify(state)!==appliedState){addMessage('assistant','O espaço mudou após a proposta. Ajuste as tarefas individualmente para preservar suas alterações.');return;}
            const current=state;state=result.before;
            if(!save()){state=current;addMessage('assistant','Não foi possível salvar. As alterações da proposta foram mantidas.');return;}
            render();message.status='undone';status.textContent='Alterações desfeitas.';undoButton.remove();toast('Alterações do assistente desfeitas.');
          };
          undoButton.onclick=undoApplied;controls.append(undoButton);toast('Proposta aplicada.',undoApplied);
        } catch (error) { addMessage('assistant',error.message); }
      };
      discard.onclick = () => { if (message.status !== 'pending') return; message.status = 'discarded'; controls.textContent = 'Proposta descartada.'; controls.className = 'chat-plan-status'; };
      controls.append(apply,discard); proposal.append(list,controls); element.append(proposal);
    }
    log.append(element);
  }
  function welcome() { addMessage('assistant','Posso ajudar a transformar pendências em tarefas e organizar seus próximos passos.\n\nComece com “Organize meu dia” ou “Crie revisar proposta amanhã”. Você revisa cada proposta antes de aplicar.'); }
  function setBusy(value) {
    busy = value;
    $('#assistant-send').disabled = value;
    $('#assistant-input').disabled = value;
    $('#assistant-mode').disabled = value;
    $('#assistant-clear').disabled = value;
    $('#assistant-stop').hidden = !value || mode !== 'online';
    $('#assistant-send').textContent = value ? 'Aguarde…' : 'Enviar';
    log.setAttribute('aria-busy',String(value));
  }
  async function checkAvailability() {
    const current = conversation;
    try {
      const response = await fetch('/api/chat');
      const data = await response.json();
      if (current !== conversation) return;
      $('#assistant-availability').textContent = response.ok && data.configured
        ? 'IA configurada. Selecione IA online para conversar.'
        : 'IA ainda não configurada. Os comandos locais estão disponíveis.';
    } catch {
      if (current === conversation) $('#assistant-availability').textContent = 'Sem conexão com a IA. Você pode usar os comandos locais.';
    }
  }
  function history() {
    return messages.slice(0,-1).slice(-8).map(message => ({
      role:message.role,
      content:message.text + (message.plan?.actions.length
        ? '\nProposta (' + message.status + '): ' + JSON.stringify(message.plan.actions)
        : '')
    }));
  }
  function context() { return { today:D.dateKey(),tasks:state.tasks.filter(t => !t.done).slice(0,100).map(t => ({id:t.id,title:t.title,date:t.date,priority:t.priority,areaId:effectiveArea(t),projectId:t.projectId,status:t.status})),areas:state.areas.map(a => ({id:a.id,title:a.title})),projects:state.projects.filter(p => !p.archived).map(p => ({id:p.id,title:p.title})) }; }
  async function submit(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    if (text.length > 4000) { toast('Use até 4.000 caracteres por mensagem.'); return; }
    const current = conversation;
    cancelled = false;
    addMessage('user',text); $('#assistant-input').value = ''; setBusy(true);
    const waiting = document.createElement('div'); waiting.className = 'chat-waiting'; waiting.textContent = mode === 'online' ? 'Preparando a proposta…' : 'Organizando…'; log.append(waiting); scrollEnd();
    try {
      let result;
      if (mode === 'online') {
        const controller = new AbortController();
        request = controller;
        const timeout = setTimeout(() => controller.abort(),35000);
        try {
          const accessToken = await window.ClarezaAccount?.accessToken();
          if (current !== conversation || controller.signal.aborted) return;
          if (!accessToken) throw new Error('Entre na sua conta para conversar com a IA.');
          const response = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},signal:controller.signal,body:JSON.stringify({message:text,context:context(),history:history()})});
          const data = await response.json(); if (!response.ok) throw new Error(data.error || 'A IA online não está disponível agora.'); result = engine.validatePlan(data,state);
        } finally { clearTimeout(timeout); if (request === controller) request = null; }
      } else result = engine.validatePlan(engine.parse(text,state),state);
      if (current !== conversation) return;
      if (cancelled) { waiting.remove(); addMessage('assistant','Resposta interrompida. Nenhuma tarefa foi alterada.'); return; }
      waiting.remove(); addMessage('assistant',result.message,result);
    } catch (error) {
      if (current !== conversation) return;
      waiting.remove();
      addMessage('assistant',cancelled ? 'Resposta interrompida. Nenhuma tarefa foi alterada.' : error.name === 'AbortError' ? 'A resposta demorou além do esperado. Tente novamente ou selecione Comandos locais.' : error.message);
      if (!cancelled) $('#assistant-input').value = text;
    } finally {
      waiting.remove();
      if (current === conversation) { setBusy(false); if ($('#assistant-dialog').open) $('#assistant-input').focus(); scrollEnd(); }
    }
  }
  $('#assistant-open').setAttribute('aria-label','Abrir assistente de tarefas');
  $('#assistant-open').onclick = () => { if (!messages.length) welcome(); $('#assistant-dialog').showModal(); $('#assistant-input').focus(); checkAvailability(); };
  $('#assistant-form').onsubmit = e => { e.preventDefault(); submit($('#assistant-input').value); };
  $('#assistant-input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(e.currentTarget.value); } };
  document.querySelectorAll('[data-chat-prompt]').forEach(button => button.onclick = () => submit(button.dataset.chatPrompt));
  $('#assistant-mode').onchange = e => { mode = e.target.value; $('#assistant-mode-help').textContent = mode === 'local' ? 'Comandos locais: organiza tarefas neste navegador, sem enviar dados para uma IA.' : 'Ao enviar, sua mensagem, títulos, prazos, prioridades e a conversa atual são enviados à IA pelo Vercel AI Gateway. Notas e páginas não são enviadas. Requer IA configurada no servidor.'; };
  $('#assistant-clear').onclick = () => { if (busy) return; messages.splice(0); log.replaceChildren(); welcome(); };
  $('#assistant-stop').onclick = () => { cancelled = true; request?.abort(); };
  document.addEventListener('clareza:workspace-locked', () => {
    conversation++;
    request?.abort();
    request = null;
    messages.splice(0);
    log.replaceChildren();
    $('#assistant-input').value = '';
    $('#assistant-dialog').close();
    setBusy(false);
  });
})();
