/**
 * Loaded synchronously in <head> (built to dist/theme.js) so the saved theme is applied
 * before the first paint. Keeps the sun/moon buttons and the settings select in sync.
 */
(() => {
  const STORAGE_KEY = 'clareza.theme';
  const COLORS = { light: '#f7f6f3', dark: '#131312' };
  type Preference = 'light' | 'dark' | 'system';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  let preference: Preference = 'system';
  let transition: ReturnType<typeof setTimeout> | undefined;

  const normalize = (value: unknown): Preference => (value === 'light' || value === 'dark' ? value : 'system');

  function stopTransition() {
    clearTimeout(transition);
    root.classList.remove('theme-changing');
  }

  function apply(value: unknown, { persist = false, animate = false } = {}) {
    preference = normalize(value);
    const theme = preference === 'dark' || (preference === 'system' && system.matches) ? 'dark' : 'light';
    stopTransition();
    if (animate && root.dataset.theme !== theme) {
      root.classList.add('theme-changing');
      transition = setTimeout(stopTransition, 240);
    }
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme]);
    document.querySelectorAll<HTMLSelectElement>('[data-theme-picker]').forEach((select) => {
      if (select.value !== preference) {
        select.value = preference;
        select.dispatchEvent(new Event('change'));
      }
    });
    document
      .querySelectorAll<HTMLElement>('[data-theme-choice]')
      .forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme)));
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, preference);
      } catch {
        /* Storage can be blocked; the theme still applies for this page. */
      }
    }
  }

  try {
    preference = normalize(localStorage.getItem(STORAGE_KEY));
  } catch {
    preference = 'system';
  }
  apply(preference);

  system.addEventListener?.('change', () => preference === 'system' && apply('system'));
  document.addEventListener('DOMContentLoaded', () => apply(preference));
  document.addEventListener('click', (event) => {
    const button = (event.target as Element).closest?.<HTMLElement>('[data-theme-choice]');
    if (button) apply(button.dataset.themeChoice, { persist: true, animate: event.detail > 0 });
  });
  document.addEventListener('change', (event) => {
    const target = event.target as HTMLSelectElement;
    if (target.matches?.('[data-theme-picker]') && event.bubbles) apply(target.value, { persist: true });
  });
  document.addEventListener('keydown', stopTransition, { capture: true });
  // Another tab changed (or cleared) the preference.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea && event.storageArea !== localStorage) return;
    } catch {
      /* Ignore inaccessible storage. */
    }
    apply(event.newValue);
  });
})();
