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

/**
 * Wording comes in from the caller rather than being built here, because this
 * module has no business importing React context and the copy has to follow
 * the chosen language. The default keeps the pure-function tests readable.
 */
type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function buildAlerts(
  state: AppState,
  safe: SafeToSpend,
  today: Date = new Date(),
  currency = (s: number) => String(s),
  t: Translate = (key) => key,
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
    const when =
      days === 0
        ? t('alerts.whenToday')
        : days === 1
          ? t('alerts.whenTomorrow')
          : t('alerts.whenInDays', { count: days });
    alerts.push({
      id: `bill-${bill.id}`,
      tone: days <= 1 ? 'attention' : 'good',
      title: t('alerts.billDue', { name: bill.note ?? t('home.aBill'), when }),
      body: t('alerts.billBody', { amount: currency(bill.amount), when }),
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

    const name =
      state.categories.find((c) => c.id === budget.categoryId)?.name ?? t('common.category');
    const over = fraction > 1;
    alerts.push({
      id: `budget-${budget.categoryId}`,
      tone: over ? 'warning' : 'attention',
      title: t(over ? 'alerts.budgetOver' : 'alerts.budgetNear', { name }),
      body: over
        ? t('alerts.budgetOverBody', {
            amount: currency(round2(spent - budget.monthlyLimit)),
            limit: currency(budget.monthlyLimit),
          })
        : t('alerts.budgetNearBody', {
            spent: currency(spent),
            limit: currency(budget.monthlyLimit),
          }),
      target: 'budgets',
      weight: over ? 90 : 60,
    });
  }

  /* ---- the daily number ------------------------------------------------ */

  if (safe.atLimit) {
    alerts.push({
      id: 'at-limit',
      tone: 'warning',
      title: t('alerts.atLimit'),
      body: t('alerts.atLimitBody'),
      target: 'home',
      weight: 100,
    });
  } else if (safe.paceDelta < -safe.dailyPace * 0.4 && safe.daysLeftIncludingToday > 1) {
    alerts.push({
      id: 'behind-pace',
      tone: 'attention',
      title: t('alerts.behindPace'),
      body: t('alerts.behindPaceBody', {
        today: currency(safe.safeToSpendToday),
        pace: currency(safe.dailyPace),
      }),
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
        title: t('alerts.goalDone', { name: p.goal.name }),
        body: t('alerts.goalDoneBody', { amount: currency(p.goal.target) }),
        target: 'goals',
        weight: 30,
      });
    } else if (p.behind && p.perMonth !== null) {
      alerts.push({
        id: `goal-behind-${p.goal.id}`,
        tone: 'attention',
        title: t('alerts.goalBehind', { name: p.goal.name }),
        body: t('alerts.goalBehindBody', {
          perMonth: currency(p.perMonth),
          current: currency(state.savingsGoalPerMonth),
        }),
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
