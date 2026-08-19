import { describe, expect, it } from 'vitest';
import { computeSafeToSpend } from '../safeToSpend';
import { buildForecast } from '../forecast';
import { parseQuickAdd } from '../parse';
import { createSeedState, SEED_CATEGORIES } from '../seed';
import { detectRecurring, invisibleSpend } from '../recurring';
import { money, moneyWhole, round2, signedMoney } from '../format';
import { validateState } from '../storage';
import { compareToPreviousMonth, netWorthSeries, spendByCategory } from '../insights';

/**
 * The nineteenth of a 31 day month, which is what the seed is tuned around.
 * Every expected number below was worked out by hand from the seed rows.
 */
const TODAY = new Date(2026, 7, 19, 10, 0, 0);

describe('computeSafeToSpend', () => {
  const state = createSeedState(TODAY);
  const s = computeSafeToSpend(state, TODAY);

  it('sums every fixed bill dated in the month, paid or not', () => {
    // 32.00 gym + 15.49 Netflix + 54.00 internet + 11.99 Spotify + 680 rent
    expect(s.fixedBillsThisMonth).toBe(793.48);
  });

  it('takes fixed bills and the savings goal off the top', () => {
    // 3680 income - 793.48 fixed - 500 savings
    expect(s.spendableThisMonth).toBe(2386.52);
  });

  it('counts only discretionary spending as already spent', () => {
    expect(s.alreadySpentThisMonth).toBe(1710.32);
    expect(s.remainingThisMonth).toBe(676.2);
  });

  it('divides what is left across the days that are left, today included', () => {
    expect(s.daysInMonth).toBe(31);
    expect(s.daysLeftIncludingToday).toBe(13);
    expect(s.safeToSpendToday).toBe(52.02); // 676.20 / 13
  });

  it('holds the daily pace steady across the whole month', () => {
    expect(s.dailyPace).toBe(76.98); // 2386.52 / 31
    expect(s.paceDelta).toBe(-24.96);
  });

  it('reports the share of the pot already used', () => {
    expect(Math.round(s.usedFraction * 100)).toBe(72);
  });

  it('lists only the bills that have not landed yet', () => {
    expect(s.upcomingBills).toHaveLength(1);
    expect(s.upcomingBills[0].note).toBe('Rent');
  });

  it('does not move when a known bill is paid', () => {
    // Marking rent as already paid moves it from upcoming to paid. Because it
    // was subtracted up front either way, the number the user reads is the
    // same. This is the property the whole formula exists to protect.
    const rent = state.transactions.find((t) => t.note === 'Rent')!;
    const paid = {
      ...state,
      transactions: state.transactions.map((t) =>
        t.id === rent.id ? { ...t, date: new Date(2026, 7, 18, 9).toISOString() } : t,
      ),
    };
    const after = computeSafeToSpend(paid, TODAY);
    expect(after.safeToSpendToday).toBe(s.safeToSpendToday);
    expect(after.dailyPace).toBe(s.dailyPace);
  });

  it('never goes below zero, and says so', () => {
    const broke = {
      ...state,
      transactions: [
        ...state.transactions,
        {
          id: 'tx_big',
          amount: 5000,
          type: 'expense' as const,
          categoryId: 'cat_dining',
          date: new Date(2026, 7, 10, 12).toISOString(),
        },
      ],
    };
    const after = computeSafeToSpend(broke, TODAY);
    expect(after.safeToSpendToday).toBe(0);
    expect(after.atLimit).toBe(true);
    expect(after.remainingThisMonth).toBeLessThan(0);
  });

  it('handles an empty account without dividing by nothing', () => {
    const empty = { ...state, transactions: [] };
    const after = computeSafeToSpend(empty, TODAY);
    expect(after.spendableThisMonth).toBe(3180); // 3680 - 0 - 500
    expect(after.safeToSpendToday).toBeCloseTo(244.62, 2);
    expect(after.usedFraction).toBe(0);
  });
});

