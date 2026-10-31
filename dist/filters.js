/* Progressive enhancement: retain native selects as the source of filter state. */
(() => {
  function enhance() {
    document.querySelectorAll('select:not([data-enhanced])').forEach(select => {
      select.dataset.enhanced = 'true';
      const fieldName = select.getAttribute('aria-label') || select.labels?.[0]?.firstChild?.textContent?.trim() || select.name || 'Selecionar';
      const picker = document.createElement('details');
      picker.className = 'filter-picker';
      const trigger = document.createElement('summary');
      const label = document.createElement('span');
      const arrow = document.createElement('span');
      arrow.textContent = '⌄'; arrow.setAttribute('aria-hidden','true');
      trigger.append(label,arrow);
      const options = document.createElement('div');
      options.className = 'filter-options';
      options.setAttribute('role','group');
      options.setAttribute('aria-label',fieldName);
      const sync = () => {
        label.textContent = select.selectedOptions[0]?.textContent || '';
        trigger.setAttribute('aria-label',fieldName + ': ' + label.textContent);
        options.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.value === select.value)));
      };
      for (const option of select.options) {
        const button = document.createElement('button');
        button.type = 'button'; button.disabled = option.disabled; button.textContent = option.textContent;
        button.dataset.value = option.value;
        button.onclick = () => {
          select.value = option.value;
          sync(); picker.open = false; trigger.focus();
          select.dispatchEvent(new Event('change',{bubbles:true}));
        };
        options.append(button);
      }
      select.before(picker); select.hidden = true;
      picker.append(trigger,options,select);
      select.addEventListener('change',sync);
      picker.addEventListener('toggle',() => {
        if (picker.open) document.querySelectorAll('.filter-picker[open]').forEach(other => { if (other !== picker) other.open = false; });
      });
      picker.addEventListener('keydown',event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); picker.open = false; trigger.focus(); }
        if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
          event.preventDefault(); picker.open = true;
          const buttons = [...options.querySelectorAll('button')];
          const index = buttons.indexOf(document.activeElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (index < 0 && event.key === 'ArrowUp' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length);
          buttons[next]?.focus();
        }
      });
      picker.addEventListener('focusout',event => { if (!picker.contains(event.relatedTarget)) picker.open = false; });
      sync();
    });
  }
  document.addEventListener('click',event => document.querySelectorAll('.filter-picker[open]').forEach(picker => {
    if (!picker.contains(event.target)) picker.open = false;
  }));
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  enhance();
})();
