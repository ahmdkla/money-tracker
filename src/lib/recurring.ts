import type { AppState, Transaction } from '../types';
import { addMonths, MS_DAY, startOfDay } from './date';
import { round2 } from './format';

/**
 * Subscription radar. Groups the transactions already flagged `recurring` by
 * merchant, works out what each one costs per month and when it lands next,
 * and quietly flags the ones that look forgotten.
 */

export interface RecurringCharge {
  key: string;
  label: string;
  categoryId: string;
  monthlyCost: number;
  lastCharged: Date;
  nextExpected: Date;
  /** No ordinary activity in this category for 60 days. Possibly forgotten. */
  looksUnused: boolean;
  count: number;
}

const UNUSED_AFTER_DAYS = 60;

/**
 * A charge bigger than this share of monthly income is a bill, not a
 * forgotten subscription. Without the guard, rent trips the "no ordinary
 * activity in this category" rule and gets flagged, which is both wrong and
 * the fastest way to teach someone to ignore the flag.
 */
const FORGETTABLE_SHARE_OF_INCOME = 0.05;

export function detectRecurring(state: AppState, today: Date = new Date()): RecurringCharge[] {
  const recurring = state.transactions.filter((t) => t.recurring && t.type === 'expense');
  const byKey = new Map<string, Transaction[]>();

  for (const tx of recurring) {
    const cat = state.categories.find((c) => c.id === tx.categoryId);
    const key = (tx.note?.trim() || cat?.name || 'Recurring').toLowerCase();
    const list = byKey.get(key) ?? [];
    list.push(tx);
    byKey.set(key, list);
  }

  const now = startOfDay(today);

  const charges: RecurringCharge[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => +new Date(b.date) - +new Date(a.date));
    const latest = sorted[0];
    const cat = state.categories.find((c) => c.id === latest.categoryId);
    const lastCharged = new Date(latest.date);

    // Next expected: one month on from the most recent charge, rolled forward
    // until it is actually in the future.
    let nextExpected = addMonths(lastCharged, 1);
    let guard = 0;
    while (nextExpected < now && guard < 36) {
      nextExpected = addMonths(nextExpected, 1);
      guard++;
    }

    // "Used" means ordinary, non-recurring activity in the same category.
    // A gym membership with no other gym spend is the shape we want to catch.
    const lastOrdinary = state.transactions
      .filter((t) => t.categoryId === latest.categoryId && !t.recurring && t.type === 'expense')
      .map((t) => +new Date(t.date))
      .sort((a, b) => b - a)[0];

    const forgettable =
      state.monthlyIncome <= 0 ||
      latest.amount <= state.monthlyIncome * FORGETTABLE_SHARE_OF_INCOME;

    const looksUnused =
      forgettable &&
      (lastOrdinary === undefined || (+now - lastOrdinary) / MS_DAY > UNUSED_AFTER_DAYS);

    charges.push({
      key,
      label: latest.note?.trim() || cat?.name || 'Recurring',
      categoryId: latest.categoryId,
      monthlyCost: round2(latest.amount),
      lastCharged,
      nextExpected,
      looksUnused,
      count: list.length,
    });
  }

  return charges.sort((a, b) => b.monthlyCost - a.monthlyCost);
}

/** The headline figure: what leaves the account without anyone deciding to. */
export function invisibleSpend(charges: RecurringCharge[]): number {
  return round2(charges.reduce((s, c) => s + c.monthlyCost, 0));
}
