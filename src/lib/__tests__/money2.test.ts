import { describe, expect, it } from 'vitest';
import { createSeedState } from '../seed';
import { computeSafeToSpend } from '../safeToSpend';
import { accountBalances, totalBalance, validateTransfer } from '../accounts';
import { allGoalProgress, goalProgress, totalSaved } from '../goals';
import { buildReport, summariseReport, transactionsInBucket } from '../reports';
import { buildAlerts } from '../alerts';
import { reducer } from '../../store/reducer';
import { validateState } from '../storage';

const TODAY = new Date(2026, 7, 19, 10, 0, 0);

/**
 * Stands in for the real translator. Renders "key[a=1,b=2]" so a test can pin
 * both the message chosen and the values put into it, without depending on the
 * wording of either language.
 */
const fill = (key: string, vars?: Record<string, string | number>) => {
  if (!vars) return key;
  const parts = Object.entries(vars).map(([k, v]) => `${k}=${v}`);
  return parts.length ? `${key}[${parts.join(',')}]` : key;
};

/* ------------------------------------------------------------ accounts -- */

describe('accounts and balances', () => {
  const state = createSeedState(TODAY);

  it('starts every account from its opening balance', () => {
    const empty = { ...state, transactions: [], transfers: [] };
    const rows = accountBalances(empty, TODAY);
    const bank = rows.find((r) => r.account.id === 'acc_bank')!;
    expect(bank.balance).toBe(state.accounts.find((a) => a.id === 'acc_bank')!.openingBalance);
    // Read the openings from the seed rather than restating them, so tuning
    // the demo data does not break a test about the arithmetic.
    const expected =
      Math.round(state.accounts.reduce((sum, a) => sum + a.openingBalance, 0) * 100) / 100;
    expect(totalBalance(empty, TODAY)).toBe(expected);
    expect(rows).toHaveLength(state.accounts.length);
  });

  it('adds income and subtracts spending', () => {
    const one = {
      ...state,
      transfers: [],
      transactions: [
        {
          id: 't1', amount: 100_000, type: 'income' as const, categoryId: 'cat_payroll',
          date: new Date(2026, 7, 10).toISOString(), accountId: 'acc_cash',
        },
        {
          id: 't2', amount: 30_000, type: 'expense' as const, categoryId: 'cat_coffee',
          date: new Date(2026, 7, 11).toISOString(), accountId: 'acc_cash',
        },
      ],
    };
    const opening = state.accounts.find((a) => a.id === 'acc_cash')!.openingBalance;
    const cash = accountBalances(one, TODAY).find((r) => r.account.id === 'acc_cash')!;
    expect(cash.balance).toBe(opening + 100_000 - 30_000);
    expect(cash.moneyIn).toBe(100_000);
    expect(cash.moneyOut).toBe(30_000);
  });

  it('moves money between accounts without inventing or destroying any', () => {
    const before = totalBalance(state, TODAY);
    const after = reducer(state, {
      type: 'transfer/add',
      transfer: {
        id: 'tr_x', amount: 250_000, fromAccountId: 'acc_bank', toAccountId: 'acc_cash',
        date: new Date(2026, 7, 15).toISOString(),
      },
    });
    // The total is unchanged: a transfer is not income and not spending.
    expect(totalBalance(after, TODAY)).toBe(before);

    const rows = accountBalances(after, TODAY);
    const bank = rows.find((r) => r.account.id === 'acc_bank')!;
    const cash = rows.find((r) => r.account.id === 'acc_cash')!;
    const bankBefore = accountBalances(state, TODAY).find((r) => r.account.id === 'acc_bank')!;
    const cashBefore = accountBalances(state, TODAY).find((r) => r.account.id === 'acc_cash')!;
    expect(bank.balance).toBe(Math.round((bankBefore.balance - 250_000) * 100) / 100);
    expect(cash.balance).toBe(Math.round((cashBefore.balance + 250_000) * 100) / 100);
  });

  it('leaves safe-to-spend completely alone', () => {
    const before = computeSafeToSpend(state, TODAY);
    const after = reducer(state, {
      type: 'transfer/add',
      transfer: {
        id: 'tr_y', amount: 900_000, fromAccountId: 'acc_bank', toAccountId: 'acc_savings',
        date: new Date(2026, 7, 15).toISOString(),
      },
    });
    const now = computeSafeToSpend(after, TODAY);
    expect(now.safeToSpendToday).toBe(before.safeToSpendToday);
    expect(now.alreadySpentThisMonth).toBe(before.alreadySpentThisMonth);
  });

  it('ignores money that has not moved yet', () => {
    // The seeded rent is dated ahead; a balance is what has actually left.
    const withFuture = {
      ...state,
      transactions: [
        ...state.transactions,
        {
          id: 't_future', amount: 5_000_000, type: 'expense' as const, categoryId: 'cat_rent',
          date: new Date(2026, 7, 28).toISOString(), accountId: 'acc_bank',
        },
      ],
    };
    expect(totalBalance(withFuture, TODAY)).toBe(totalBalance(state, TODAY));
  });

  it('refuses a transfer that makes no sense', () => {
    // A dictionary key, not a sentence: the module is pure and language free.
    expect(validateTransfer(state, 'acc_bank', 'acc_bank', 10_000)).toBe('accounts.errSame');
    expect(validateTransfer(state, null, 'acc_cash', 10_000)).toBe('accounts.errPickTwo');
    expect(validateTransfer(state, 'acc_bank', 'acc_cash', 0)).toBe('accounts.errAmount');
    expect(validateTransfer(state, 'acc_bank', 'acc_gone', 10_000)).toBe('accounts.errMissingTo');
    expect(validateTransfer(state, 'acc_bank', 'acc_cash', 25_000)).toBeNull();
  });

  it('archives an account with history rather than orphaning it', () => {
    const after = reducer(state, { type: 'account/delete', id: 'acc_bank' });
    expect(after.accounts.find((a) => a.id === 'acc_bank')?.archived).toBe(true);

    const unused = reducer(state, {
      type: 'account/add',
      account: { id: 'acc_new', name: 'Spare', kind: 'cash', icon: 'Wallet', colorKey: 'slate', openingBalance: 0 },
    });
    const gone = reducer(unused, { type: 'account/delete', id: 'acc_new' });
    expect(gone.accounts.some((a) => a.id === 'acc_new')).toBe(false);
  });
});

