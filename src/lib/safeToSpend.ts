import type { AppState, Transaction } from '../types';
import { daysInMonth, sameMonth } from './date';
import { round2 } from './format';

/**
 * The safe-to-spend engine. Pure: no React, no storage, no formatting.
 * Everything the Home screen shows is derived from one call to
 * computeSafeToSpend(state, today).
 *
 * A note on how "fixed bills" are counted, because the spec's two descriptions
 * pull in slightly different directions:
 *
 *   §8 formula:  spendable = income - (known & upcoming fixed bills) - savings
 *   §8 prose:    "...marked recurring that are expected but not yet paid"
 *
 * Counting only the *unpaid* half would drop a rent payment out of both terms
 * the moment it lands (it is no longer upcoming, and it is not discretionary),
 * which silently hands the user back $680 they already spent. It would also
 * make dailyPace climb every time a bill clears, when the spec calls it "the
 * steady baseline".
 *
 * So a fixed bill is every recurring expense dated in the current month, paid
 * or not. It is subtracted exactly once, up front. The stated goal holds
 * precisely: the number does not move on the day rent lands, because rent was
 * never in the discretionary pot to begin with.
 */

export interface SafeToSpend {
  /** Income minus fixed bills minus the savings goal. The month's real pot. */
  spendableThisMonth: number;
  /** Discretionary (non-recurring) expenses dated in this month. */
  alreadySpentThisMonth: number;
  remainingThisMonth: number;
  daysInMonth: number;
  daysLeftIncludingToday: number;
  /** spendableThisMonth / daysInMonth. The flat line the user is pacing against. */
  dailyPace: number;
  /** Never negative. Zero means "you are at your limit for today". */
  safeToSpendToday: number;
  /** safeToSpendToday - dailyPace. Positive is ahead, negative is behind. */
  paceDelta: number;
  /** Fraction of the month's pot already used, 0 to 1. */
  usedFraction: number;
  fixedBillsThisMonth: number;
  /** Recurring bills dated today or later this month, soonest first. */
  upcomingBills: Transaction[];
  /** True when the pot is exhausted and the hero should read zero. */
  atLimit: boolean;
}

/** A fixed bill: a recurring expense dated inside the given month. */
export function isFixedBill(tx: Transaction, monthOf: Date): boolean {
  return tx.type === 'expense' && tx.recurring === true && sameMonth(new Date(tx.date), monthOf);
}

/** Discretionary: an expense in the month that is not a known fixed bill. */
export function isDiscretionary(tx: Transaction, monthOf: Date): boolean {
  return tx.type === 'expense' && !tx.recurring && sameMonth(new Date(tx.date), monthOf);
}

export function computeSafeToSpend(state: AppState, today: Date = new Date()): SafeToSpend {
  const dim = daysInMonth(today);
  const daysLeftIncludingToday = dim - today.getDate() + 1;

  const fixedBills = state.transactions.filter((t) => isFixedBill(t, today));
  const fixedBillsThisMonth = round2(fixedBills.reduce((s, t) => s + t.amount, 0));

  const spendableThisMonth = round2(
    state.monthlyIncome - fixedBillsThisMonth - state.savingsGoalPerMonth,
  );

  const alreadySpentThisMonth = round2(
    state.transactions
      .filter((t) => isDiscretionary(t, today))
      .reduce((s, t) => s + t.amount, 0),
  );

  const remainingThisMonth = round2(spendableThisMonth - alreadySpentThisMonth);
  const dailyPace = dim > 0 ? round2(spendableThisMonth / dim) : 0;

  const safeToSpendToday =
    daysLeftIncludingToday > 0
      ? round2(Math.max(0, remainingThisMonth / daysLeftIncludingToday))
      : 0;

  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const upcomingBills = fixedBills
    .filter((t) => new Date(t.date).getTime() >= startOfToday.getTime())
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const usedFraction =
    spendableThisMonth > 0
      ? Math.min(1, Math.max(0, alreadySpentThisMonth / spendableThisMonth))
      : alreadySpentThisMonth > 0
        ? 1
        : 0;

  return {
    spendableThisMonth,
    alreadySpentThisMonth,
    remainingThisMonth,
    daysInMonth: dim,
    daysLeftIncludingToday,
    dailyPace,
    safeToSpendToday,
    paceDelta: round2(safeToSpendToday - dailyPace),
    usedFraction,
    fixedBillsThisMonth,
    upcomingBills,
    atLimit: remainingThisMonth <= 0,
  };
}
