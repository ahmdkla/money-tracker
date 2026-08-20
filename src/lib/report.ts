import type { AppState, Transaction } from '../types';
import { accountBalances } from './accounts';
import { sameMonth, startOfDay } from './date';
import { round2 } from './format';
import { allGoalProgress } from './goals';
import { spendByCategory, transactionsInMonth } from './insights';
import { computeSafeToSpend } from './safeToSpend';

/**
 * Everything a month's report says, worked out once, as plain numbers.
 *
 * Separate from the drawing on purpose. What belongs in the report and whether
 * the figures add up is a question about money, and it is answered here where
 * it can be tested without a PDF reader in the loop. The renderer takes this
 * and decides only where things sit on the page.
 */

export interface ReportCategoryRow {
  categoryId: string;
  name: string;
  total: number;
  /** Share of the month's spending, 0 to 1. */
  share: number;
}

export interface ReportBudgetRow {
  categoryId: string;
  name: string;
  spent: number;
  limit: number;
  /** Spent over limit, which can exceed 1. */
  fraction: number;
  over: boolean;
}

export interface ReportAccountRow {
  name: string;
  kind: string;
  balance: number;
}

export interface ReportGoalRow {
  name: string;
  saved: number;
  target: number;
  fraction: number;
  reached: boolean;
}

export interface ReportTransactionRow {
  id: string;
  date: Date;
  note: string | null;
  categoryName: string;
  accountName: string | null;
  amount: number;
  type: 'expense' | 'income';
  recurring: boolean;
}

export interface MonthlyReport {
  /** First of the month the report covers. */
  month: Date;
  /** True when the month is still running, so the totals are partial. */
  partial: boolean;
  currency: string;

  income: number;
  expense: number;
  net: number;
  fixedBills: number;
  savingsSetAside: number;
  spendable: number;
  spent: number;
  remaining: number;

  categories: ReportCategoryRow[];
  budgets: ReportBudgetRow[];
  accounts: ReportAccountRow[];
  goals: ReportGoalRow[];
  transactions: ReportTransactionRow[];
}

/** Newest first reads well on screen; a statement reads oldest first. */
function byDateAscending(a: Transaction, b: Transaction): number {
  return +new Date(a.date) - +new Date(b.date);
}

/**
 * A month, summarised.
 *
 * `today` matters: a report for the month in progress counts balances and
 * goals as they stand now, and says so, rather than pretending the month has
 * finished. A report for a month gone by is complete by definition.
 */
export function buildMonthlyReport(
  state: AppState,
  month: Date,
  today: Date = new Date(),
): MonthlyReport {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const partial = sameMonth(first, today);

  const rows = transactionsInMonth(state.transactions, first);

  let income = 0;
  let expense = 0;
  let fixedBills = 0;
  for (const t of rows) {
    if (t.type === 'income') {
      income += t.amount;
      continue;
    }
    expense += t.amount;
    if (t.recurring) fixedBills += t.amount;
  }

  // The safe-to-spend figures only mean anything for the month in progress:
  // they are built around days that are still left.
  const safe = partial ? computeSafeToSpend(state, today) : null;

  const spendable = safe
    ? safe.spendableThisMonth
    : round2(Math.max(0, state.monthlyIncome - fixedBills - state.savingsGoalPerMonth));
  const spent = safe ? safe.alreadySpentThisMonth : round2(expense - fixedBills);

  const categoryTotals = spendByCategory(state.transactions, first, state.categories);
  const spentAll = categoryTotals.reduce((sum, r) => sum + r.total, 0);

  const spentByCategoryId = new Map<string, number>();
  for (const r of categoryTotals) spentByCategoryId.set(r.categoryId, r.total);

  const nameOf = (id: string) => state.categories.find((c) => c.id === id)?.name ?? '';
  const accountName = (id: string | undefined) =>
    id ? (state.accounts.find((a) => a.id === id)?.name ?? null) : null;

  return {
    month: first,
    partial,
    currency: state.currency,

    income: round2(income),
    expense: round2(expense),
    net: round2(income - expense),
    fixedBills: round2(fixedBills),
    savingsSetAside: round2(state.savingsGoalPerMonth),
    spendable: round2(spendable),
    spent: round2(spent),
    remaining: round2(spendable - spent),

    categories: categoryTotals.map((r) => ({
      categoryId: r.categoryId,
      name: r.category?.name ?? '',
      total: round2(r.total),
      share: spentAll > 0 ? r.total / spentAll : 0,
    })),

    budgets: state.budgets
      .map((b) => {
        const used = round2(spentByCategoryId.get(b.categoryId) ?? 0);
        return {
          categoryId: b.categoryId,
          name: nameOf(b.categoryId),
          spent: used,
          limit: b.monthlyLimit,
          fraction: b.monthlyLimit > 0 ? used / b.monthlyLimit : 0,
          over: b.monthlyLimit > 0 && used > b.monthlyLimit,
        };
      })
      .sort((a, b) => b.fraction - a.fraction),

    // Balances are as they stand, not as they stood at month end, which the
    // app has no record of. For a past month that is a caveat worth the
    // renderer saying out loud.
    accounts: accountBalances(state, today)
      .filter((b) => !b.account.archived)
      .map((b) => ({
        name: b.account.name,
        kind: b.account.kind,
        balance: round2(b.balance),
      })),

    goals: allGoalProgress(state, today).map((p) => ({
      name: p.goal.name,
      saved: round2(p.goal.saved),
      target: round2(p.goal.target),
      fraction: p.fraction,
      reached: p.reached,
    })),

    transactions: [...rows]
      .filter((t) => startOfDay(new Date(t.date)) <= startOfDay(today) || !partial)
      .sort(byDateAscending)
      .map((t) => ({
        id: t.id,
        date: new Date(t.date),
        note: t.note?.trim() || null,
        categoryName: nameOf(t.categoryId),
        accountName: accountName(t.accountId),
        amount: round2(t.amount),
        type: t.type,
        recurring: Boolean(t.recurring),
      })),
  };
}

/**
 * Which months there is anything to report on, newest first.
 *
 * The current month is always offered even when empty: asking for it and
 * getting nothing back is a clearer answer than not being offered it.
 *
 * Months ahead of this one are left out even though they hold records. Bills
 * are expanded a couple of months into the future so the forecast has
 * something to draw, and a report on a month that has not happened would be a
 * list of guesses presented as history.
 */
export function monthsWithRecords(state: AppState, today: Date = new Date()): Date[] {
  const current = new Date(today.getFullYear(), today.getMonth(), 1);
  const keys = new Set<string>();
  const add = (d: Date) => keys.add(`${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`);

  add(today);
  for (const t of state.transactions) {
    const d = new Date(t.date);
    if (new Date(d.getFullYear(), d.getMonth(), 1) <= current) add(d);
  }

  return [...keys]
    .map((k) => {
      const [year, index] = k.split('-').map(Number);
      return new Date(year, index, 1);
    })
    .sort((a, b) => +b - +a);
}