/* --------------------------------------------------------------- goals -- */

describe('savings goals', () => {
  const state = createSeedState(TODAY);

  it('reports progress against the target', () => {
    const p = goalProgress(state.goals[0], state, TODAY);
    expect(p.goal.name).toBe('Dana darurat');
    expect(p.fraction).toBeCloseTo(8_500_000 / 12_000_000, 5);
    expect(p.remaining).toBe(3_500_000);
    expect(p.reached).toBe(false);
  });

  it('works out what has to go in each month to hit a deadline', () => {
    const trip = state.goals.find((g) => g.name === 'Liburan tahun depan')!;
    const p = goalProgress(trip, state, TODAY);
    // Aug 2026 to Apr 2027 is eight months; 7,400,000 remaining over eight.
    expect(p.monthsLeft).toBe(8);
    expect(p.perMonth).toBe(925_000);
  });

  it('flags a goal the monthly set-aside cannot keep up with', () => {
    const tight = {
      ...state,
      savingsGoalPerMonth: 200_000,
      goals: [{ ...state.goals[1] }],
    };
    expect(goalProgress(tight.goals[0], tight, TODAY).behind).toBe(true);

    const generous = { ...tight, savingsGoalPerMonth: 3_000_000 };
    expect(goalProgress(generous.goals[0], generous, TODAY).behind).toBe(false);
  });

  it('marks a funded goal as reached and sorts it last', () => {
    const done = {
      ...state,
      goals: [{ ...state.goals[0], saved: 12_000_000 }, state.goals[1]],
    };
    const list = allGoalProgress(done, TODAY);
    expect(list[list.length - 1].reached).toBe(true);
  });

  it('adds a contribution without going below zero', () => {
    const up = reducer(state, { type: 'goal/contribute', id: 'goal_trip', amount: 400_000 });
    expect(up.goals.find((g) => g.id === 'goal_trip')!.saved).toBe(2_000_000);

    const down = reducer(state, { type: 'goal/contribute', id: 'goal_trip', amount: -99_999_999 });
    expect(down.goals.find((g) => g.id === 'goal_trip')!.saved).toBe(0);
  });

  it('totals what is put aside', () => {
    expect(totalSaved(state)).toBe(10_100_000);
  });
});