describe('buildForecast', () => {
  const state = createSeedState(TODAY);
  const s = computeSafeToSpend(state, TODAY);
  const f = buildForecast(s, TODAY);

  it('projects seven days starting with today', () => {
    expect(f.days).toHaveLength(7);
    expect(f.days[0].isToday).toBe(true);
    expect(f.days[0].label).toBe('Today');
  });

  it('drains at the daily pace until a bill lands', () => {
    expect(f.days[0].projected).toBe(1279.22); // 676.20 + 680 rent held back - 76.98
    expect(f.days[1].projected).toBe(1202.24);
    expect(f.days[2].projected).toBe(1125.26);
  });

  it('shows rent as a real cliff on the day it lands', () => {
    const rentDay = f.days[3];
    expect(rentDay.bills).toHaveLength(1);
    expect(rentDay.bills[0].amount).toBe(680);
    expect(rentDay.projected).toBe(368.28); // 1048.28 - 680
  });

  it('marks the days after rent as tight', () => {
    expect(f.tightThreshold).toBe(538.86); // a week of everyday spending
    expect(f.days.slice(0, 3).every((d) => !d.isTight)).toBe(true);
    expect(f.days.slice(3).every((d) => d.isTight)).toBe(true);
  });

  it('warns about the bill that causes the dip', () => {
    expect(f.warning?.tx.note).toBe('Rent');
    expect(f.warning?.day.date.getDate()).toBe(22);
  });

  it('stays quiet when the month can absorb the bill', () => {
    const rich = { ...state, monthlyIncome: 9000 };
    const rs = computeSafeToSpend(rich, TODAY);
    const rf = buildForecast(rs, TODAY);
    expect(rf.warning).toBeNull();
    expect(rf.days.some((d) => d.isTight)).toBe(false);
  });
});

describe('parseQuickAdd', () => {
  const cats = SEED_CATEGORIES;

  it('parses keyword then amount', () => {
    const r = parseQuickAdd('coffee 4.50', cats);
    expect(r.amount).toBe(4.5);
    expect(r.categoryId).toBe('cat_coffee');
    expect(r.type).toBe('expense');
  });

  it('parses amount then keyword', () => {
    const r = parseQuickAdd('4.50 coffee', cats);
    expect(r.amount).toBe(4.5);
    expect(r.categoryId).toBe('cat_coffee');
  });

  it('ignores a currency symbol and thousands separators', () => {
    expect(parseQuickAdd('$12.30 lunch', cats).amount).toBe(12.3);
    expect(parseQuickAdd('rent 1,240', cats).amount).toBe(1240);
  });

  it('maps a merchant to a category and keeps it as the note', () => {
    const r = parseQuickAdd('starbucks 6', cats);
    expect(r.categoryId).toBe('cat_coffee');
    expect(r.note).toBe('Starbucks');
    expect(r.matchedOn).toBe('starbucks');
  });

  it('recognises income and looks only at income categories', () => {
    const r = parseQuickAdd('paycheck 1840', cats);
    expect(r.type).toBe('income');
    expect(r.categoryId).toBe('cat_payroll');
    expect(r.amount).toBe(1840);
  });

  it('matches a category the user typed by name', () => {
    expect(parseQuickAdd('transport 30', cats).categoryId).toBe('cat_transport');
  });

  it('falls back to a prefix match', () => {
    expect(parseQuickAdd('sub 9.99', cats).categoryId).toBe('cat_subs');
  });

  it('returns a blank result for empty input, and no category when unsure', () => {
    expect(parseQuickAdd('   ', cats).amount).toBeNull();
    const odd = parseQuickAdd('zzzz 10', cats);
    expect(odd.amount).toBe(10);
    expect(odd.categoryId).toBeNull();
  });

  it('does not read a date as an amount', () => {
    expect(parseQuickAdd('lunch 8/12', cats).amount).toBeNull();
  });
});

