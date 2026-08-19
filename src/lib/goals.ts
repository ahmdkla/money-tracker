import type { AppState, SavingsGoal } from '../types';
import { round2 } from './format';

/**
 * Savings goals.
 *
 * The app already had a single monthly savings figure, which is a pacing tool:
 * it decides how much of this month is spendable. A goal is a different thing.
 * It is a named target with a running total against it, and its job is to
 * answer "how far off am I" rather than "can I spend today". Keeping the two
 * separate is deliberate; folding goals into the monthly figure would make the
 * hero number lurch every time somebody added an ambition.
 */

export interface GoalProgress {
  goal: SavingsGoal;
  /** 0 to 1, clamped. */
  fraction: number;
  remaining: number;
  reached: boolean;
  /** Months left until the deadline, null when there is no deadline. */
  monthsLeft: number | null;
  /** What must go in each month to arrive on time. */
  perMonth: number | null;
  /** True when the current monthly savings figure is not enough to get there. */
  behind: boolean;
}

export function goalProgress(
  goal: SavingsGoal,
  state: AppState,
  today: Date = new Date(),
): GoalProgress {
  const saved = round2(Math.max(0, goal.saved));
  const target = round2(Math.max(0, goal.target));
  const remaining = round2(Math.max(0, target - saved));
  const fraction = target > 0 ? Math.min(1, saved / target) : 0;

  let monthsLeft: number | null = null;
  let perMonth: number | null = null;

  if (goal.deadline) {
    const due = new Date(goal.deadline);
    if (!Number.isNaN(due.getTime())) {
      const months =
        (due.getFullYear() - today.getFullYear()) * 12 + (due.getMonth() - today.getMonth());
      monthsLeft = Math.max(0, months);
      perMonth = monthsLeft > 0 ? round2(remaining / monthsLeft) : remaining;
    }
  }

  return {
    goal,
    fraction,
    remaining,
    reached: target > 0 && saved >= target,
    monthsLeft,
    perMonth,
    // Only a claim we can actually back: the monthly set-aside is smaller than
    // what this goal needs each month to land on time.
    behind:
      perMonth !== null && perMonth > 0 && state.savingsGoalPerMonth > 0
        ? perMonth > state.savingsGoalPerMonth
        : false,
  };
}

export function allGoalProgress(state: AppState, today: Date = new Date()): GoalProgress[] {
  return state.goals
    .map((g) => goalProgress(g, state, today))
    .sort((a, b) => {
      if (a.reached !== b.reached) return a.reached ? 1 : -1;
      return b.fraction - a.fraction;
    });
}

export function totalSaved(state: AppState): number {
  return round2(state.goals.reduce((s, g) => s + Math.max(0, g.saved), 0));
}

export function totalTargeted(state: AppState): number {
  return round2(state.goals.reduce((s, g) => s + Math.max(0, g.target), 0));
}