/* ------------------------------------------------------------- reports -- */

describe('reports', () => {
  const state = createSeedState(TODAY);

  it('buckets monthly, oldest first, ending on the current month', () => {
    const buckets = buildReport(state, 'month', TODAY);
    expect(buckets).toHaveLength(12);
    expect(buckets[buckets.length - 1].isCurrent).toBe(true);
    expect(buckets[0].start.getTime()).toBeLessThan(buckets[1].start.getTime());
  });

  it('separates money in from money out', () => {
    const buckets = buildReport(state, 'month', TODAY);
    const current = buckets[buckets.length - 1];
    expect(current.income).toBe(12_000_000);
    expect(current.expense).toBeGreaterThan(0);
    expect(current.net).toBe(Math.round((current.income - current.expense) * 100) / 100);
  });

  it('leaves transfers out entirely', () => {
    const moved = reducer(state, {
      type: 'transfer/add',
      transfer: {
        id: 'tr_r', amount: 400_000, fromAccountId: 'acc_bank', toAccountId: 'acc_cash',
        date: new Date(2026, 7, 12).toISOString(),
      },
    });
    const before = summariseReport(buildReport(state, 'month', TODAY));
    const after = summariseReport(buildReport(moved, 'month', TODAY));
    expect(after.income).toBe(before.income);
    expect(after.expense).toBe(before.expense);
  });

  it('supports every granularity without dropping the current period', () => {
    for (const g of ['day', 'week', 'month', 'year'] as const) {
      const buckets = buildReport(state, g, TODAY);
      expect(buckets.length).toBeGreaterThan(0);
      expect(buckets.filter((b) => b.isCurrent)).toHaveLength(1);
    }
  });

  it('weeks start on a Monday', () => {
    const buckets = buildReport(state, 'week', TODAY);
    expect(buckets.every((b) => b.start.getDay() === 1)).toBe(true);
  });

  it('can list what is inside one bucket', () => {
    const buckets = buildReport(state, 'month', TODAY);
    const current = buckets[buckets.length - 1];
    const rows = transactionsInBucket(state.transactions, current);
    expect(rows.length).toBe(current.count);
    expect(rows.every((t) => new Date(t.date) >= current.start)).toBe(true);
  });
});

/* -------------------------------------------------------------- alerts -- */