describe('detectRecurring', () => {
  const state = createSeedState(TODAY);
  const charges = detectRecurring(state, TODAY);

  it('finds every flagged charge, largest first', () => {
    expect(charges.map((c) => c.label)).toEqual([
      'Rent',
      'Internet',
      'Gym membership',
      'Netflix',
      'Spotify',
    ]);
  });

  it('totals the invisible spend', () => {
    expect(invisibleSpend(charges)).toBe(793.48);
  });

  it('expects the next charge one month on', () => {
    const netflix = charges.find((c) => c.label === 'Netflix')!;
    expect(netflix.nextExpected.getMonth()).toBe(8); // September
    expect(netflix.nextExpected.getDate()).toBe(6);
  });

  it('flags a subscription with no ordinary activity behind it', () => {
    const gym = charges.find((c) => c.label === 'Gym membership')!;
    expect(gym.looksUnused).toBe(true);
    const internet = charges.find((c) => c.label === 'Internet')!;
    expect(internet.looksUnused).toBe(false); // Home has real spending in it
  });

  it('never calls rent a forgotten subscription', () => {
    // Rent has no ordinary activity behind it either, so the 60 day rule alone
    // would flag it. A charge that large is a bill, and flagging it would make
    // the whole signal worth ignoring.
    const rent = charges.find((c) => c.label === 'Rent')!;
    expect(rent.looksUnused).toBe(false);
  });
});

describe('insights', () => {
  const state = createSeedState(TODAY);

  it('compares the same stretch of days, not a full month against a part one', () => {
    const month = new Date(2026, 7, 1);
    const c = compareToPreviousMonth(state, month, TODAY);
    expect(c.cutoffDay).toBe(19);
    expect(c.now).toBe(1823.8); // 1710.32 discretionary + 113.48 bills paid
    expect(c.before).toBe(1511.8);
    expect(c.delta).toBe(312);
    expect(c.hasPrevious).toBe(true);
  });

  it('totals spending by category, largest first', () => {
    const rows = spendByCategory(state.transactions, new Date(2026, 7, 1), state.categories);
    expect(rows[0].category?.name).toBe('Rent');
    expect(rows[0].total).toBe(680);
    // Every expense category with activity gets a row, none are dropped.
    expect(rows.map((r) => r.category?.name)).toContain('Coffee');
  });

  it('projects the month in progress to month end', () => {
    const series = netWorthSeries(state, TODAY);
    expect(series).toHaveLength(7); // six seeded, one projected
    expect(series[5].value).toBe(4120);
    expect(series[6].live).toBe(true);

    // On plan, the month adds the 500 savings goal. Nineteen days at a 76.98
    // pace is 1462.62 expected against 1710.32 actual, so it is 247.70 adrift:
    // 4120 + 500 - 247.70.
    expect(series[6].value).toBe(4372.3);

    // The projection continues the trend rather than spiking above it.
    expect(series[6].value).toBeGreaterThan(series[5].value);
    expect(series[6].value - series[5].value).toBeLessThan(400);
  });

  it('moves the projection when spending is added', () => {
    const before = netWorthSeries(state, TODAY)[6].value;
    const after = netWorthSeries(
      {
        ...state,
        transactions: [
          ...state.transactions,
          {
            id: 'tx_new',
            amount: 100,
            type: 'expense' as const,
            categoryId: 'cat_dining',
            date: new Date(2026, 7, 19, 12).toISOString(),
          },
        ],
      },
      TODAY,
    )[6].value;
    expect(after).toBeLessThan(before);
  });
});

describe('formatting', () => {
  it('rounds before it displays, never after', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(money(0.1 + 0.2, 'USD')).toBe('$0.30');
    expect(money(1710.325, 'USD')).toBe('$1,710.33');
  });

  it('drops cents on the hero number only', () => {
    expect(moneyWhole(52.02, 'USD')).toBe('$52');
    expect(money(52.02, 'USD')).toBe('$52.02');
  });

  it('signs expenses and income', () => {
    expect(signedMoney(4.75, 'expense', 'USD')).toBe('-$4.75');
    expect(signedMoney(1840, 'income', 'USD')).toBe('+$1,840.00');
  });
});

describe('validateState', () => {
  it('accepts what the app exports', () => {
    const state = createSeedState(TODAY);
    const round = validateState(JSON.parse(JSON.stringify(state)));
    expect(round).not.toBeNull();
    expect(round!.transactions).toHaveLength(state.transactions.length);
  });

  it('rejects a file that is the wrong shape', () => {
    expect(validateState(null)).toBeNull();
    expect(validateState({ hello: 'world' })).toBeNull();
    expect(validateState({ transactions: [], categories: [], monthlyIncome: 'lots' })).toBeNull();
  });
});
