import type {
  Account,
  AppState,
  Budget,
  Category,
  SavingsGoal,
  ThemePref,
  Transaction,
  Transfer,
} from '../types';
import { round2 } from '../lib/format';
import { createEmptyState, createSeedState } from '../lib/seed';

export type Action =
  | { type: 'tx/add'; tx: Transaction }
  | { type: 'tx/update'; tx: Transaction }
  | { type: 'tx/delete'; id: string }
  | { type: 'settings/name'; value: string }
  | { type: 'settings/income'; value: number }
  | { type: 'settings/savings'; value: number }
  | { type: 'settings/currency'; value: string }
  | { type: 'settings/theme'; value: ThemePref }
  | { type: 'budget/set'; budget: Budget }
  | { type: 'budget/remove'; categoryId: string }
  | { type: 'category/add'; category: Category }
  | { type: 'category/update'; category: Category }
  | { type: 'category/delete'; id: string }
  | { type: 'tx/add-many'; transactions: Transaction[] }
  | { type: 'series/end'; key: string }
  | { type: 'series/resume'; key: string }
  | { type: 'account/add'; account: Account }
  | { type: 'account/update'; account: Account }
  | { type: 'account/delete'; id: string }
  | { type: 'transfer/add'; transfer: Transfer }
  | { type: 'transfer/delete'; id: string }
  | { type: 'goal/add'; goal: SavingsGoal }
  | { type: 'goal/update'; goal: SavingsGoal }
  | { type: 'goal/delete'; id: string }
  | { type: 'goal/contribute'; id: string; amount: number }
  | { type: 'data/replace'; state: AppState }
  | { type: 'data/reset-seed' }
  | { type: 'data/reset-empty' };

/** Newest first. The Recent list and every month filter rely on this order. */
function sortTransactions(list: Transaction[]): Transaction[] {
  return [...list].sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'tx/add':
      return {
        ...state,
        transactions: sortTransactions([
          { ...action.tx, amount: round2(Math.abs(action.tx.amount)) },
          ...state.transactions,
        ]),
      };

    case 'tx/update':
      return {
        ...state,
        transactions: sortTransactions(
          state.transactions.map((t) =>
            t.id === action.tx.id
              ? { ...action.tx, amount: round2(Math.abs(action.tx.amount)) }
              : t,
          ),
        ),
      };

    case 'tx/add-many':
      // Used by the recurring engine and CSV import. One state update rather
      // than one per row, so a 400 row import does not re-render 400 times.
      return {
        ...state,
        transactions: sortTransactions([
          ...action.transactions.map((t) => ({ ...t, amount: round2(Math.abs(t.amount)) })),
          ...state.transactions,
        ]),
      };

    case 'tx/delete':
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.id) };

    case 'series/end': {
      // Stop the bill, and clear the instances that have not happened yet.
      // Anything already paid stays: it is history, not a plan.
      const now = Date.now();
      return {
        ...state,
        endedSeries: state.endedSeries.includes(action.key)
          ? state.endedSeries
          : [...state.endedSeries, action.key],
        transactions: state.transactions.filter(
          (t) =>
            !(
              t.recurring &&
              `${t.categoryId}::${(t.note ?? '').trim().toLowerCase()}` === action.key &&
              new Date(t.date).getTime() > now
            ),
        ),
      };
    }

    case 'series/resume':
      return { ...state, endedSeries: state.endedSeries.filter((k) => k !== action.key) };

    case 'settings/name':
      return { ...state, name: action.value.trim() || 'there' };

    case 'settings/income':
      return { ...state, monthlyIncome: Math.max(0, round2(action.value)) };

    case 'settings/savings':
      return { ...state, savingsGoalPerMonth: Math.max(0, round2(action.value)) };

    case 'settings/currency':
      return { ...state, currency: action.value };

    case 'settings/theme':
      return { ...state, darkMode: action.value };

    case 'budget/set': {
      const limit = Math.max(0, round2(action.budget.monthlyLimit));
      const exists = state.budgets.some((b) => b.categoryId === action.budget.categoryId);
      return {
        ...state,
        budgets: exists
          ? state.budgets.map((b) =>
              b.categoryId === action.budget.categoryId ? { ...b, monthlyLimit: limit } : b,
            )
          : [...state.budgets, { ...action.budget, monthlyLimit: limit }],
      };
    }

    case 'budget/remove':
      return { ...state, budgets: state.budgets.filter((b) => b.categoryId !== action.categoryId) };

    case 'category/add':
      return { ...state, categories: [...state.categories, action.category] };

    case 'category/update':
      return {
        ...state,
        categories: state.categories.map((c) =>
          c.id === action.category.id ? action.category : c,
        ),
      };

    case 'account/add':
      return { ...state, accounts: [...state.accounts, action.account] };

    case 'account/update':
      return {
        ...state,
        accounts: state.accounts.map((a) => (a.id === action.account.id ? action.account : a)),
      };

    case 'account/delete': {
      // An account with history is archived rather than removed. Deleting it
      // would either orphan the transactions or silently rewrite them, and
      // both are worse than a greyed out row.
      const used =
        state.transactions.some((t) => t.accountId === action.id) ||
        state.transfers.some((t) => t.fromAccountId === action.id || t.toAccountId === action.id);

      if (used) {
        return {
          ...state,
          accounts: state.accounts.map((a) =>
            a.id === action.id ? { ...a, archived: true } : a,
          ),
        };
      }
      return { ...state, accounts: state.accounts.filter((a) => a.id !== action.id) };
    }

    case 'transfer/add':
      return {
        ...state,
        transfers: [
          { ...action.transfer, amount: round2(Math.abs(action.transfer.amount)) },
          ...state.transfers,
        ].sort((a, b) => +new Date(b.date) - +new Date(a.date)),
      };

    case 'transfer/delete':
      return { ...state, transfers: state.transfers.filter((t) => t.id !== action.id) };

    case 'goal/add':
      return { ...state, goals: [...state.goals, action.goal] };

    case 'goal/update':
      return {
        ...state,
        goals: state.goals.map((g) => (g.id === action.goal.id ? action.goal : g)),
      };

    case 'goal/delete':
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) };

    case 'goal/contribute':
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.id
            ? { ...g, saved: Math.max(0, round2(g.saved + action.amount)) }
            : g,
        ),
      };

    case 'category/delete':
      // Guarded in the UI too, but never orphan a transaction from here either.
      if (state.transactions.some((t) => t.categoryId === action.id)) return state;
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== action.id),
        budgets: state.budgets.filter((b) => b.categoryId !== action.id),
      };

    case 'data/replace':
      return { ...action.state, transactions: sortTransactions(action.state.transactions) };

    case 'data/reset-seed':
      return createSeedState();

    case 'data/reset-empty':
      // Keep the theme and currency the user chose. Clearing the data is not a
      // reason to throw them back into a different colour scheme mid-tap.
      return {
        ...createEmptyState(),
        darkMode: state.darkMode,
        currency: state.currency,
        name: 'there',
        demoSeeded: false,
      };

    default:
      return state;
  }
}
