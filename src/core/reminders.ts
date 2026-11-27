/**
 * Computes which notifications should be shown. Delivery is handled by the browser
 * (and later by native local notifications), so this module stays platform-free.
 */
import type { Workspace } from './model.ts';
import { at, dateKey, isTime } from './dates.ts';
import { dayTasks } from './day.ts';

export interface ReminderSettings {
  enabled: boolean;
  /** Remind about tasks that have a date and a time. */
  tasks: boolean;
  /** Minutes before the task time. */
  lead: number;
  /** One summary of the day at `summaryTime`. */
  summary: boolean;
  summaryTime: string;
}

export const LEAD_OPTIONS = [0, 5, 15, 30, 60] as const;

export const defaultSettings = (): ReminderSettings => ({
  enabled: false,
  tasks: true,
  lead: 15,
  summary: true,
  summaryTime: '08:00',
});

export function normalizeSettings(raw: unknown): ReminderSettings {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Record<string, unknown>;
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : base.enabled,
    tasks: typeof value.tasks === 'boolean' ? value.tasks : base.tasks,
    lead: LEAD_OPTIONS.includes(value.lead as 0) ? (value.lead as number) : base.lead,
    summary: typeof value.summary === 'boolean' ? value.summary : base.summary,
    summaryTime: isTime(value.summaryTime) ? value.summaryTime : base.summaryTime,
  };
}

export interface Reminder {
  /** Stable identifier, used to avoid showing the same notification twice. */
  tag: string;
  at: Date;
  title: string;
  body: string;
  taskId?: string;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** All reminders for the given day, sorted by time. */
export function remindersFor(workspace: Workspace, settings: ReminderSettings, day = dateKey()): Reminder[] {
  if (!settings.enabled) return [];
  const reminders: Reminder[] = [];

  if (settings.tasks)
    for (const task of workspace.tasks) {
      if (task.done || !task.date || !task.time) continue;
      const due = at(task.date, task.time);
      const remindAt = new Date(due.getTime() - settings.lead * 60_000);
      if (dateKey(remindAt) !== day) continue;
      reminders.push({
        tag: `task:${task.id}:${task.date}T${task.time}`,
        at: remindAt,
        title: task.title,
        body: settings.lead ? `Começa em ${settings.lead} minutos, às ${task.time}.` : `Agora, às ${task.time}.`,
        taskId: task.id,
      });
    }

  if (settings.summary) {
    const open = dayTasks(workspace, 'today', day);
    const late = dayTasks(workspace, 'late', day).length;
    if (open.length)
      reminders.push({
        tag: `summary:${day}`,
        at: at(day, settings.summaryTime),
        title: 'Seu dia',
        body:
          `Você tem ${plural(open.length, 'tarefa', 'tarefas')} para hoje` +
          (late ? `, ${plural(late, 'atrasada', 'atrasadas')}.` : '.') +
          ` Comece por: ${open[0]!.title}`,
      });
  }

  return reminders.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Reminders whose time arrived after `since` (exclusive) and up to `now`.
 * Anything older than `grace` is skipped, so reopening the app late does not
 * produce a burst of stale notifications.
 */
export function dueReminders(
  workspace: Workspace,
  settings: ReminderSettings,
  since: Date,
  now = new Date(),
  grace = 15 * 60_000,
): Reminder[] {
  const from = Math.max(since.getTime(), now.getTime() - grace);
  const days = new Set([dateKey(new Date(from)), dateKey(now)]);
  return [...days]
    .flatMap((day) => remindersFor(workspace, settings, day))
    .filter((r) => r.at.getTime() > from && r.at.getTime() <= now.getTime());
}
