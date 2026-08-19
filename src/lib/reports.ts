import type { AppState, Transaction } from '../types';
import { round2 } from './format';

/**
 * Reports over a period: daily, weekly, monthly, yearly.
 *
 * Insights already answered "where did this month go". This answers "what does
 * the shape look like over time", which is a different question and needs the
 * data bucketed rather than filtered. Transfers are excluded throughout: money
 * moved between your own accounts is not income and not spending, and counting
 * it would inflate both sides of every bar.
 */

export type Granularity = 'day' | 'week' | 'month' | 'year';

export const GRANULARITIES: { id: Granularity; label: string; buckets: number }[] = [
  { id: 'day', label: 'Daily', buckets: 14 },
  { id: 'week', label: 'Weekly', buckets: 12 },
  { id: 'month', label: 'Monthly', buckets: 12 },
  { id: 'year', label: 'Yearly', buckets: 5 },
];

export interface Bucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
  income: number;
  expense: number;
  net: number;
  count: number;
  isCurrent: boolean;
}

/** Monday-based, because a spending week that starts on Sunday reads oddly. */
function startOfWeek(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  const day = (c.getDay() + 6) % 7;
  c.setDate(c.getDate() - day);
  return c;
}

function bucketStart(d: Date, g: Granularity): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  if (g === 'day') return c;
  if (g === 'week') return startOfWeek(c);
  if (g === 'month') return new Date(c.getFullYear(), c.getMonth(), 1);
  return new Date(c.getFullYear(), 0, 1);
}

function stepBack(d: Date, g: Granularity, n: number): Date {
  const c = new Date(d);
  if (g === 'day') c.setDate(c.getDate() - n);
  else if (g === 'week') c.setDate(c.getDate() - n * 7);
  else if (g === 'month') c.setMonth(c.getMonth() - n);
  else c.setFullYear(c.getFullYear() - n);
  return c;
}

function nextStart(d: Date, g: Granularity): Date {
  return stepBack(d, g, -1);
}

function labelFor(d: Date, g: Granularity, locale = 'en-US'): string {
  if (g === 'day') return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  if (g === 'week') return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  if (g === 'month') return d.toLocaleDateString(locale, { month: 'short' });
  return String(d.getFullYear());
}

/**
 * Buckets running up to and including the one `today` falls in, oldest first,
 * so a chart reads left to right the way time does.
 */
export function buildReport(
  state: AppState,
  granularity: Granularity,
  today: Date = new Date(),
  count?: number,
): Bucket[] {
  const n = count ?? GRANULARITIES.find((g) => g.id === granularity)?.buckets ?? 12;
  const currentStart = bucketStart(today, granularity);

  const buckets: Bucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = bucketStart(stepBack(currentStart, granularity, i), granularity);
    const end = nextStart(start, granularity);
    buckets.push({
      key: start.toISOString(),
      label: labelFor(start, granularity),
      start,
      end,
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
      isCurrent: start.getTime() === currentStart.getTime(),
    });
  }

  if (buckets.length === 0) return buckets;
  const first = buckets[0].start.getTime();
  const last = buckets[buckets.length - 1].end.getTime();

  for (const tx of state.transactions) {
    const when = new Date(tx.date).getTime();
    if (when < first || when >= last) continue;
    // Linear scan is fine: a bucket list is at most fourteen long.
    const b = buckets.find((x) => when >= x.start.getTime() && when < x.end.getTime());
    if (!b) continue;
    b.count++;
    if (tx.type === 'income') b.income = round2(b.income + tx.amount);
    else b.expense = round2(b.expense + tx.amount);
  }

  for (const b of buckets) b.net = round2(b.income - b.expense);
  return buckets;
}

export interface ReportSummary {
  income: number;
  expense: number;
  net: number;
  count: number;
  /** Mean spend per bucket that actually had activity. */
  averageExpense: number;
  busiest: Bucket | null;
}

export function summariseReport(buckets: Bucket[]): ReportSummary {
  const income = round2(buckets.reduce((s, b) => s + b.income, 0));
  const expense = round2(buckets.reduce((s, b) => s + b.expense, 0));
  const count = buckets.reduce((s, b) => s + b.count, 0);
  const active = buckets.filter((b) => b.count > 0);

  return {
    income,
    expense,
    net: round2(income - expense),
    count,
    averageExpense: active.length ? round2(expense / active.length) : 0,
    busiest: active.length
      ? active.reduce((max, b) => (b.expense > max.expense ? b : max), active[0])
      : null,
  };
}

/** Transactions inside one bucket, newest first. */
export function transactionsInBucket(
  transactions: Transaction[],
  bucket: Bucket,
): Transaction[] {
  const from = bucket.start.getTime();
  const to = bucket.end.getTime();
  return transactions
    .filter((t) => {
      const w = new Date(t.date).getTime();
      return w >= from && w < to;
    })
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
}
