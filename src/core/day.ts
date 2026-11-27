/** What belongs on "today" and how quick capture creates tasks. */
import type { Task, Workspace } from './model.ts';
import { dateKey, isDateKey, isTime } from './dates.ts';
import { blankTask, normalize } from './workspace.ts';

export type DayFilter = 'today' | 'focus' | 'late' | 'done';

export function dayTasks(workspace: Workspace, filter: DayFilter = 'today', today = dateKey()): Task[] {
  return workspace.tasks.filter((task) => {
    if (filter === 'done') return task.done && !!task.completedAt && dateKey(new Date(task.completedAt)) === today;
    if (task.done) return false;
    if (filter === 'late') return !!task.date && task.date < today;
    if (filter === 'focus') return task.pinned;
    return task.pinned || (!!task.date && task.date <= today);
  });
}

export interface DaySummary {
  open: number;
  done: number;
  late: number;
  focus: number;
  total: number;
  percent: number;
}

export function summary(workspace: Workspace, today = dateKey()): DaySummary {
  const open = dayTasks(workspace, 'today', today).length;
  const done = dayTasks(workspace, 'done', today).length;
  const total = open + done;
  return {
    open,
    done,
    late: dayTasks(workspace, 'late', today).length,
    focus: dayTasks(workspace, 'focus', today).length,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

export interface CaptureInput {
  title: string;
  date?: string;
  time?: string;
  areaId?: string;
  projectId?: string;
}

/** Validates quick-capture input and returns a normalized task (not yet added). */
export function createTask(input: CaptureInput, workspace: Workspace, now = new Date()): Task {
  const title = String(input.title || '').trim();
  if (!title || title.length > 200) throw new Error('Escreva uma tarefa com até 200 caracteres.');
  if (input.date && !isDateKey(input.date)) throw new Error('Escolha uma data válida.');
  if (input.time && !isTime(input.time)) throw new Error('Escolha um horário válido.');
  const task = blankTask(
    {
      title,
      date: input.date || '',
      time: input.date ? input.time || '' : '',
      areaId: input.areaId || '',
      projectId: input.projectId || '',
    },
    now,
  );
  // Normalizing against the workspace drops links to areas or projects that no longer exist.
  return normalize({ ...workspace, tasks: [task] }).tasks[0]!;
}

/** Sort order used by task lists: pinned first, then by date, then high priority. */
export function compareTasks(a: Task, b: Task): number {
  return (
    Number(b.pinned) - Number(a.pinned) ||
    (a.date || '9999').localeCompare(b.date || '9999') ||
    (a.time || '99').localeCompare(b.time || '99') ||
    Number(b.priority === 'high') - Number(a.priority === 'high')
  );
}
