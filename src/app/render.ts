/** Renders the current view and the navigation, and keeps keyboard focus stable across renders. */
import { isInbox } from '../core/workspace.ts';
import { $, all, html, maybe, type Raw } from './dom.ts';
import { hydrateIcons, icon, type IconName } from './icons.ts';
import { find, flushAutosave, save, store } from './store.ts';
import { toast } from './toast.ts';
import { hashFor, parseHash, restoreViewPreference, ui, type View } from './ui.ts';
import { brand } from '../brand.ts';
import { colorDot } from './components/common.ts';
import { todayView } from './views/today.ts';
import { allTasksView, areaView, inboxView, projectView, spaceView } from './views/collections.ts';
import { weekView } from './views/week.ts';
import { pageView } from './views/page.ts';
import { reviewView } from './views/review.ts';

const NAVIGATION: [View, IconName, string][] = [
  ['today', 'sun', 'Hoje'],
  ['all', 'list', 'Tarefas'],
  ['week', 'calendar', 'Semana'],
  ['review', 'sparkle', 'Revisão'],
  ['space', 'folder', 'Meu espaço'],
];

const VIEWS: Record<View, () => Raw> = {
  today: todayView,
  all: allTasksView,
  week: weekView,
  review: reviewView,
  space: spaceView,
  area: areaView,
  project: projectView,
  page: pageView,
  inbox: inboxView,
};

/** Which top-level navigation item is highlighted for each view. */
function section(view: View): View {
  return ['area', 'project', 'page', 'inbox'].includes(view) ? 'space' : view;
}

function title(): string {
  const { view, id } = ui.route;
  if (view === 'area') return find.area(id)?.title || 'Área';
  if (view === 'project') return find.project(id)?.title || 'Projeto';
  if (view === 'page') return find.page(id)?.title || 'Página';
  if (view === 'inbox') return 'Caixa de entrada';
  return NAVIGATION.find(([key]) => key === view)?.[2] ?? 'Hoje';
}

function navButton(view: View, symbol: Raw, label: string, active: boolean, id = '', extra: Raw | string = ''): Raw {
  return html`<button
    type="button"
    class="nav-item ${active ? 'active' : ''}"
    data-action="nav"
    data-view="${view}"
    data-id="${id}"
    title="${label}"
    ${active ? html`aria-current="page"` : ''}
  >
    ${symbol}<span class="nav-label">${label}</span>${extra}
  </button>`;
}

export function renderNav() {
  const data = store.data;
  const current = section(ui.route.view);
  const inbox = data.tasks.filter(isInbox).length;

  $('#navigation').innerHTML = NAVIGATION.map(([view, symbol, label]) =>
    navButton(
      view,
      icon(symbol),
      label,
      current === view,
      '',
      view === 'space' && inbox ? html`<span class="nav-count" title="Na caixa de entrada">${inbox}</span>` : '',
    ),
  ).join('');

  $('#area-nav').innerHTML = data.areas.length
    ? data.areas
        .map((a) =>
          navButton('area', colorDot(a.color), a.title, ui.route.view === 'area' && ui.route.id === a.id, a.id),
        )
        .join('')
    : html`<button type="button" class="nav-item muted" data-action="new-area">
        ${icon('plus')}<span class="nav-label">Criar uma área</span>
      </button>`.html;

  const favorites = data.pages.filter((p) => p.favorite).slice(0, 8);
  $('#page-nav').innerHTML = favorites.length
    ? favorites
        .map((p) => navButton('page', icon('file'), p.title, ui.route.view === 'page' && ui.route.id === p.id, p.id))
        .join('')
    : html`<span class="nav-empty">Favorite uma página para fixá-la aqui.</span>`.html;

  const tabbar = maybe('#tabbar');
  if (tabbar)
    tabbar.innerHTML = html`${NAVIGATION.filter(([view]) => view !== 'review').map(
      ([view, symbol, label]) =>
        html`<button
          type="button"
          class="${current === view ? 'active' : ''}"
          data-action="nav"
          data-view="${view}"
          ${current === view ? html`aria-current="page"` : ''}
        >
          ${icon(symbol)}<span>${label}</span>
        </button>`,
    )}`.html;
}

// ——— Focus preservation ———
// Re-rendering replaces the view's HTML. Remember what had focus and find its replacement.

interface SavedFocus {
  element: HTMLElement;
  id: string;
  key?: string;
  action?: string;
  view?: string;
  entity?: string;
  change?: string;
  tag: string;
  neighbour?: string;
  start: number | null;
  end: number | null;
}

