import type { SupabaseClient } from '@supabase/supabase-js';
import type { Account, AppState, Category, SavingsGoal, ThemePref, Transaction, Transfer } from '../types';
import type { Action } from '../store/reducer';
import { round2 } from './format';

/**
 * The Supabase data layer.
 *
 * Two jobs. Read the whole account into an AppState on sign in, and translate
 * one dispatched action into the smallest write that reflects it. The second
 * is why this maps actions rather than diffing state: adding a coffee should
 * be one upsert, not a re-send of every transaction the user has ever logged.
 */

/* --------------------------------------------------------- row shapes */

interface ProfileRow {
  id: string;
  name: string;
  monthly_income: string | number;
  savings_goal_per_month: string | number;
  currency: string;
  dark_mode: ThemePref;
  ended_series: string[] | null;
  lang: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  color_key: string;
  kind: 'expense' | 'income';
}

interface TransactionRow {
  id: string;
  amount: string | number;
  type: 'expense' | 'income';
  category_id: string;
  note: string | null;
  date: string;
  recurring: boolean;
}

interface BudgetRow {
  category_id: string;
  monthly_limit: string | number;
}

interface NetWorthRow {
  month: string;
  value: string | number;
}

interface AccountRow {
  id: string;
  name: string;
  kind: 'cash' | 'bank' | 'ewallet' | 'card' | 'savings';
  icon: string;
  color_key: string;
  opening_balance: string | number;
  archived: boolean;
}

interface TransferRow {
  id: string;
  amount: string | number;
  from_account_id: string;
  to_account_id: string;
  note: string | null;
  date: string;
}

interface GoalRow {
  id: string;
  name: string;
  target: string | number;
  saved: string | number;
  deadline: string | null;
  icon: string;
  color_key: string;
}

/** Postgres numeric comes back as a string to protect precision. */
const num = (v: string | number): number => round2(typeof v === 'number' ? v : parseFloat(v));

/* ------------------------------------------------------------- reading */

export async function loadRemoteState(
  db: SupabaseClient,
  userId: string,
): Promise<AppState> {
  const [profile, categories, transactions, budgets, netWorth, accounts, transfers, goals] =
    await Promise.all([
      db.from('profiles').select('*').eq('id', userId).maybeSingle(),
      db.from('categories').select('*').eq('user_id', userId).order('created_at'),
      db.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
      db.from('budgets').select('*').eq('user_id', userId),
      db.from('net_worth_points').select('*').eq('user_id', userId).order('month'),
      db.from('accounts').select('*').eq('user_id', userId).order('created_at'),
      db.from('transfers').select('*').eq('user_id', userId).order('date', { ascending: false }),
      db.from('goals').select('*').eq('user_id', userId).order('created_at'),
    ]);

  const failure = [
    profile, categories, transactions, budgets, netWorth, accounts, transfers, goals,
  ].find((r) => r.error);
  if (failure?.error) throw new Error(failure.error.message);

  const p = profile.data as ProfileRow | null;

  return {
    name: p?.name ?? 'there',
    monthlyIncome: p ? num(p.monthly_income) : 0,
    savingsGoalPerMonth: p ? num(p.savings_goal_per_month) : 0,
    currency: p?.currency ?? 'USD',
    darkMode: p?.dark_mode ?? 'system',
    categories: ((categories.data ?? []) as CategoryRow[]).map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      colorKey: c.color_key as Category['colorKey'],
      kind: c.kind,
    })),
    transactions: ((transactions.data ?? []) as TransactionRow[]).map((t) => ({
      id: t.id,
      amount: num(t.amount),
      type: t.type,
      categoryId: t.category_id,
      note: t.note ?? undefined,
      date: t.date,
      ...(t.recurring ? { recurring: true } : {}),
    })),
    budgets: ((budgets.data ?? []) as BudgetRow[]).map((b) => ({
      categoryId: b.category_id,
      monthlyLimit: num(b.monthly_limit),
    })),
    netWorthHistory: ((netWorth.data ?? []) as NetWorthRow[]).map((n) => ({
      month: n.month,
      value: num(n.value),
    })),
    endedSeries: p?.ended_series ?? [],
    // A real account is never seeded with the sample month; the trigger only
    // creates categories and a couple of empty accounts.
    demoSeeded: false,
    lang: (p?.lang as AppState['lang']) ?? 'id',
    accounts: ((accounts.data ?? []) as AccountRow[]).map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      icon: a.icon,
      colorKey: a.color_key as Category['colorKey'],
      openingBalance: num(a.opening_balance),
      ...(a.archived ? { archived: true } : {}),
    })),
    transfers: ((transfers.data ?? []) as TransferRow[]).map((t) => ({
      id: t.id,
      amount: num(t.amount),
      fromAccountId: t.from_account_id,
      toAccountId: t.to_account_id,
      note: t.note ?? undefined,
      date: t.date,
    })),
    goals: ((goals.data ?? []) as GoalRow[]).map((g) => ({
      id: g.id,
      name: g.name,
      target: num(g.target),
      saved: num(g.saved),
      deadline: g.deadline ?? undefined,
      icon: g.icon,
      colorKey: g.color_key as Category['colorKey'],
    })),
  };
}

