/** Rules for reconciling the account's offline copy with the server version. */
import type { Workspace } from './model.ts';
import { emptyWorkspace, normalize } from './workspace.ts';

export interface CacheRecord {
  format: 1;
  revision: number;
  data: Workspace;
  dirty: boolean;
  writeId: string;
}

export interface RemoteWorkspace {
  revision: number;
  data?: unknown;
}

export const empty = emptyWorkspace;

export function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export function parseCache(raw: string | null): CacheRecord | null {
  if (!raw) return null;
  const record = JSON.parse(raw);
  if (
    record?.format !== 1 ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 0 ||
    typeof record.writeId !== 'string'
  )
    throw new Error('A cópia local desta conta não pôde ser lida. Ela foi preservada.');
  return { ...record, data: normalize(record.data), dirty: !!record.dirty };
}

export interface Reconciled {
  data: Workspace;
  revision: number;
  dirty: boolean;
  conflict: boolean;
}

/**
 * Pending local edits win when the server has not moved since they were made.
 * When both sides changed, the local copy is kept and a conflict is reported.
 */
export function reconcile(remote: RemoteWorkspace, cache: CacheRecord | null): Reconciled {
  if (!remote || !Number.isSafeInteger(remote.revision) || remote.revision < 0)
    throw new Error('A conta retornou uma versão inválida.');
  const data = remote.data ? normalize(remote.data) : empty();
  if (cache?.dirty && !equal(cache.data, data)) {
    if (cache.revision === remote.revision)
      return { data: cache.data, revision: remote.revision, dirty: true, conflict: false };
    return { data: cache.data, revision: cache.revision, dirty: true, conflict: true };
  }
  return { data, revision: remote.revision, dirty: false, conflict: false };
}

export function hasContent(data: Workspace): boolean {
  return (
    data.tasks.length > 0 ||
    data.projects.length > 0 ||
    data.pages.length > 0 ||
    data.areas.length > 0 ||
    Object.values(data.daily).some(Boolean) ||
    !!data.scratch.trim()
  );
}
