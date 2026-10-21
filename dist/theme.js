(function () {
  const key = 'clareza.theme';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try { const stored = localStorage.getItem(key); if (['light','dark','system'].includes(stored)) preference = stored; } catch {}
  function apply(value, persist = false) {
    preference = ['light','dark','system'].includes(value) ? value : 'system';
    const dark = preference === 'dark' || preference === 'system' && media.matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111722' : '#f4f6fa');
    document.querySelectorAll('[data-theme-picker]').forEach(select => select.value = preference);
    if (persist) { try { localStorage.setItem(key, preference); } catch {} }
  }
  apply(preference);
  media.addEventListener('change', () => { if (preference === 'system') apply('system'); });
  document.addEventListener('DOMContentLoaded', () => apply(preference));
  document.addEventListener('change', event => { if (event.target.matches('[data-theme-picker]')) apply(event.target.value, true); });
  window.addEventListener('storage', event => { if (event.key === key) apply(event.newValue || 'system'); });
})();
