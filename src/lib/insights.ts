import type { AppState, Category, Transaction } from '../types';
import { addMonths, monthKey, sameMonth, shortMonthLabel } from './date';
import { computeSafeToSpend } from './safeToSpend';
import { round2 } from './format';

/**
 * The derivations behind the Insights screen. Pure functions over state, so
 * the screen stays presentation and these stay testable.
 */

export function transactionsInMonth(transactions: Transaction[], month: Date): Transaction[] {
  return transactions.filter((t) => sameMonth(new Date(t.date), month));
}

/* ------------------------------------------------------- by category */

export interface CategoryTotal {
  categoryId: string;
  total: number;
  category: Category | undefined;
}

export function spendByCategory(
  transactions: Transaction[],
  month: Date,
  categories: Category[],
): CategoryTotal[] {
  const totals = new Map<string, number>();
  for (const t of transactionsInMonth(transactions, month)) {
    if (t.type !== 'expense') continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount);
  }
  return [...totals.entries()]
    .map(([categoryId, total]) => ({
      categoryId,
      total: round2(total),
      category: categories.find((c) => c.id === categoryId),
    }))
    .sort((a, b) => b.total - a.total);
}

/* -------------------------------------------------------- comparison */

export interface MonthComparison {
  now: number;
  before: number;
  delta: number;
  hasPrevious: boolean;
  /** Day of month both sides are measured up to. */
  cutoffDay: number;
}

/**
 * Like for like.
 *
 * Half way through a month, comparing against the whole of the previous month
 * would always flatter, and the app would congratulate people for nothing. So
 * when the selected month is the current one, both sides are cut at today's
 * date. A finished month is compared in full.
 */
export function compareToPreviousMonth(
  state: AppState,
  month: Date,
  today: Date = new Date(),
): MonthComparison {
  const cutoffDay = sameMonth(month, today) ? today.getDate() : 31;

  const spendUpTo = (m: Date) =>
    round2(
      transactionsInMonth(state.transactions, m)
        .filter((t) => t.type === 'expense' && new Date(t.date).getDate() <= cutoffDay)
        .reduce((s, t) => s + t.amount, 0),
    );

  const now = spendUpTo(month);
  const before = spendUpTo(addMonths(month, -1));

  return { now, before, delta: round2(now - before), hasPrevious: before > 0, cutoffDay };
}

/* --------------------------------------------------------- net worth */

export interface NetWorthPointView {
  key: string;
  label: string;
  value: number;
  /** The month in progress: projected, not measured. */
  live: boolean;
  /** Carries the final segment so it can be drawn dashed. */
  projected: number | null;
}

/**
 * Seeded month end readings, plus one projected point for the month in
 * progress.
 *
 * The seeded points are month end figures, so dropping a mid month reading
 * next to them would draw a spike every time payday landed before rent did.
 * Instead the last point answers the question the others answer: where does
 * this month end up?
 *
 * If the month goes exactly to plan, net worth grows by the savings goal. So
 * the projection is that, minus however far off the pace the month has drifted
 * so far. It moves as soon as anything is added, which is what makes it a
 * chart rather than a picture of one.
 */
export function netWorthSeries(state: AppState, today: Date = new Date()): NetWorthPointView[] {
  const history: NetWorthPointView[] = state.netWorthHistory.map((p) => ({
    key: p.month,
    label: shortMonthLabel(new Date(`${p.month}-01T00:00:00`)),
    value: p.value,
    live: false,
    projected: null,
  }));

  const last = state.netWorthHistory[state.netWorthHistory.length - 1];
  if (!last) return history;

  const safe = computeSafeToSpend(state, today);
  const expectedByNow = safe.dailyPace * today.getDate();
  const drift = safe.alreadySpentThisMonth - expectedByNow;
  const value = round2(last.value + state.savingsGoalPerMonth - drift);

  // The dashed segment needs both of its ends, so the previous point carries
  // the projection too.
  if (history.length > 0) history[history.length - 1].projected = last.value;

  return [
    ...history,
    { key: monthKey(today), label: shortMonthLabel(today), value, live: true, projected: value },
  ];
}
