/* Shell preferences are separate from workspace data. */
(function () {
  const body=document.body,sidebar=$('#sidebar'),main=$('main'),menu=$('#mobile-menu'),backdrop=$('#sidebar-backdrop'),collapse=$('#sidebar-collapse');
  const mobile=window.matchMedia('(max-width:700px)');
  let compact=false;
  try { compact=localStorage.getItem('clareza.sidebar')==='compact'; } catch {}
  body.dataset.input='keyboard';
  document.addEventListener('pointerdown',()=>body.dataset.input='pointer',{capture:true,passive:true});
  document.addEventListener('keydown',()=>body.dataset.input='keyboard',{capture:true});
  function sync() {
    const open=mobile.matches&&sidebar.classList.contains('open');
    body.dataset.sidebar=compact?'compact':'expanded';
    body.classList.toggle('mobile-nav-open',open);
    sidebar.inert=mobile.matches&&!open;
    main.inert=open;
    $('.skip-link').inert=open;
    backdrop.hidden=!open;
    menu.setAttribute('aria-expanded',String(open));
    collapse.setAttribute('aria-expanded',String(!compact));
    collapse.setAttribute('aria-label',compact?'Expandir barra lateral':'Recolher barra lateral');
    collapse.title=collapse.getAttribute('aria-label');
  }
  function closeMenu(restore=false) { sidebar.classList.remove('open');sync();if(restore)menu.focus(); }
  menu.onclick=()=>{const open=sidebar.classList.toggle('open');sync();if(open)$('#navigation .nav-item')?.focus();};
  backdrop.onclick=()=>closeMenu(true);
  $('.skip-link').onclick=event=>{event.preventDefault();$('#view').focus();};
  sidebar.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||!body.classList.contains('mobile-nav-open'))return;
    const stops=[...sidebar.querySelectorAll('a[href],button:not([disabled]),input,select,textarea')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));
    if(!stops.length)return;
    const first=stops[0],last=stops.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&body.classList.contains('mobile-nav-open'))closeMenu(true);});
  collapse.onclick=()=>{compact=!compact;try{localStorage.setItem('clareza.sidebar',compact?'compact':'expanded');}catch{}sync();};
  mobile.addEventListener('change',()=>closeMenu());
  const previousNavigate=navigate;
  navigate=function(...args){const wasOpen=mobile.matches&&sidebar.classList.contains('open');previousNavigate(...args);sync();if(wasOpen)$('#view').focus({preventScroll:true});};
  document.addEventListener('click',event=>{if(event.target.closest('#sidebar a[href^="#"]')){const wasOpen=mobile.matches&&sidebar.classList.contains('open');closeMenu();if(wasOpen)$('#view').focus({preventScroll:true});}});
  const previousNav=renderNav;
  renderNav=function(){previousNav();document.querySelectorAll('#sidebar .nav-item').forEach(button=>{button.title=button.textContent.trim();if(button.classList.contains('active'))button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});};
  sync();renderNav();
})();
