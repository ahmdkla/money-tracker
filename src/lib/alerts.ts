import type { AppState, Transaction } from '../types';
import { MS_DAY, sameMonth, startOfDay } from './date';
import { round2 } from './format';
import type { SafeToSpend } from './safeToSpend';
import { allGoalProgress } from './goals';

/**
 * Reminders and warnings.
 *
 * In-app rather than push: a browser notification needs a permission prompt,
 * and a money app that asks for one before it has earned any trust gets
 * dismissed and never seen again. These surface on Home and in the sidebar,
 * where they are read in the same glance as the number they relate to.
 *
 * The rule throughout is that an alert must be actionable and true. Anything
 * that fires every day stops being read, so each one has a threshold and each
 * one names what to do about it.
 */

export type AlertTone = 'warning' | 'attention' | 'good';

export interface Alert {
  id: string;
  tone: AlertTone;
  title: string;
  body: string;
  /** Where the user should be sent to deal with it. */
  target: 'home' | 'transactions' | 'budgets' | 'insights' | 'goals';
  /** Sorts higher first. */
  weight: number;
}

/** Bills land inside this window before they are worth mentioning. */
const BILL_HORIZON_DAYS = 7;

/** A budget starts to matter at this share of its limit. */
const BUDGET_WARN_AT = 0.8;

export function buildAlerts(
  state: AppState,
  safe: SafeToSpend,
  today: Date = new Date(),
  currency = (s: number) => String(s),
): Alert[] {
  const alerts: Alert[] = [];
  const now = startOfDay(today).getTime();

  /* ---- bills coming up ------------------------------------------------ */

  const upcoming: Transaction[] = state.transactions
    .filter((t) => {
      if (!t.recurring || t.type !== 'expense') return false;
      const when = startOfDay(new Date(t.date)).getTime();
      const days = (when - now) / MS_DAY;
      return days >= 0 && days <= BILL_HORIZON_DAYS;
    })
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  for (const bill of upcoming.slice(0, 3)) {
    const days = Math.round((startOfDay(new Date(bill.date)).getTime() - now) / MS_DAY);
    const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    alerts.push({
      id: `bill-${bill.id}`,
      tone: days <= 1 ? 'attention' : 'good',
      title: `${bill.note ?? 'A bill'} is due ${when}`,
      body: `${currency(bill.amount)} leaves your account ${when}. It is already set aside, so the daily number will not move when it does.`,
      target: 'transactions',
      weight: days <= 1 ? 70 : 40,
    });
  }

  /* ---- budgets --------------------------------------------------------- */

  const spentByCategory = new Map<string, number>();
  for (const t of state.transactions) {
    if (t.type !== 'expense' || !sameMonth(new Date(t.date), today)) continue;
    spentByCategory.set(t.categoryId, (spentByCategory.get(t.categoryId) ?? 0) + t.amount);
  }

  for (const budget of state.budgets) {
    if (budget.monthlyLimit <= 0) continue;
    const spent = round2(spentByCategory.get(budget.categoryId) ?? 0);
    const fraction = spent / budget.monthlyLimit;
    if (fraction < BUDGET_WARN_AT) continue;

    const name = state.categories.find((c) => c.id === budget.categoryId)?.name ?? 'A category';
    const over = fraction > 1;
    alerts.push({
      id: `budget-${budget.categoryId}`,
      tone: over ? 'warning' : 'attention',
      title: over ? `${name} is past its limit` : `${name} is close to its limit`,
      body: over
        ? `${currency(round2(spent - budget.monthlyLimit))} past ${currency(budget.monthlyLimit)}. Worth rebalancing rather than worrying about.`
        : `${currency(spent)} of ${currency(budget.monthlyLimit)} used, with the month still running.`,
      target: 'budgets',
      weight: over ? 90 : 60,
    });
  }

  /* ---- the daily number ------------------------------------------------ */

  if (safe.atLimit) {
    alerts.push({
      id: 'at-limit',
      tone: 'warning',
      title: 'You are at your limit for today',
      body: 'Tomorrow resets. Nothing has gone wrong, the month is just running ahead of the plan.',
      target: 'home',
      weight: 100,
    });
  } else if (safe.paceDelta < -safe.dailyPace * 0.4 && safe.daysLeftIncludingToday > 1) {
    alerts.push({
      id: 'behind-pace',
      tone: 'attention',
      title: 'Running ahead of the monthly pace',
      body: `Today allows ${currency(safe.safeToSpendToday)} against a steady ${currency(safe.dailyPace)}. Easing off for a few days brings it back.`,
      target: 'insights',
      weight: 50,
    });
  }

  /* ---- goals ----------------------------------------------------------- */

  for (const p of allGoalProgress(state, today)) {
    if (p.reached) {
      alerts.push({
        id: `goal-done-${p.goal.id}`,
        tone: 'good',
        title: `${p.goal.name} is fully funded`,
        body: `${currency(p.goal.target)} reached. Worth deciding what it is for now.`,
        target: 'goals',
        weight: 30,
      });
    } else if (p.behind && p.perMonth !== null) {
      alerts.push({
        id: `goal-behind-${p.goal.id}`,
        tone: 'attention',
        title: `${p.goal.name} needs more each month`,
        body: `${currency(p.perMonth)} a month gets there on time, against ${currency(state.savingsGoalPerMonth)} currently set aside.`,
        target: 'goals',
        weight: 45,
      });
    }
  }

  return alerts.sort((a, b) => b.weight - a.weight);
}

/** How many are worth a badge: the quiet, good-news ones are not. */
export function alertBadgeCount(alerts: Alert[]): number {
  return alerts.filter((a) => a.tone !== 'good').length;
}
