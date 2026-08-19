export type TxType = 'expense' | 'income';

import type { Lang } from './lib/i18n';

export type ThemePref = 'system' | 'light' | 'dark';

/** Palette key that drives a category's chip tint. See CATEGORY_TINTS. */
export type ColorKey =
  | 'evergreen'
  | 'mint'
  | 'amber'
  | 'coral'
  | 'clay'
  | 'sand'
  | 'slate'
  | 'plum';

export interface Category {
  id: string;
  name: string;
  /** A Phosphor icon name, e.g. "Coffee". Resolved by components/CategoryIcon. */
  icon: string;
  colorKey: ColorKey;
  kind: TxType;
}

export type AccountKind = 'cash' | 'bank' | 'ewallet' | 'card' | 'savings';

/** Where money physically is, as opposed to what it was for. */
export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  icon: string;
  colorKey: ColorKey;
  /** What was in it before the app started watching. */
  openingBalance: number;
  archived?: boolean;
}

/**
 * Money moved between two of your own accounts.
 *
 * Deliberately not a Transaction: a transfer is neither income nor spending,
 * and letting it into either would corrupt safe-to-spend, every budget and
 * every category chart. Only balances care about it.
 */
export interface Transfer {
  id: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  note?: string;
  date: string;
}

/** A named target with a running total, separate from the monthly set-aside. */
export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
  /** ISO date, optional. */
  deadline?: string;
  icon: string;
  colorKey: ColorKey;
}

export interface Transaction {
  id: string;
  /** Always positive. The sign is derived from `type` at render time. */
  amount: number;
  type: TxType;
  categoryId: string;
  note?: string;
  /** ISO date-time. */
  date: string;
  /** Which account it moved through. Missing on records made before accounts. */
  accountId?: string;
  /** A known fixed charge: rent, a subscription, a standing bill. */
  recurring?: boolean;
}

export interface Budget {
  categoryId: string;
  monthlyLimit: number;
}

/** A seeded month-end net worth reading. The current month is derived live. */
export interface NetWorthPoint {
  /** "YYYY-MM" */
  month: string;
  value: number;
}

export interface AppState {
  name: string;
  monthlyIncome: number;
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  savingsGoalPerMonth: number;
  currency: string;
  darkMode: ThemePref;
  /** Interface language. Indonesian by default. */
  lang: Lang;
  accounts: Account[];
  transfers: Transfer[];
  goals: SavingsGoal[];
  /**
   * True while the sample month is still what is on screen. It is how the app
   * knows to offer a clear-out, and it stops the offer appearing over real
   * records once somebody has started using it properly.
   */
  demoSeeded?: boolean;
  /** Demo history for the net worth trend; see screens/Insights. */
  netWorthHistory: NetWorthPoint[];
  /**
   * Recurring series the user has stopped, as `categoryId::note` keys. Without
   * this, deleting next month's rent would simply have it recreated on the
   * next load, which is the sort of thing that makes people distrust an app.
   */
  endedSeries: string[];
}
