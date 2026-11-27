/** View state: the current route and per-view display options. Nothing here is synced. */
import type { DayFilter } from '../core/day.ts';
import { dateKey } from '../core/dates.ts';
import { storage } from './dom.ts';

export const VIEWS = ['today', 'all', 'week', 'review', 'space', 'area', 'project', 'page', 'inbox'] as const;
export type View = (typeof VIEWS)[number];
export type Mode = 'list' | 'board';
export type StatusFilter = 'open' | 'all' | 'done';
export type Tab = 'areas' | 'projects' | 'pages' | 'tasks';

export const ui = {
  route: { view: 'today' as View, id: '' },
  mode: 'list' as Mode,
  status: 'open' as StatusFilter,
  projectFilter: '',
  query: '',
  weekOffset: 0,
  selectedDay: dateKey(),
  dayFilter: 'today' as DayFilter,
  spaceTab: 'areas' as Tab,
  areaTab: 'tasks' as Tab,
};

/** Old routes (#projects, #pages) open the matching tab of "Meu espaço". */
const ALIASES: Record<string, { view: View; tab: Tab }> = {
  projects: { view: 'space', tab: 'projects' },
  pages: { view: 'space', tab: 'pages' },
};

export function parseHash(hash: string): { view: View; id: string } {
  const [name = '', encoded = ''] = hash.replace(/^#/, '').split('/');
  let id = '';
  try {
    id = encoded ? decodeURIComponent(encoded) : '';
  } catch {
    /* A malformed id falls back to an empty one. */
  }
  const alias = ALIASES[name];
  if (alias) {
    ui.spaceTab = alias.tab;
    return { view: alias.view, id: '' };
  }
  return { view: (VIEWS as readonly string[]).includes(name) ? (name as View) : 'today', id };
}

export function hashFor(view: string, id = ''): string {
  return '#' + view + (id ? '/' + encodeURIComponent(id) : '');
}

// List/board mode and status filter are remembered per view, in this browser only.
const preferenceKey = () => `clareza.view.${ui.route.view}.${ui.route.id}`;

export function restoreViewPreference() {
  let saved: { mode?: string; status?: string } | null = null;
  try {
    saved = JSON.parse(storage.get(preferenceKey()) || 'null');
  } catch {
    saved = null;
  }
  ui.mode = saved?.mode === 'board' ? 'board' : 'list';
  ui.status = saved?.status === 'all' || saved?.status === 'done' ? saved.status : 'open';
}

export function saveViewPreference() {
  storage.set(preferenceKey(), JSON.stringify({ mode: ui.mode, status: ui.status }));
}
