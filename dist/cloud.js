(function(){
  'use strict';
  const S=ClarezaSync,guestSave=save,guestError=loadError,dialog=$('#account-dialog');
  let client=null,session=null,account=null,available=false,connecting=false,generation=0;
  let revision=0,dirty=false,writeId=D.id(),phase='local',conflict=null,flight=null,timer=null;
  let lastData='',lastCacheRaw='',authMode='signin',busy=false,reconnecting=false,latestBackup='';
  const cacheKey=id=>KEY+'.account.'+id;
  const messages={local:'Salvo neste navegador',connecting:'Conectando sua conta…',clean:'Sincronizado',pending:'Salvo neste navegador · sincronizando…',offline:'Salvo neste navegador · sem conexão',conflict:'Duas versões · escolha como continuar',expired:'Entre novamente para sincronizar',error:'Não foi possível sincronizar'};
  function message(text,error=false){$('#account-message').textContent=text;$('#account-message').classList.toggle('error',error);}
  function guestData(){return D.normalize(JSON.parse(localStorage.getItem(KEY)||JSON.stringify(S.empty())));}
  function persist(){
    const key=cacheKey(account.id),existing=localStorage.getItem(key);
    if(existing&&existing!==lastCacheRaw){const other=S.parseCache(existing);if(other.dirty&&!S.equal(other.data,state))backup(other.data,'Alterações de outra aba antes desta gravação');}
    const raw=JSON.stringify({format:1,revision,data:state,dirty,writeId});
    localStorage.setItem(key,raw);lastCacheRaw=raw;
  }
  function backup(data,label){
    const key=cacheKey(account.id)+'.backup.'+Date.now()+'.'+D.id();
    localStorage.setItem(key,JSON.stringify({label,data,createdAt:new Date().toISOString()}));
    latestBackup=key;
  }
  function update(){
    $('#save-status').textContent=account||connecting?messages[phase]:messages.local;
    $('#profile-name').textContent=account?.email||'Espaço pessoal';
    $('#profile-status').textContent=account?messages[phase]:'Salvo neste navegador';
    $('#account-button-label').textContent=account?'Minha conta':'Entrar ou criar conta';
    $('#account-open').title=account?'Minha conta':'Entrar ou criar conta';
    $('#account-signed-in').hidden=!account;
    $('#account-auth').hidden=!!account&&!reconnecting;
    $('#account-email').textContent=account?.email||'';
    $('#account-sync-description').textContent=messages[phase];
    $('#account-conflict').hidden=!conflict;
    $('#account-backup').hidden=!latestBackup;
    $('#account-import').hidden=true;
    if(account){try{const guest=guestData();if(S.hasContent(guest)){$('#account-import').hidden=false;$('#account-import-description').textContent=`Este navegador tem ${guest.tasks.length} tarefas, ${guest.projects.length} projetos e ${guest.pages.length} páginas no modo local.`;}}catch{}}
    const show=!!account&&['offline','conflict','expired','error'].includes(phase);
    $('#sync-banner').hidden=!show;
    $('#sync-banner-text').textContent=phase==='conflict'?'Outro dispositivo alterou o espaço. Suas alterações foram preservadas; escolha como continuar.':messages[phase];
    $('#account-submit').disabled=!available||busy;
    document.querySelectorAll('[data-account-action]').forEach(button=>button.disabled=busy||connecting);
  }
  function setPhase(value){phase=value;update();}
  async function callApi(method='GET',body,active=session){
    if(!active?.access_token)throw Object.assign(Error('Entre novamente para sincronizar.'),{status:401});
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch('/api/workspace',{method,headers:{Authorization:'Bearer '+active.access_token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal});
      const result=await response.json();
      if(!response.ok&&response.status!==409)throw Object.assign(Error(result.error||'Não foi possível sincronizar.'),{status:response.status});
      if(!result.user?.id||!Number.isSafeInteger(result.revision))throw Error('A conta retornou dados inválidos.');
      if(result.user.id!==active.user.id)throw Object.assign(Error('A sessão não corresponde à conta. Entre novamente.'),{status:401});
      return {...result,conflict:response.status===409};
    }finally{clearTimeout(timeout);}
  }
  async function freshSession(owner=account?.id){
    const result=await client.auth.getSession(),active=result.data?.session;
    if(result.error||!active||active.user.id!==owner)throw Object.assign(Error('Sua sessão mudou. Entre novamente para sincronizar.'),{status:401});
    return active;
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(flush,700);}
  save=function(){
    if(!account)return guestSave();
    const serialized=JSON.stringify(state),previous={dirty,writeId,lastData};
    if(serialized!==lastData){dirty=true;writeId=D.id();lastData=serialized;}
    try{persist();}catch{({dirty,writeId,lastData}=previous);setPhase('error');toast('Não foi possível salvar nesta conta. Exporte uma cópia para preservar as alterações.');return false;}
    if(dirty&&!conflict){setPhase(navigator.onLine===false?'offline':'pending');schedule();}else update();
    return true;
  };
  async function flush(){
    if(!account||!dirty||conflict||flight||connecting)return;
    if(navigator.onLine===false){setPhase('offline');return;}
    const operation={generation,id:account.id},payload=JSON.parse(JSON.stringify(state)),sent=JSON.stringify(payload),sentId=writeId,expected=revision;
    flight=operation;setPhase('pending');
    try{
      const active=await freshSession(operation.id);if(operation.generation!==generation)return;
      const result=await callApi('PUT',{data:payload,revision:expected,writeId:sentId},active);
      if(operation.generation!==generation||operation.id!==account?.id)return;
      if(result.conflict){conflict=result;setPhase('conflict');return;}
      revision=result.revision;dirty=JSON.stringify(state)!==sent;
      persist();setPhase(dirty?'pending':'clean');
    }catch(error){if(operation.generation===generation){setPhase(error.status===401?'expired':'offline');message(error.message,true);}}
    finally{if(flight===operation){flight=null;if(dirty&&phase==='pending')schedule();}}
  }
  function restoreGuest(){
    clearTimeout(timer);generation++;flight=null;account=null;revision=0;dirty=false;conflict=null;latestBackup='';lastCacheRaw='';reconnecting=false;
    try{state=guestData();loadError=guestError;}catch{state=S.empty();loadError='Os dados locais não puderam ser lidos. A cópia original foi preservada.';}
    phase='local';render();update();
  }
  async function acceptSession(next){
    if(next&&account&&next.user.id===account.id){session=next;if(dirty&&!conflict)schedule();return;}
    if(connecting&&next?.user?.id===session?.user?.id)return;
    if(!next){session=null;connecting=false;generation++;if(account)restoreGuest();else{phase='local';update();}return;}
    if(account)restoreGuest();
    session=next;const current=++generation;connecting=true;setPhase('connecting');
    try{
      const remote=await callApi('GET',undefined,next);
      if(current!==generation)return;
      lastCacheRaw=localStorage.getItem(cacheKey(remote.user.id))||'';
      const cached=S.parseCache(lastCacheRaw),resolved=S.reconcile(remote,cached);
      // Save guest edits made while the account was connecting, before switching views.
      guestSave();account=remote.user;state=resolved.data;revision=resolved.revision;dirty=resolved.dirty;
      writeId=cached?.writeId||D.id();lastData=JSON.stringify(state);loadError='';conflict=resolved.conflict?remote:null;
      latestBackup=Object.keys(localStorage).filter(key=>key.startsWith(cacheKey(account.id)+'.backup.')).sort().at(-1)||'';
      persist();phase=conflict?'conflict':dirty?'pending':'clean';reconnecting=authMode==='recovery';render();message('');
    }catch(error){
      if(current!==generation)return;
      // An authenticated account's offline copy never replaces the guest's storage slot.
      try{
        lastCacheRaw=localStorage.getItem(cacheKey(next.user.id))||'';const cached=S.parseCache(lastCacheRaw);
        if(cached&&error.status!==401){guestSave();account={id:next.user.id,email:next.user.email};state=cached.data;revision=cached.revision;dirty=cached.dirty;writeId=cached.writeId;lastData=JSON.stringify(state);loadError='';phase='offline';render();}
        else phase='error';
      }catch{phase='error';}
      message(error.message,true);
    }finally{if(current===generation){connecting=false;update();if(dirty&&!conflict&&phase==='pending')schedule();}}
  }
  function editing(){return !!$('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);}
  async function refresh(){
    if(!account||connecting||flight||conflict)return;
    if(dirty){await flush();return;}
    if(editing()||navigator.onLine===false)return;
    const current=generation;
    try{
      const active=await freshSession(),remote=await callApi('GET',undefined,active);
      if(current!==generation||dirty||editing())return;
      if(remote.revision!==revision){state=remote.data?D.normalize(remote.data):S.empty();revision=remote.revision;lastData=JSON.stringify(state);writeId=D.id();persist();render();}
      setPhase('clean');
    }catch(error){if(current===generation)setPhase(error.status===401?'expired':'offline');}
  }
  function setAuthMode(mode){
    authMode=mode;message('');
    const recovery=mode==='recovery',reset=mode==='reset';
    $('#account-email-label').hidden=recovery;$('#account-email-input').disabled=recovery;
    $('#account-password-label').hidden=reset;$('#account-password').disabled=reset;
    $('#account-password').minLength=mode==='signup'||recovery?10:1;
    $('#account-password').autocomplete=mode==='signin'?'current-password':'new-password';
    $('#account-password-label').firstChild.textContent=recovery?'Nova senha':'Senha';
    $('#account-submit').textContent=mode==='signup'?'Criar conta':reset?'Enviar recuperação':recovery?'Salvar nova senha':'Entrar';
    $('#account-forgot').textContent=mode==='signin'?'Esqueci minha senha':'Voltar para entrar';
    $('#account-tabs').hidden=recovery||reset;
    document.querySelectorAll('[data-auth-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.authMode===mode)));
    update();
  }
  function open(){update();if(!dialog.open)dialog.showModal();if(authMode==='recovery')$('#account-password').focus();else if(!account)$('#account-email-input').focus();}
  $('#account-open').onclick=open;$('#sync-banner-action').onclick=open;
  $('#account-forgot').onclick=()=>setAuthMode(authMode==='signin'?'reset':'signin');
  document.querySelectorAll('[data-auth-mode]').forEach(button=>button.onclick=()=>setAuthMode(button.dataset.authMode));
  $('#account-form').onsubmit=async event=>{
    event.preventDefault();if(!client||busy)return;
    busy=true;update();message('Aguarde…');
    try{
      const email=$('#account-email-input').value.trim(),password=$('#account-password').value;
      const redirect=new URL('/',location.origin).href;
      let result;
      if(authMode==='signup')result=await client.auth.signUp({email,password,options:{emailRedirectTo:redirect}});
      else if(authMode==='reset')result=await client.auth.resetPasswordForEmail(email,{redirectTo:redirect});
      else if(authMode==='recovery')result=await client.auth.updateUser({password});
      else result=await client.auth.signInWithPassword({email,password});
      if(result.error){
        const code=result.error.code;
        throw Error(code==='invalid_credentials'?'E-mail ou senha incorretos.':code==='email_not_confirmed'?'Confirme seu e-mail antes de entrar.':code==='over_email_send_rate_limit'?'Aguarde alguns minutos antes de solicitar outro e-mail.':'Não foi possível concluir. Verifique os dados e tente novamente.');
      }
      $('#account-password').value='';
      if(authMode==='signup')message('Confira seu e-mail para confirmar a conta. Depois, volte para entrar.');
      else if(authMode==='reset')message('Se houver uma conta para esse e-mail, você receberá as instruções de recuperação.');
      else if(authMode==='recovery'){setAuthMode('signin');reconnecting=false;message('Senha atualizada.');}
      else{await acceptSession(result.data.session);message(account?'Conta conectada. Você pode importar os dados locais quando quiser.':'Não foi possível abrir o espaço da conta.',!account);}
    }catch(error){message(error.message,true);}finally{busy=false;update();}
  };
  function download(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-account-action]');if(!button||busy||!account)return;
    const action=button.dataset.accountAction;
    if(action==='export'){download(state,'clareza-conta-'+D.dateKey()+'.json');return;}
    if(action==='backup'){try{const stored=JSON.parse(localStorage.getItem(latestBackup));download(stored.data,'clareza-copia-anterior-'+D.dateKey()+'.json');}catch{message('Não foi possível abrir a cópia anterior.',true);}return;}
    if(action==='reconnect'){reconnecting=true;setAuthMode('signin');$('#account-email-input').value=account.email||'';update();return;}
    if(action==='sync'){if(dirty)await flush();else{dialog.close();await refresh();}return;}
    if(action==='import'){
      if(conflict){message('Resolva as duas versões antes de importar.',true);return;}
      try{const before=state;state=D.merge(state,guestData());if(!save()){state=before;return;}render();message('Dados locais adicionados à conta. A cópia local foi mantida.');}catch{message('Não foi possível ler os dados locais. A cópia foi preservada.',true);}return;
    }
    if(action==='use-remote'||action==='use-local'){
      if(!conflict)return;
      try{
        if(action==='use-remote'){backup(state,'Minha versão antes de carregar a conta');state=conflict.data?D.normalize(conflict.data):S.empty();revision=conflict.revision;dirty=false;writeId=D.id();lastData=JSON.stringify(state);conflict=null;persist();render();setPhase('clean');}
        else{backup(conflict.data||S.empty(),'Versão da conta antes de substituir');revision=conflict.revision;conflict=null;dirty=true;writeId=D.id();persist();setPhase('pending');schedule();}
        message('Escolha aplicada. A cópia anterior está disponível para baixar.');
      }catch{message('Não há espaço para guardar a cópia anterior. Exporte o espaço antes de continuar.',true);}return;
    }
    if(action==='logout'){
      if(!save())return;
      busy=true;update();
      try{const result=await client.auth.signOut({scope:'local'});if(result.error)throw Error('Não foi possível sair. Verifique sua conexão e tente novamente.');session=null;connecting=false;restoreGuest();message('Você saiu. A cópia da conta permanece separada dos dados locais.');}
      catch(error){message(error.message,true);}finally{busy=false;update();}
    }
  });
  window.addEventListener('online',()=>{if(dirty)flush();else refresh();});
  window.addEventListener('storage',event=>{
    if(!account||event.key!==cacheKey(account.id)||!event.newValue||dirty||editing())return;
    try{const other=S.parseCache(event.newValue);if(!other.dirty&&other.revision>=revision){state=other.data;revision=other.revision;lastData=JSON.stringify(state);lastCacheRaw=event.newValue;writeId=other.writeId;render();setPhase('clean');}}catch{}
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.ClarezaAccount={accessToken:async()=>account?(await freshSession()).access_token:null};
  async function initialize(){
    try{
      let config;
      try{
        const response=await fetch('/api/config',{signal:AbortSignal.timeout(10000)});config=await response.json();
        if(!response.ok)throw Error('Configuração indisponível');
        if(config.configured){try{localStorage.setItem('clareza.public-config',JSON.stringify({configured:true,url:config.url,publishableKey:config.publishableKey}));}catch{}}
      }catch{try{config=JSON.parse(localStorage.getItem('clareza.public-config')||'null');}catch{}}
      if(!config?.configured||!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(config.url)||!String(config.publishableKey).startsWith('sb_publishable_')){message('As contas online ainda não estão disponíveis. Você pode continuar usando o espaço local.');update();return;}
      client=ClarezaAuth.createClient(config.url,config.publishableKey,{auth:{flowType:'pkce',storageKey:'clareza.auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      available=true;
      client.auth.onAuthStateChange((event,next)=>{setTimeout(()=>{if(event==='PASSWORD_RECOVERY'){reconnecting=true;setAuthMode('recovery');open();}acceptSession(next);},0);});
      const result=await client.auth.getSession();if(result.error)throw result.error;
      await acceptSession(result.data.session);update();setInterval(refresh,30000);
    }catch{message('Não foi possível conectar as contas. O modo local continua disponível.',true);update();}
  }
  initialize();
})();
