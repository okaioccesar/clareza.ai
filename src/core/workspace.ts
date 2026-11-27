/**
 * Validation, import and recurrence rules for the workspace document.
 * Everything that enters the app (storage, imports, the server) goes through `normalize`.
 */
import { BLOCK_TYPES, COLORS, REPEATS } from './model.ts';
import type { Area, Block, Color, Page, Project, Review, Status, Subtask, Task, Workspace } from './model.ts';
import { dateKey, daysInMonth, fromKey, isDateKey, isTime } from './dates.ts';

export const newId = (): string => globalThis.crypto.randomUUID();

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => !!value && typeof value === 'object';
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const color = (value: unknown): Color => (COLORS.includes(value as Color) ? (value as Color) : 'blue');
const titled = (value: unknown): value is Raw & { id: string; title: string } =>
  isObject(value) && typeof value.id === 'string' && typeof value.title === 'string';

/** Keeps the first record for each id. */
export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()];
}

/** Like `uniqueById`, but later records replace earlier ones (used when merging). */
function lastById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function emptyWorkspace(): Workspace {
  return { version: 3, areas: [], tasks: [], projects: [], pages: [], daily: {}, scratch: '', reviews: {} };
}

export function normalize(raw: unknown): Workspace {
  if (!isObject(raw) || !Array.isArray(raw.tasks)) throw new Error('Escolha uma exportação válida do aplicativo.');

  const areas: Area[] = uniqueById(
    list(raw.areas)
      .filter(titled)
      .map((a) => ({
        id: a.id,
        title: text(a.title, 200),
        description: text(a.description, 2000),
        color: color(a.color),
      })),
  );
  const areaId = (value: unknown) => (areas.some((a) => a.id === value) ? (value as string) : '');

  const projects: Project[] = uniqueById(
    list(raw.projects)
      .filter(titled)
      .map((p) => ({
        id: p.id,
        title: text(p.title, 200),
        description: text(p.description, 2000),
        color: color(p.color),
        archived: !!p.archived,
        areaId: areaId(p.areaId),
      })),
  );
  const projectId = (value: unknown) => (projects.some((p) => p.id === value) ? (value as string) : '');

  const pages: Page[] = uniqueById(
    list(raw.pages)
      .filter(titled)
      .map((p) => ({
        id: p.id,
        title: text(p.title, 200),
        areaId: areaId(p.areaId),
        projectId: projectId(p.projectId),
        favorite: !!p.favorite,
        updatedAt: isTimestamp(p.updatedAt) ? p.updatedAt : '',
        blocks: uniqueById(list(p.blocks).slice(0, 1000).filter(isObject).map(normalizeBlock)),
      })),
  );

  const tasks: Task[] = uniqueById(
    list(raw.tasks)
      .filter(titled)
      .map((t) => normalizeTask(t, areaId, projectId)),
  );

  const daily: Record<string, string> = {};
  if (isObject(raw.daily))
    for (const [key, value] of Object.entries(raw.daily)) if (isDateKey(key)) daily[key] = text(value, 5000);

  const reviews: Record<string, Review> = {};
  if (isObject(raw.reviews))
    for (const [key, value] of Object.entries(raw.reviews))
      if (isDateKey(key) && isObject(value)) reviews[key] = normalizeReview(value);

  return { version: 3, areas, tasks, projects, pages, daily, scratch: text(raw.scratch, 20000), reviews };
}

function normalizeBlock(b: Raw): Block {
  return {
    id: typeof b.id === 'string' ? b.id : newId(),
    type: BLOCK_TYPES.includes(b.type as Block['type']) ? (b.type as Block['type']) : 'text',
    text: text(b.text, 20000),
    checked: !!b.checked,
  };
}

function normalizeTask(
  t: Raw & { id: string },
  areaId: (v: unknown) => string,
  projectId: (v: unknown) => string,
): Task {
  const date = isDateKey(t.date) ? t.date : '';
  const done = !!t.done || t.status === 'done';
  const status: Status = done ? 'done' : t.status === 'doing' ? 'doing' : 'todo';
  const repeatDay = Number(t.repeatDay);
  return {
    id: t.id,
    title: text(t.title, 200),
    notes: text(t.notes, 2000),
    date,
    time: date && isTime(t.time) ? t.time : '',
    areaId: areaId(t.areaId),
    projectId: projectId(t.projectId),
    priority: t.priority === 'high' ? 'high' : 'normal',
    status,
    done,
    pinned: !!t.pinned,
    completedAt: isTimestamp(t.completedAt) ? t.completedAt : null,
    createdAt: text(t.createdAt, 50),
    repeat: date && REPEATS.includes(t.repeat as Task['repeat']) ? (t.repeat as Task['repeat']) : 'none',
    repeatDay:
      Number.isInteger(repeatDay) && repeatDay >= 1 && repeatDay <= 31 ? repeatDay : date ? Number(date.slice(-2)) : 1,
    nextTaskId: text(t.nextTaskId, 200),
    generatedFrom: text(t.generatedFrom, 200),
    subtasks: uniqueById(
      list(t.subtasks)
        .slice(0, 200)
        .filter((s): s is Raw => isObject(s) && typeof s.title === 'string')
        .map((s): Subtask => ({
          id: typeof s.id === 'string' ? s.id : newId(),
          title: text(s.title, 200),
          done: !!s.done,
        })),
    ),
  };
}