/* ------------------------------------------------------------- writing */

const categoryRow = (userId: string, c: Category) => ({
  user_id: userId,
  id: c.id,
  name: c.name,
  icon: c.icon,
  color_key: c.colorKey,
  kind: c.kind,
});

const transactionRow = (userId: string, t: Transaction) => ({
  user_id: userId,
  id: t.id,
  amount: round2(t.amount),
  type: t.type,
  category_id: t.categoryId,
  note: t.note ?? null,
  date: t.date,
  recurring: Boolean(t.recurring),
  account_id: t.accountId ?? null,
});

const accountRow = (userId: string, a: Account) => ({
  user_id: userId,
  id: a.id,
  name: a.name,
  kind: a.kind,
  icon: a.icon,
  color_key: a.colorKey,
  opening_balance: round2(a.openingBalance),
  archived: Boolean(a.archived),
});

const transferRow = (userId: string, t: Transfer) => ({
  user_id: userId,
  id: t.id,
  amount: round2(Math.abs(t.amount)),
  from_account_id: t.fromAccountId,
  to_account_id: t.toAccountId,
  note: t.note ?? null,
  date: t.date,
});

const goalRow = (userId: string, g: SavingsGoal) => ({
  user_id: userId,
  id: g.id,
  name: g.name,
  target: round2(g.target),
  saved: round2(g.saved),
  deadline: g.deadline || null,
  icon: g.icon,
  color_key: g.colorKey,
});

async function run(promise: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await promise;
  if (error) throw new Error(error.message);
}

/**
 * Replace everything this user owns with the given state.
 *
 * One round trip to a plpgsql function rather than four deletes and four
 * inserts. Import, reset, and carrying a local demo into an account all mean
 * "throw this away and put that there instead", and doing that over eight
 * separate requests means a dropped connection between the delete and the
 * insert leaves someone with an empty account. Inside the function it is a
 * single transaction: all of it lands, or none of it does.
 */
export async function replaceRemoteState(
  db: SupabaseClient,
  _userId: string,
  state: AppState,
): Promise<void> {
  // The function reads auth.uid() itself, so the payload carries no user id
  // and cannot be pointed at somebody else's account.
  const { error } = await db.rpc('replace_account_data', {
    payload: {
      profile: {
        name: state.name,
        monthly_income: round2(state.monthlyIncome),
        savings_goal_per_month: round2(state.savingsGoalPerMonth),
        currency: state.currency,
        dark_mode: state.darkMode,
        ended_series: state.endedSeries,
      },
      accounts: state.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        icon: a.icon,
        color_key: a.colorKey,
        opening_balance: round2(a.openingBalance),
        archived: Boolean(a.archived),
      })),
      transfers: state.transfers.map((t) => ({
        id: t.id,
        amount: round2(Math.abs(t.amount)),
        from_account_id: t.fromAccountId,
        to_account_id: t.toAccountId,
        note: t.note ?? null,
        date: t.date,
      })),
      goals: state.goals.map((g) => ({
        id: g.id,
        name: g.name,
        target: round2(g.target),
        saved: round2(g.saved),
        deadline: g.deadline || null,
        icon: g.icon,
        color_key: g.colorKey,
      })),
      categories: state.categories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color_key: c.colorKey,
        kind: c.kind,
      })),
      transactions: state.transactions.map((t) => ({
        id: t.id,
        amount: round2(t.amount),
        type: t.type,
        category_id: t.categoryId,
        note: t.note ?? null,
        date: t.date,
        recurring: Boolean(t.recurring),
        account_id: t.accountId ?? null,
      })),
      budgets: state.budgets.map((b) => ({
        category_id: b.categoryId,
        monthly_limit: round2(b.monthlyLimit),
      })),
      net_worth: state.netWorthHistory.map((n) => ({
        month: n.month,
        value: round2(n.value),
      })),
    },
  });

  if (error) throw new Error(error.message);
}

/**
 * Translate one action into the smallest write that reflects it.
 *
 * `next` is the state after the reducer ran, which is what settings actions
 * need: the reducer clamps and normalises values, and the database should
 * store what the app actually decided, not the raw input.
 *
 * Returns false for actions with nothing to persist, so the sync queue can
 * skip them rather than round-trip for nothing.
 */
