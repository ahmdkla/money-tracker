import type { Account, AccountKind, AppState, Transfer } from '../types';
import { round2 } from './format';

/**
 * Accounts, and the balances that come out of them.
 *
 * An account is where money physically is: cash in a pocket, a bank account,
 * an e-wallet. It is a different question from a category, which is what money
 * was *for*, and the app kept only the second one until now. Without accounts
 * there is no answer to "how much have I actually got", which is the first
 * thing anyone opens a money app to find out.
 *
 * A transfer is deliberately not a transaction. Moving money from a bank
 * account to a wallet is neither income nor spending, and letting it into
 * either bucket would quietly corrupt the safe-to-spend figure, every budget
 * and every category chart. It lives in its own list and only balances see it.
 */

export const ACCOUNT_KINDS: { id: AccountKind; key: string; icon: string }[] = [
  { id: 'cash', key: 'accounts.kindCash', icon: 'Wallet' },
  { id: 'bank', key: 'accounts.kindBank', icon: 'Bank' },
  { id: 'ewallet', key: 'accounts.kindEwallet', icon: 'DeviceMobile' },
  { id: 'card', key: 'accounts.kindCard', icon: 'CreditCard' },
  { id: 'savings', key: 'accounts.kindSavings', icon: 'PiggyBank' },
];

export const ACCOUNT_KIND_KEY: Record<AccountKind, string> = {
  cash: 'accounts.kindCash',
  bank: 'accounts.kindBank',
  ewallet: 'accounts.kindEwallet',
  card: 'accounts.kindCard',
  savings: 'accounts.kindSavings',
};

/** Where a transaction lands when nothing says otherwise. */
export function defaultAccountId(state: AppState): string | null {
  const live = state.accounts.filter((a) => !a.archived);
  return live[0]?.id ?? state.accounts[0]?.id ?? null;
}

export interface AccountBalance {
  account: Account;
  /** Opening balance, plus everything that has actually happened since. */
  balance: number;
  moneyIn: number;
  moneyOut: number;
  transferredIn: number;
  transferredOut: number;
  /** Number of records touching this account. */
  activity: number;
}

/**
 * Balances as of `asOf`, counting only what has already happened.
 *
 * Future-dated rows exist on purpose: a rent bill three days out is a real
 * commitment the forecast needs. It is not money that has left yet, though, so
 * counting it in a balance would be wrong in the user's favour.
 */
export function accountBalances(state: AppState, asOf: Date = new Date()): AccountBalance[] {
  const now = asOf.getTime();
  const index = new Map<string, AccountBalance>();
  const fallback = defaultAccountId(state);

  for (const account of state.accounts) {
    index.set(account.id, {
      account,
      balance: account.openingBalance,
      moneyIn: 0,
      moneyOut: 0,
      transferredIn: 0,
      transferredOut: 0,
      activity: 0,
    });
  }

  for (const tx of state.transactions) {
    if (+new Date(tx.date) > now) continue;
    // Records made before accounts existed fall to the first one rather than
    // vanishing from every balance.
    const id = tx.accountId ?? fallback;
    const row = id ? index.get(id) : undefined;
    if (!row) continue;

    row.activity++;
    if (tx.type === 'income') {
      row.moneyIn = round2(row.moneyIn + tx.amount);
      row.balance = round2(row.balance + tx.amount);
    } else {
      row.moneyOut = round2(row.moneyOut + tx.amount);
      row.balance = round2(row.balance - tx.amount);
    }
  }

  for (const t of state.transfers) {
    if (+new Date(t.date) > now) continue;
    const from = index.get(t.fromAccountId);
    const to = index.get(t.toAccountId);
    if (from) {
      from.activity++;
      from.transferredOut = round2(from.transferredOut + t.amount);
      from.balance = round2(from.balance - t.amount);
    }
    if (to) {
      to.activity++;
      to.transferredIn = round2(to.transferredIn + t.amount);
      to.balance = round2(to.balance + t.amount);
    }
  }

  return [...index.values()];
}

/** Everything added up. The "how much have I got" number. */
export function totalBalance(state: AppState, asOf: Date = new Date()): number {
  return round2(
    accountBalances(state, asOf)
      .filter((b) => !b.account.archived)
      .reduce((sum, b) => sum + b.balance, 0),
  );
}

/** A transfer is only meaningful between two different, real accounts. */
/* Returns a dictionary key rather than a sentence: this module is pure and
   has no idea which language the interface is in. */
export function validateTransfer(
  state: AppState,
  from: string | null,
  to: string | null,
  amount: number,
): string | null {
  if (!from || !to) return 'accounts.errPickTwo';
  if (from === to) return 'accounts.errSame';
  if (!Number.isFinite(amount) || amount <= 0) return 'accounts.errAmount';
  if (!state.accounts.some((a) => a.id === from)) return 'accounts.errMissingFrom';
  if (!state.accounts.some((a) => a.id === to)) return 'accounts.errMissingTo';
  return null;
}

export function accountById(state: AppState, id: string | null | undefined): Account | undefined {
  return id ? state.accounts.find((a) => a.id === id) : undefined;
}

/** Transfers touching an account, newest first. */
export function transfersFor(state: AppState, accountId: string): Transfer[] {
  return state.transfers
    .filter((t) => t.fromAccountId === accountId || t.toAccountId === accountId)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
}
