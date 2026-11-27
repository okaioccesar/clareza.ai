/** Weekly review: what was done, what is late, and the priorities for next week. */
import type { Task, Workspace } from './model.ts';
import { addDays, dateKey, fromKey, weekStart } from './dates.ts';

/** On Mondays the review looks back at the week that just ended. */
export function reviewWeekStart(today = dateKey()): string {
  const monday = weekStart(today);
  return monday === today ? addDays(monday, -7) : monday;
}

/** The review is suggested from Friday to Monday until it has been saved. */
export function isReviewDue(workspace: Workspace, today = dateKey()): boolean {
  const day = fromKey(today).getDay();
  return [5, 6, 0, 1].includes(day) && !workspace.reviews[reviewWeekStart(today)]?.savedAt;
}

export interface WeekReview {
  start: string;
  end: string;
  completed: Task[];
  /** Open tasks whose deadline already passed. */
  late: Task[];
  /** Open tasks due later in the reviewed week. */
  remaining: Task[];
  byArea: { areaId: string; count: number }[];
}

export function weekReview(workspace: Workspace, start: string, today = dateKey()): WeekReview {
  const end = addDays(start, 6);
  const completedOn = (task: Task) => (task.completedAt ? dateKey(new Date(task.completedAt)) : '');
  const completed = workspace.tasks
    .filter((t) => t.done && completedOn(t) >= start && completedOn(t) <= end)
    .sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || ''));
  const open = workspace.tasks.filter((t) => !t.done && t.date);
  const late = open.filter((t) => t.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const remaining = open.filter((t) => t.date >= today && t.date <= end).sort((a, b) => a.date.localeCompare(b.date));

  const counts = new Map<string, number>();
  for (const task of completed) {
    const areaId = task.areaId || workspace.projects.find((p) => p.id === task.projectId)?.areaId || '';
    counts.set(areaId, (counts.get(areaId) || 0) + 1);
  }
  const byArea = [...counts].map(([areaId, count]) => ({ areaId, count })).sort((a, b) => b.count - a.count);
  return { start, end, completed, late, remaining, byArea };
}

export type RescheduleTarget = 'today' | 'tomorrow' | 'next-monday' | 'none';

export function targetDate(target: RescheduleTarget, today = dateKey()): string {
  if (target === 'today') return today;
  if (target === 'tomorrow') return addDays(today, 1);
  if (target === 'next-monday') return addDays(weekStart(today), 7);
  return '';
}

/** Moves the selected open tasks to a new date. Returns a new workspace. */
export function reschedule(workspace: Workspace, ids: string[], date: string): Workspace {
  const next = structuredClone(workspace);
  for (const task of next.tasks) {
    if (!ids.includes(task.id) || task.done) continue;
    task.date = date;
    if (date) task.repeatDay = Number(date.slice(-2));
    else {
      task.time = '';
      task.repeat = 'none';
    }
  }
  return next;
}

/** Priorities chosen in the latest review that are still open. */
export function weekPriorities(workspace: Workspace, today = dateKey()): Task[] {
  const current = workspace.reviews[weekStart(today)];
  const previous = workspace.reviews[addDays(weekStart(today), -7)];
  // A review saved for last week sets the priorities of the current one.
  const review = previous?.savedAt ? previous : current;
  return (review?.priorities || [])
    .map((id) => workspace.tasks.find((t) => t.id === id))
    .filter((t): t is Task => !!t && !t.done);
}
