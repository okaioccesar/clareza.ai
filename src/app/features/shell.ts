/** Sidebar (collapsible on desktop, drawer on mobile) and keyboard/pointer detection. */
import { $, all, storage } from '../dom.ts';
import { LOCKED_EVENT } from '../session.ts';

const STORAGE_KEY = 'clareza.sidebar';

export function setupShell() {
  const body = document.body;
  const sidebar = $('#sidebar');
  const main = $('main');
  const menu = $('#mobile-menu');
  const backdrop = $('#sidebar-backdrop');
  const collapse = $('#sidebar-collapse');
  const skip = $<HTMLAnchorElement>('.skip-link');
  const tabbar = document.getElementById('tabbar');
  const mobile = window.matchMedia('(max-width: 760px)');
  let compact = storage.get(STORAGE_KEY) === 'compact';

  // Focus rings appear only for keyboard users.
  body.dataset.input = 'keyboard';
  document.addEventListener('pointerdown', () => (body.dataset.input = 'pointer'), { capture: true, passive: true });
  document.addEventListener('keydown', () => (body.dataset.input = 'keyboard'), { capture: true });

  const isOpen = () => mobile.matches && sidebar.classList.contains('open');

  function sync() {
    const open = isOpen();
    body.dataset.sidebar = compact ? 'compact' : 'expanded';
    body.classList.toggle('mobile-nav-open', open);
    sidebar.toggleAttribute('inert', mobile.matches && !open);
    main.toggleAttribute('inert', open);
    skip.toggleAttribute('inert', open);
    if (tabbar) tabbar.toggleAttribute('inert', open);
    backdrop.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
    collapse.setAttribute('aria-expanded', String(!compact));
    const label = compact ? 'Expandir barra lateral' : 'Recolher barra lateral';
    collapse.setAttribute('aria-label', label);
    collapse.title = label;
  }

  function close({ restoreFocus = false } = {}) {
    sidebar.classList.remove('open');
    sync();
    if (restoreFocus) menu.focus({ preventScroll: true });
  }

  const focusContent = () => $('#view').focus({ preventScroll: true });

  // Keep Tab inside the drawer while it is open.
  sidebar.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !isOpen()) return;
    const stops = all('a[href],button,input,select,textarea,[tabindex]', sidebar).filter(
      (el) =>
        el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[hidden],[inert]') && el.getClientRects().length,
    );
    if (!stops.length) return;
    const first = stops[0]!;
    const last = stops.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  menu.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    sync();
    if (isOpen()) $('#navigation .nav-item')?.focus();
  });
  backdrop.addEventListener('click', () => close({ restoreFocus: true }));
  // Buttons in the drawer open a view or a dialog; the drawer gets out of the way.
  sidebar.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button');
    // Navigation buttons are handled by 'clareza:navigated', which also moves focus to the content.
    if (button && isOpen() && button.id !== 'areas-toggle' && button.dataset.action !== 'nav') close();
  });
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    focusContent();
  });
  collapse.addEventListener('click', () => {
    compact = !compact;
    storage.set(STORAGE_KEY, compact ? 'compact' : 'expanded');
    sync();
  });
  $('#areas-toggle').addEventListener('click', () => {
    const nav = $('#area-nav');
    nav.hidden = !nav.hidden;
    $('#areas-toggle').setAttribute('aria-expanded', String(!nav.hidden));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && body.classList.contains('mobile-nav-open')) close({ restoreFocus: true });
  });
  document.addEventListener(LOCKED_EVENT, () => close());
  document.addEventListener('clareza:navigated', () => {
    const wasOpen = isOpen();
    close();
    if (wasOpen) focusContent();
  });
  mobile.addEventListener?.('change', () => {
    // Resizing must never leave keyboard focus inside a region that just became hidden.
    const inSidebar = sidebar.contains(document.activeElement);
    const onMenu = document.activeElement === menu;
    close({ restoreFocus: mobile.matches && inSidebar });
    if (!mobile.matches && onMenu) focusContent();
  });

  sync();
}
