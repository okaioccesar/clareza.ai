/**
 * The workspace currently on screen and how it is persisted.
 * Without an account it lives in localStorage; the account module swaps in its own saver.
 */
import type { Workspace } from '../core/model.ts';
import { emptyWorkspace, normalize } from '../core/workspace.ts';
import { maybe } from './dom.ts';

export const GUEST_KEY = 'clareza.workspace.v3';
const LEGACY_KEYS = ['clareza.workspace.v2', 'clareza.tasks.v1'];

type Saver = () => boolean;

let workspace: Workspace = emptyWorkspace();
let loadError = '';
let saver: Saver = saveGuest;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
const errorListeners: ((message: string) => void)[] = [];

/** Reads the browser's local (guest) workspace, migrating older formats. Throws if unreadable. */
export function readGuest(): Workspace {
  const current = localStorage.getItem(GUEST_KEY) ?? localStorage.getItem(LEGACY_KEYS[0]!);
  if (current) return normalize(JSON.parse(current));
  return normalize({ tasks: JSON.parse(localStorage.getItem(LEGACY_KEYS[1]!) || '[]') });
}

export function loadGuest() {
  try {
    workspace = readGuest();
    loadError = '';
  } catch {
    workspace = emptyWorkspace();
    loadError = 'Não foi possível ler os dados salvos. Exporte uma cópia antes de alterar o espaço.';
  }
}

export const store = {
  get data(): Workspace {
    return workspace;
  },
  replace(next: Workspace) {
    workspace = next;
  },
  get loadError() {
    return loadError;
  },
  set loadError(message: string) {
    loadError = message;
  },
};

export function setStatus(text: string) {
  const status = maybe('#save-status');
  if (status) status.textContent = text;
}

/** Reports persistence errors to the UI (registered by the toast module). */
export function onSaveError(listener: (message: string) => void) {
  errorListeners.push(listener);
}

function fail(message: string) {
  errorListeners.forEach((listener) => listener(message));
}

export function saveGuest(): boolean {
  if (loadError) {
    fail(loadError);
    return false;
  }
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(workspace));
    setStatus('Salvo localmente');
    return true;
  } catch {
    setStatus('Falha ao salvar');
    fail('Não foi possível salvar. Exporte seu espaço para preservar as alterações.');
    return false;
  }
}

/** Replaces how the workspace is saved (null restores guest storage). */
export function useSaver(next: Saver | null) {
  saver = next ?? saveGuest;
}

export function save(): boolean {
  clearTimeout(autosaveTimer);
  autosaveTimer = undefined;
  return saver();
}

/** Debounced save for typing in notes and pages. */
export function autosave() {
  clearTimeout(autosaveTimer);
  setStatus('Salvando…');
  autosaveTimer = setTimeout(save, 300);
}

/** Saves pending autosaves immediately (before navigation or unload). */
export function flushAutosave() {
  if (autosaveTimer !== undefined) save();
}

export const find = {
  task: (id: string | undefined) => workspace.tasks.find((t) => t.id === id),
  project: (id: string | undefined) => workspace.projects.find((p) => p.id === id),
  page: (id: string | undefined) => workspace.pages.find((p) => p.id === id),
  area: (id: string | undefined) => workspace.areas.find((a) => a.id === id),
};