export async function pushAction(
  db: SupabaseClient,
  userId: string,
  action: Action,
  next: AppState,
  previous: AppState,
): Promise<boolean> {
  switch (action.type) {
    case 'tx/add':
    case 'tx/update': {
      // Read the stored version back out of state: the reducer rounds and
      // takes the absolute value, and the row should match the app exactly.
      const tx = next.transactions.find((t) => t.id === action.tx.id) ?? action.tx;
      await run(db.from('transactions').upsert(transactionRow(userId, tx)));
      return true;
    }

    case 'tx/delete':
      await run(db.from('transactions').delete().eq('user_id', userId).eq('id', action.id));
      return true;

    case 'tx/add-many': {
      // One insert for the whole batch. A CSV import of several hundred rows
      // should be one request, not several hundred.
      if (action.transactions.length === 0) return false;
      const rows = action.transactions.map((t) => {
        const stored = next.transactions.find((x) => x.id === t.id) ?? t;
        return transactionRow(userId, stored);
      });
      await run(db.from('transactions').upsert(rows));
      return true;
    }

    case 'series/end':
    case 'series/resume': {
      // Two things change: the stopped list on the profile, and the future
      // instances the reducer just removed. Delete by id rather than by a
      // filter, so the database only loses exactly what the app lost.
      await run(
        db.from('profiles').upsert({
          id: userId,
          name: next.name,
          monthly_income: round2(next.monthlyIncome),
          savings_goal_per_month: round2(next.savingsGoalPerMonth),
          currency: next.currency,
          dark_mode: next.darkMode,
          ended_series: next.endedSeries,
        }),
      );

      if (action.type === 'series/end') {
        const remaining = new Set(next.transactions.map((t) => t.id));
        const removed = previous.transactions.filter((t) => !remaining.has(t.id)).map((t) => t.id);
        if (removed.length > 0) {
          await run(db.from('transactions').delete().eq('user_id', userId).in('id', removed));
        }
      }
      return true;
    }

    case 'settings/name':
    case 'settings/income':
    case 'settings/savings':
    case 'settings/currency':
    case 'settings/theme':
      await run(
        db.from('profiles').upsert({
          id: userId,
          name: next.name,
          monthly_income: round2(next.monthlyIncome),
          savings_goal_per_month: round2(next.savingsGoalPerMonth),
          currency: next.currency,
          dark_mode: next.darkMode,
          ended_series: next.endedSeries,
        }),
      );
      return true;

    case 'budget/set': {
      const b = next.budgets.find((x) => x.categoryId === action.budget.categoryId);
      if (!b) return false;
      await run(
        db.from('budgets').upsert({
          user_id: userId,
          category_id: b.categoryId,
          monthly_limit: round2(b.monthlyLimit),
        }),
      );
      return true;
    }

    case 'budget/remove':
      await run(
        db
          .from('budgets')
          .delete()
          .eq('user_id', userId)
          .eq('category_id', action.categoryId),
      );
      return true;

    case 'category/add':
    case 'category/update':
      await run(db.from('categories').upsert(categoryRow(userId, action.category)));
      return true;

    case 'category/delete':
      // The reducer refuses to delete a category still in use, and the foreign
      // key would refuse too. Only reach the database if the delete actually
      // happened locally.
      if (next.categories.some((c) => c.id === action.id)) return false;
      await run(db.from('categories').delete().eq('user_id', userId).eq('id', action.id));
      return true;

    case 'account/add':
    case 'account/update': {
      const a = next.accounts.find((x) => x.id === action.account.id) ?? action.account;
      await run(db.from('accounts').upsert(accountRow(userId, a)));
      return true;
    }

    case 'account/delete': {
      // The reducer archives an account that has history rather than deleting
      // it, so follow whichever of the two actually happened.
      const still = next.accounts.find((a) => a.id === action.id);
      if (still) await run(db.from('accounts').upsert(accountRow(userId, still)));
      else await run(db.from('accounts').delete().eq('user_id', userId).eq('id', action.id));
      return true;
    }

    case 'transfer/add': {
      const t = next.transfers.find((x) => x.id === action.transfer.id) ?? action.transfer;
      await run(db.from('transfers').upsert(transferRow(userId, t)));
      return true;
    }

    case 'transfer/delete':
      await run(db.from('transfers').delete().eq('user_id', userId).eq('id', action.id));
      return true;

    case 'goal/add':
    case 'goal/update':
    case 'goal/contribute': {
      const id = action.type === 'goal/contribute' ? action.id : action.goal.id;
      const g = next.goals.find((x) => x.id === id);
      if (!g) return false;
      await run(db.from('goals').upsert(goalRow(userId, g)));
      return true;
    }

    case 'goal/delete':
      await run(db.from('goals').delete().eq('user_id', userId).eq('id', action.id));
      return true;

    case 'data/replace':
    case 'data/reset-seed':
    case 'data/reset-empty':
      await replaceRemoteState(db, userId, next);
      return true;

    default:
      return false;
  }
}
