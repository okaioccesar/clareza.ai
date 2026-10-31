/* A themed calendar; the original date input remains the form's source of truth. */
(() => {
  const key = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  function enhanceDates() {
    document.querySelectorAll('input[type="date"]:not([data-calendar])').forEach(input => {
      input.dataset.calendar='true';
      const picker=document.createElement('details');picker.className='filter-picker date-picker';
      const trigger=document.createElement('summary');
      const panel=document.createElement('div');panel.className='filter-options calendar-panel';
      const name=input.getAttribute('aria-label')||input.labels?.[0]?.textContent.trim()||'Prazo';
      let month=new Date();month.setDate(1);
      const sync=()=>{trigger.textContent=input.value?new Date(input.value+'T12:00:00').toLocaleDateString('pt-BR'):'Sem prazo';trigger.setAttribute('aria-label',name+': '+trigger.textContent);};
      const choose=value=>{input.value=value;input.setCustomValidity('');sync();picker.open=false;trigger.focus();input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
      function button(text,label,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.onclick=action;return b;}
      function draw(){
        panel.replaceChildren();
        const heading=document.createElement('div');heading.className='calendar-heading';
        const title=document.createElement('strong');title.textContent=month.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
        const move=offset=>{month.setMonth(month.getMonth()+offset);draw();panel.querySelector(offset<0?'button':'button:last-child')?.focus();};
        heading.append(button('‹','Mês anterior',()=>move(-1)),title,button('›','Próximo mês',()=>move(1)));panel.append(heading);
        const grid=document.createElement('div');grid.className='calendar-grid';
        ['D','S','T','Q','Q','S','S'].forEach(day=>{const label=document.createElement('span');label.textContent=day;label.setAttribute('aria-hidden','true');grid.append(label);});
        for(let i=0;i<month.getDay();i++)grid.append(document.createElement('span'));
        const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
        for(let day=1;day<=days;day++){
          const date=new Date(month.getFullYear(),month.getMonth(),day,12),value=key(date);
          const b=button(String(day),date.toLocaleDateString('pt-BR',{dateStyle:'full'}),()=>choose(value));
          b.dataset.date=value;b.setAttribute('aria-pressed',String(value===input.value));
          if(value===key(new Date()))b.setAttribute('aria-current','date');
          b.disabled=!!((input.min&&value<input.min)||(input.max&&value>input.max));grid.append(b);
        }
        grid.addEventListener('keydown',event=>{const offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(!offset)return;const buttons=[...grid.querySelectorAll('button')];const index=buttons.indexOf(event.target);if(index<0)return;event.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,index+offset))]?.focus();});
        panel.append(grid);const footer=document.createElement('div');footer.className='calendar-footer';footer.append(button('Sem prazo','Remover prazo',()=>choose('')),button('Hoje','Selecionar hoje',()=>choose(key(new Date()))));panel.append(footer);
      }
      input.before(picker);input.hidden=true;picker.append(trigger,panel,input);sync();
      input.addEventListener('input',sync);input.addEventListener('change',sync);
      picker.addEventListener('toggle',()=>{if(picker.open){month=input.value?new Date(input.value+'T12:00:00'):new Date();month.setDate(1);draw();document.querySelectorAll('.filter-picker[open]').forEach(other=>{if(other!==picker)other.open=false;});}});
      picker.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();picker.open=false;trigger.focus();}});
      picker.addEventListener('focusout',event=>{if(!picker.contains(event.relatedTarget))picker.open=false;});
    });
  }
  new MutationObserver(enhanceDates).observe(document.body,{childList:true,subtree:true});enhanceDates();
})();
