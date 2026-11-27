/** Human-readable labels for dates and statuses (pt-BR). */
import { addDays, dateKey, fromKey } from '../core/dates.ts';
import type { Repeat, Status } from '../core/model.ts';

export const STATUS_LABEL: Record<Status, string> = { todo: 'A fazer', doing: 'Em andamento', done: 'Concluída' };
export const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'Não repetir',
  daily: 'Todos os dias',
  weekly: 'Toda semana',
  monthly: 'Todo mês',
};
export const COLOR_LABEL = {
  blue: 'Azul',
  green: 'Verde',
  orange: 'Terracota',
  rose: 'Rosa',
  purple: 'Lavanda',
} as const;

/** "Hoje", "Amanhã", "Ontem" or "12 de out.". */
export function dateLabel(key: string, today = dateKey()): string {
  if (!key) return 'Sem prazo';
  if (key === today) return 'Hoje';
  if (key === addDays(today, 1)) return 'Amanhã';
  if (key === addDays(today, -1)) return 'Ontem';
  const date = fromKey(key);
  const sameYear = date.getFullYear() === fromKey(today).getFullYear();
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "12 de out." regardless of today, for ranges. */
export function shortDate(key: string): string {
  return fromKey(key).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

export function rangeLabel(start: string, end: string): string {
  return `${shortDate(start)} – ${shortDate(end)}`;
}

export function weekday(key: string, style: 'short' | 'long' = 'short'): string {
  return fromKey(key).toLocaleDateString('pt-BR', { weekday: style }).replace('.', '');
}

export function longToday(now = new Date()): string {
  return now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  return hour < 5 ? 'Boa noite' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}