function rememberFocus(): SavedFocus | null {
  const element = document.activeElement as HTMLElement | null;
  if (!element || element === document.body) return null;
  if (!$('#view').contains(element) && !$('#sidebar').contains(element)) return null;
  const row = element.closest<HTMLElement>('[data-task-row]');
  const input = element as HTMLInputElement;
  const selectable = 'selectionStart' in input && typeof input.selectionStart === 'number';
  return {
    element,
    id: element.id,
    key: element.dataset.focusKey,
    action: element.dataset.action,
    view: element.dataset.view,
    entity: element.dataset.id,
    change: element.dataset.change,
    tag: element.tagName,
    neighbour:
      (row?.nextElementSibling as HTMLElement | null)?.dataset.taskRow ||
      (row?.previousElementSibling as HTMLElement | null)?.dataset.taskRow,
    start: selectable ? input.selectionStart : null,
    end: selectable ? input.selectionEnd : null,
  };
}

function restoreFocus(saved: SavedFocus | null, routeChanged: boolean) {
  if (!saved || saved.element.isConnected) return;
  let next: HTMLElement | null = saved.id ? document.getElementById(saved.id) : null;
  if (!next && !routeChanged)
    next =
      all('#view [data-focus-key], #view [data-action], #sidebar [data-action], #view [data-change]').find((el) =>
        saved.key
          ? el.dataset.focusKey === saved.key
          : el.tagName === saved.tag &&
            el.dataset.action === saved.action &&
            el.dataset.view === saved.view &&
            el.dataset.id === saved.entity &&
            el.dataset.change === saved.change,
      ) ?? null;
  // A completed task left the list: move to the neighbouring task instead of losing focus.
  if (!next && saved.neighbour && !routeChanged)
    next =
      all('[data-task-row]')
        .find((el) => el.dataset.taskRow === saved.neighbour)
        ?.querySelector('input') ?? null;
  if (!next && !routeChanged && saved.element.closest('.task-row')) next = maybe('#quick-task-title');
  if (!next) return;
  next.focus({ preventScroll: true });
  if (saved.start !== null && (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement)) {
    try {
      next.setSelectionRange(saved.start, saved.end);
    } catch {
      /* Some input types do not support selection. */
    }
  }
}

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let lastRoute = '';

export function render() {
  const focus = rememberFocus();
  const key = ui.route.view + '/' + ui.route.id;
  const routeChanged = !!lastRoute && lastRoute !== key;

  renderNav();
  const label = title();
  $('#breadcrumb').textContent = label;
  $('.breadcrumb').classList.toggle('nested', section(ui.route.view) !== ui.route.view);
  document.title = `${label} · ${brand.name}`;
  const view = $('#view');
  view.className = 'view view-' + ui.route.view;
  view.innerHTML = VIEWS[ui.route.view]().html;
  hydrateIcons(view);
  resizeBlocks();

  restoreFocus(focus, routeChanged);
  if (routeChanged && document.body.dataset.input === 'keyboard') view.focus({ preventScroll: true });
  if (routeChanged && !reduceMotion() && view.animate)
    view.animate(
      [
        { opacity: 0.4, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  lastRoute = key;
  document.dispatchEvent(new Event('clareza:rendered'));
}

/** Grows page-block textareas to fit their content. */
export function resizeBlocks(root: ParentNode = document) {
  root.querySelectorAll<HTMLTextAreaElement>('.block-input').forEach((element) => {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  });
}

/** Saves, re-renders and optionally confirms with a toast (with undo). */
export function commit(message?: string, undo?: () => void): boolean {
  const ok = save();
  render();
  if (ok && message) toast(message, undo);
  return ok;
}

export function navigate(view: string, id = '') {
  flushAutosave();
  const hash = hashFor(view, id);
  if (location.hash === hash) readRoute();
  else location.hash = hash;
  document.dispatchEvent(new Event('clareza:navigated'));
}

export function readRoute() {
  ui.route = parseHash(location.hash);
  ui.query = '';
  ui.projectFilter = '';
  restoreViewPreference();
  render();
  window.scrollTo?.(0, 0);
}

/** Re-renders only the task results (used while typing in the search box). */
export function updateTaskResults(html: () => Raw) {
  const results = maybe('#task-results');
  if (!results) return;
  results.innerHTML = html().html;
  hydrateIcons(results);
}

export function showLoadError() {
  if (store.loadError) toast(store.loadError);
}
