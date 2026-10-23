/* Apply the saved theme in the head, before the first paint. */
(function () {
  const storageKey = 'clareza.theme';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  let preference = 'system';
  let transitionTimer;

  function normalize(value) {
    return ['light', 'dark', 'system'].includes(value) ? value : 'system';
  }

  function stopTransition() {
    clearTimeout(transitionTimer);
    root.classList.remove('theme-changing');
  }

  function applyTheme(value, { persist = false, animate = false } = {}) {
    preference = normalize(value);
    const dark = preference === 'dark' || (preference === 'system' && systemTheme.matches);
    const theme = dark ? 'dark' : 'light';

    stopTransition();
    if (animate && root.dataset.theme !== theme) {
      root.classList.add('theme-changing');
      transitionTimer = setTimeout(stopTransition, 220);
    }

    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111722' : '#f4f6fa');
    document.querySelectorAll('[data-theme-picker]').forEach(select => {
      select.value = preference;
    });
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
    });

    if (persist) {
      try { localStorage.setItem(storageKey, preference); } catch { /* Storage can be blocked. */ }
    }
  }

  try { preference = normalize(localStorage.getItem(storageKey)); } catch {}
  applyTheme(preference);

  systemTheme.addEventListener('change', () => {
    if (preference === 'system') applyTheme('system');
  });
  document.addEventListener('DOMContentLoaded', () => applyTheme(preference));
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-theme-choice]');
    if (button) applyTheme(button.dataset.themeChoice, { persist: true, animate: event.detail > 0 });
  });
  document.addEventListener('change', event => {
    if (event.target.matches('[data-theme-picker]')) applyTheme(event.target.value, { persist: true });
  });
  document.addEventListener('keydown', stopTransition, { capture: true });
  window.addEventListener('storage', event => {
    // Clearing the preference in another tab restores the system theme.
    if (event.key === storageKey || event.key === null) {
      try { if (event.storageArea && event.storageArea !== localStorage) return; } catch {}
      applyTheme(event.newValue);
    }
  });
})();