function normalizeReview(r: Raw): Review {
  return {
    wins: text(r.wins, 5000),
    adjust: text(r.adjust, 5000),
    priorities: list(r.priorities)
      .filter((id): id is string => typeof id === 'string')
      .slice(0, 3),
    completed: Number.isSafeInteger(r.completed) && Number(r.completed) >= 0 ? Number(r.completed) : 0,
    savedAt: isTimestamp(r.savedAt) ? r.savedAt : '',
  };
}

/** Imports `incoming` without overwriting records that already exist in `existing`. */
export function merge(existing: Workspace, incoming: Workspace): Workspace {
  return normalize({
    areas: lastById([...incoming.areas, ...existing.areas]),
    tasks: lastById([...incoming.tasks, ...existing.tasks]),
    projects: lastById([...incoming.projects, ...existing.projects]),
    pages: lastById([...incoming.pages, ...existing.pages]),
    daily: { ...incoming.daily, ...existing.daily },
    reviews: { ...incoming.reviews, ...existing.reviews },
    scratch: existing.scratch || incoming.scratch,
  });
}

/**
 * Next occurrence of a repeating task strictly after `today`.
 * Missed occurrences are skipped so completing a late task never creates a backlog.
 */
export function nextDate(
  date: string,
  repeat: Task['repeat'],
  today = dateKey(),
  anchorDay = Number(date.slice(-2)),
): string {
  if (!isDateKey(date) || !isDateKey(today) || repeat === 'none') return '';

  if (repeat === 'monthly') {
    const base = fromKey(date);
    const current = fromKey(today);
    let year = base.getFullYear();
    let month = base.getMonth() + 1;
    // Jump straight to the current month when the task is several months late.
    if (year * 12 + month < current.getFullYear() * 12 + current.getMonth()) {
      year = current.getFullYear();
      month = current.getMonth();
    }
    for (;;) {
      const normalized = new Date(year, month, 1, 12);
      const day = Math.min(anchorDay, daysInMonth(normalized.getFullYear(), normalized.getMonth()));
      const candidate = dateKey(new Date(normalized.getFullYear(), normalized.getMonth(), day, 12));
      if (candidate > today) return candidate;
      month++;
    }
  }

  const step = repeat === 'daily' ? 1 : 7;
  const candidate = fromKey(date);
  candidate.setDate(candidate.getDate() + step);
  if (dateKey(candidate) <= today) {
    const elapsed = Math.floor((fromKey(today).getTime() - candidate.getTime()) / 86_400_000);
    candidate.setDate(candidate.getDate() + (Math.floor(elapsed / step) + 1) * step);
    while (dateKey(candidate) <= today) candidate.setDate(candidate.getDate() + step);
  }
  return dateKey(candidate);
}

/**
 * Changes a task's status in place. Completing a repeating task creates its next
 * occurrence exactly once; the new task is returned when created.
 */
export function changeStatus(tasks: Task[], task: Task, status: Status, now = new Date()): Task | null {
  const wasDone = task.done;
  task.status = status;
  task.done = status === 'done';
  task.completedAt = task.done ? task.completedAt || now.toISOString() : null;
  if (!task.done || wasDone || task.nextTaskId || task.repeat === 'none') return null;

  const existing = tasks.find((t) => t.generatedFrom === task.id);
  if (existing) {
    task.nextTaskId = existing.id;
    return null;
  }
  const date = nextDate(task.date, task.repeat, dateKey(now), task.repeatDay || Number(task.date.slice(-2)));
  if (!date) return null;

  const next: Task = {
    ...task,
    id: newId(),
    date,
    status: 'todo',
    done: false,
    completedAt: null,
    pinned: false,
    nextTaskId: '',
    generatedFrom: task.id,
    createdAt: now.toISOString(),
    subtasks: task.subtasks.map((s) => ({ ...s, id: newId(), done: false })),
  };
  task.nextTaskId = next.id;
  tasks.push(next);
  return next;
}

/** A blank task with every field set; callers override what they need. */
export function blankTask(fields: Partial<Task> & { title: string }, now = new Date()): Task {
  return {
    id: newId(),
    notes: '',
    date: '',
    time: '',
    areaId: '',
    projectId: '',
    priority: 'normal',
    status: 'todo',
    done: false,
    pinned: false,
    completedAt: null,
    createdAt: now.toISOString(),
    repeat: 'none',
    repeatDay: fields.date ? Number(fields.date.slice(-2)) : 1,
    nextTaskId: '',
    generatedFrom: '',
    subtasks: [],
    ...fields,
  };
}

/** Area of a task or page, inherited from its project when not set directly. */
export function effectiveArea(workspace: Workspace, entity: { areaId: string; projectId: string }): string {
  return entity.areaId || workspace.projects.find((p) => p.id === entity.projectId)?.areaId || '';
}

/** Open tasks with no date, project or area: the inbox. */
export function isInbox(task: Task): boolean {
  return !task.done && !task.date && !task.projectId && !task.areaId;
}
