/** Calendar helpers. Dates are local calendar days formatted as YYYY-MM-DD. */

const pad = (value: number) => String(value).padStart(2, '0');

export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Noon avoids daylight-saving transitions moving a date to the previous day. */
export function fromKey(key: string): Date {
  return new Date(key + 'T12:00:00');
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(fromKey(value)) === value;
}

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function addDays(key: string, days: number): string {
  const date = fromKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

/** Monday of the week containing `key`. */
export function weekStart(key: string): string {
  const date = fromKey(key);
  return addDays(key, -((date.getDay() + 6) % 7));
}

/** The seven days (Monday to Sunday) of the week `offset` weeks away from `now`. */
export function weekDates(offset = 0, now = new Date()): string[] {
  const monday = addDays(weekStart(dateKey(now)), offset * 7);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0, 12).getDate();
}

/** Combines a date key and HH:MM time into a local Date. */
export function at(key: string, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = fromKey(key);
  date.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return date;
}
