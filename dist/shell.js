/* Navigation preferences are independent of workspace data. */
(function () {
  const storageKey = 'clareza.sidebar';
  const body = document.body;
  const sidebar = $('#sidebar');
  const main = $('main');
  const menu = $('#mobile-menu');
  const backdrop = $('#sidebar-backdrop');
  const collapse = $('#sidebar-collapse');
  const skipLink = $('.skip-link');
  const mobile = window.matchMedia('(max-width:700px)');
  let compact = false;

  try { compact = localStorage.getItem(storageKey) === 'compact'; } catch {}

  body.dataset.input = 'keyboard';
  document.addEventListener('pointerdown', () => { body.dataset.input = 'pointer'; }, { capture: true, passive: true });
  document.addEventListener('keydown', () => { body.dataset.input = 'keyboard'; }, { capture: true });

  function isMenuOpen() {
    return mobile.matches && sidebar.classList.contains('open');
  }

  function syncNavigation() {
    const open = isMenuOpen();
    body.dataset.sidebar = compact ? 'compact' : 'expanded';
    body.classList.toggle('mobile-nav-open', open);
    sidebar.inert = mobile.matches && !open;
    main.inert = open;
    skipLink.inert = open;
    backdrop.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
    collapse.setAttribute('aria-expanded', String(!compact));
    collapse.setAttribute('aria-label', compact ? 'Expandir barra lateral' : 'Recolher barra lateral');
    collapse.title = collapse.getAttribute('aria-label');
  }

  function focusContent() {
    $('#view').focus({ preventScroll: true });
  }

  function closeMenu({ restoreFocus = false } = {}) {
    sidebar.classList.remove('open');
    syncNavigation();
    if (restoreFocus) menu.focus({ preventScroll: true });
  }

  function trapMenuFocus(event) {
    if (event.key !== 'Tab' || !isMenuOpen()) return;
    const stops = [...sidebar.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') &&
        !element.closest('[hidden],[inert]') && element.getClientRects().length);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  menu.onclick = () => {
    sidebar.classList.toggle('open');
    syncNavigation();
    if (isMenuOpen()) $('#navigation .nav-item')?.focus();
  };
  backdrop.onclick = () => closeMenu({ restoreFocus: true });
  skipLink.onclick = event => {
    event.preventDefault();
    focusContent();
  };
  collapse.onclick = () => {
    compact = !compact;
    try { localStorage.setItem(storageKey, compact ? 'compact' : 'expanded'); } catch {}
    syncNavigation();
  };

  sidebar.addEventListener('keydown', trapMenuFocus);
  document.addEventListener('clareza:workspace-locked', () => closeMenu());
  document.addEventListener('keydown', event => {
    // app.js may already have removed .open; body retains the state until sync.
    if (event.key === 'Escape' && body.classList.contains('mobile-nav-open')) {
      closeMenu({ restoreFocus: true });
    }
  });
  mobile.addEventListener('change', () => {
    // Resizing must never strand keyboard focus in a newly hidden region.
    const focusInSidebar = sidebar.contains(document.activeElement);
    const focusOnMenu = document.activeElement === menu;
    closeMenu({ restoreFocus: mobile.matches && focusInSidebar });
    if (!mobile.matches && focusOnMenu) focusContent();
  });

  const previousNavigate = navigate;
  navigate = function (...args) {
    const wasOpen = isMenuOpen();
    previousNavigate(...args);
    syncNavigation();
    if (wasOpen) focusContent();
  };
  document.addEventListener('click', event => {
    if (!event.target.closest('#sidebar a[href^="#"]')) return;
    const wasOpen = isMenuOpen();
    closeMenu();
    if (wasOpen) focusContent();
  });

  const previousRenderNav = renderNav;
  renderNav = function () {
    previousRenderNav();
    document.querySelectorAll('#sidebar .nav-item').forEach(button => {
      button.title = button.textContent.trim();
      if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  };

  syncNavigation();
  renderNav();
})();
