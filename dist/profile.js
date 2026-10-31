(() => {
  const dialog=$('#profile-dialog'),form=$('#profile-form'),avatar=$('#profile-open');
  let owner=null,version=0;
  const photoURL=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};
  function display(user){
    const meta=user?.user_metadata||{},name=meta.display_name||meta.full_name||user?.email||'EU';
    const initials=name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
    avatar.replaceChildren(document.createTextNode(initials));
    const url=photoURL(meta.profile_photo??meta.avatar_url??'');
    if(url){const img=document.createElement('img');img.alt='';img.referrerPolicy='no-referrer';img.src=url;img.onerror=()=>img.remove();avatar.append(img);}
  }
  document.addEventListener('clareza:profile',event=>display(event.detail));
  avatar.onclick=async()=>{
    const current=++version;dialog.showModal();form.reset();$('#profile-message').textContent='Carregando perfil…';$('#profile-save').disabled=true;
    try{const user=await ClarezaAccount.profile();if(current!==version)return;if(!user)throw Error('Entre na sua conta para editar o perfil.');owner=user.id;const meta=user.user_metadata||{};
      $('#profile-display-name').value=meta.display_name||meta.full_name||'';$('#profile-bio').value=meta.bio||'';$('#profile-photo').value=meta.profile_photo??meta.avatar_url??'';
      display(user);$('#profile-message').textContent='';$('#profile-save').disabled=false;$('#profile-display-name').focus();
    }catch(error){if(current===version)$('#profile-message').textContent=error.message;}
  };
  form.onsubmit=async event=>{
    event.preventDefault();if($('#profile-save').disabled)return;
    const name=$('#profile-display-name').value.trim(),photo=$('#profile-photo').value.trim();
    if(!name){$('#profile-message').textContent='Preencha seu nome.';return;}
    if(photo&&!photoURL(photo)){$('#profile-message').textContent='Use um link HTTPS válido para a foto.';return;}
    const current=version;$('#profile-save').disabled=true;$('#profile-message').textContent='Salvando…';
    try{const user=await ClarezaAccount.profile();if(current!==version||user?.id!==owner)return;
      const saved=await ClarezaAccount.saveProfile({display_name:name,bio:$('#profile-bio').value.trim(),profile_photo:photo});
      if(current!==version)return;display(saved);$('#profile-message').textContent='Perfil salvo na sua conta.';
    }catch(error){if(current===version)$('#profile-message').textContent=error.message;}
    finally{if(current===version)$('#profile-save').disabled=false;}
  };
  document.addEventListener('clareza:workspace-locked',()=>{version++;owner=null;dialog.close();form.reset();display(null);});
})();