describe('alerts', () => {
  const state = createSeedState(TODAY);
  const safe = computeSafeToSpend(state, TODAY);

  it('warns about a bill inside the next week', () => {
    // Titles are dictionary keys filled in by the caller, so the assertion is
    // on the key and the values rather than on a rendered sentence.
    const alerts = buildAlerts(state, safe, TODAY, (n) => String(n), fill);
    const rent = alerts.find((a) => a.id.startsWith('bill-') && a.title.includes('Sewa kos'));
    expect(rent).toBeDefined();
    expect(rent!.title).toBe('alerts.billDue[name=Sewa kos,when=alerts.whenInDays[count=3]]');
  });

  it('warns when a budget is close to its limit', () => {
    const alerts = buildAlerts(state, safe, TODAY);
    // Dining is seeded at about 89 percent of its limit.
    expect(alerts.some((a) => a.id === 'budget-cat_dining')).toBe(true);
  });

  it('escalates when a budget is actually over', () => {
    const over = reducer(state, {
      type: 'tx/add',
      tx: {
        id: 'tx_big_dining', amount: 400_000, type: 'expense', categoryId: 'cat_dining',
        date: new Date(2026, 7, 18).toISOString(),
      },
    });
    const a = buildAlerts(over, computeSafeToSpend(over, TODAY), TODAY, undefined, fill)
      .find((x) => x.id === 'budget-cat_dining')!;
    expect(a.tone).toBe('warning');
    expect(a.title).toContain('alerts.budgetOver');
  });

  it('says so when the day is spent out', () => {
    const broke = reducer(state, {
      type: 'tx/add',
      tx: {
        id: 'tx_huge', amount: 20_000_000, type: 'expense', categoryId: 'cat_dining',
        date: new Date(2026, 7, 10).toISOString(),
      },
    });
    const alerts = buildAlerts(broke, computeSafeToSpend(broke, TODAY), TODAY);
    expect(alerts[0].id).toBe('at-limit');
    expect(alerts[0].tone).toBe('warning');
  });

  it('stays quiet on a comfortable month', () => {
    const calm = {
      ...state,
      monthlyIncome: 60_000_000,
      budgets: [],
      goals: [],
      transactions: state.transactions.filter((t) => !t.recurring),
    };
    const alerts = buildAlerts(calm, computeSafeToSpend(calm, TODAY), TODAY);
    expect(alerts).toHaveLength(0);
  });

  it('sorts the most pressing first', () => {
    const alerts = buildAlerts(state, safe, TODAY);
    for (let i = 1; i < alerts.length; i++) {
      expect(alerts[i - 1].weight).toBeGreaterThanOrEqual(alerts[i].weight);
    }
  });
});

/* ------------------------------------------------ demo data detection -- */

describe('recognising the sample month', () => {
  const state = createSeedState(TODAY);

  it('trusts the flag when it is there', () => {
    expect(validateState(JSON.parse(JSON.stringify(state)))!.demoSeeded).toBe(true);
  });

  it('infers it for a save made before the flag existed', () => {
    // Exactly what an older browser has: the demo, with no flag on it.
    const old = JSON.parse(JSON.stringify(state));
    delete old.demoSeeded;
    expect(validateState(old)!.demoSeeded).toBe(true);
  });

  it('infers it from notes alone, for saves older than accounts', () => {
    const ancient = JSON.parse(JSON.stringify(state));
    delete ancient.demoSeeded;
    ancient.accounts = [];
    ancient.transfers = [];
    ancient.goals = [];
    expect(validateState(ancient)!.demoSeeded).toBe(true);
  });

  it('never overrides someone who cleared it on purpose', () => {
    const cleared = JSON.parse(JSON.stringify(state));
    cleared.demoSeeded = false;
    // Even with every fingerprint present, an explicit false is a decision.
    expect(validateState(cleared)!.demoSeeded).toBe(false);
  });

  it('leaves real records alone', () => {
    const real = JSON.parse(JSON.stringify(state));
    delete real.demoSeeded;
    real.accounts = [];
    real.transfers = [];
    real.goals = [];
    real.transactions = [
      { id: 'a', amount: 120_000, type: 'expense', categoryId: 'cat_groceries',
        note: 'Superindo', date: new Date(2026, 7, 1).toISOString() },
      { id: 'b', amount: 300_000, type: 'expense', categoryId: 'cat_dining',
        note: 'Tempat lain', date: new Date(2026, 7, 2).toISOString() },
    ];
    // One coincidental match is not a demo.
    expect(validateState(real)!.demoSeeded).toBe(false);
  });

  it('says no when there is nothing there at all', () => {
    const empty = JSON.parse(JSON.stringify(state));
    delete empty.demoSeeded;
    empty.transactions = [];
    empty.transfers = [];
    empty.goals = [];
    empty.accounts = [];
    expect(validateState(empty)!.demoSeeded).toBe(false);
  });
});
