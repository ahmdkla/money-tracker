/**
 * Date helpers. Everything here works in the user's local timezone, because
 * "today" in a money app means the user's today, not UTC's.
 */

export const MS_DAY = 86_400_000;

/** "YYYY-MM" for the month a date falls in. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" for a date, local time. */
export function dayKey(d: Date): string {
  return `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function addMonths(d: Date, n: number): Date {
  const c = new Date(d);
  const day = c.getDate();
  c.setDate(1);
  c.setMonth(c.getMonth() + n);
  // Clamp: 31 Jan + 1 month lands on the last day of February, not 3 March.
  c.setDate(Math.min(day, daysInMonth(c)));
  return c;
}

export function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function sameDay(a: Date, b: Date): boolean {
  return sameMonth(a, b) && a.getDate() === b.getDate();
}

export function parseMonthKey(key: string): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

export function monthLabel(d: Date, locale = 'en-US'): string {
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export function shortMonthLabel(d: Date, locale = 'en-US'): string {
  return d.toLocaleDateString(locale, { month: 'short' });
}

export function weekdayLabel(d: Date, locale = 'en-US'): string {
  return d.toLocaleDateString(locale, { weekday: 'long' });
}

export function shortWeekday(d: Date, locale = 'en-US'): string {
  return d.toLocaleDateString(locale, { weekday: 'short' });
}

export function fullDateLabel(d: Date, locale = 'en-US'): string {
  return d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "8:42 am", "Yesterday", "2 days ago", then a short date. */
export function relativeTime(iso: string, now = new Date(), locale = 'en-US'): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / MS_DAY);

  if (days < 0) {
    if (days === -1) return 'Tomorrow';
    if (days > -7) return `In ${Math.abs(days)} days`;
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  }
  if (days === 0) {
    return d
      .toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
      .toLowerCase()
      .replace(/\s/g, ' ');
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Value for a datetime-local input, in local time. */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}
