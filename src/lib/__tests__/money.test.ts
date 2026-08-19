import { describe, expect, it } from 'vitest';
import { computeSafeToSpend } from '../safeToSpend';
import { buildForecast } from '../forecast';
import { parseQuickAdd } from '../parse';
import { createSeedState, SEED_CATEGORIES } from '../seed';
import { detectRecurring, invisibleSpend } from '../recurring';
import { money, moneyCompact, moneyWhole, round2, setFormatLocale, signedMoney } from '../format';
import { validateState } from '../storage';
import { compareToPreviousMonth, netWorthSeries, spendByCategory } from '../insights';

/**
 * The nineteenth of a 31 day month, which is what the seed is tuned around.
 * Every expected number below was worked out by hand from the seed rows, in
 * rupiah, which is what the app now ships with.
 */
const TODAY = new Date(2026, 7, 19, 10, 0, 0);

describe('computeSafeToSpend', () => {
  const state = createSeedState(TODAY);
  const s = computeSafeToSpend(state, TODAY);

  it('sums every fixed bill dated in the month, paid or not', () => {
    // 350k gym + 65k Netflix + 350k internet + 55k Spotify + 2.8M rent
    expect(s.fixedBillsThisMonth).toBe(3_620_000);
  });

  it('takes fixed bills and the savings goal off the top', () => {
    // 12M income - 3.62M fixed - 1.5M savings
    expect(s.spendableThisMonth).toBe(6_880_000);
  });

  it('counts only discretionary spending as already spent', () => {
    expect(s.alreadySpentThisMonth).toBe(5_131_000);
    expect(s.remainingThisMonth).toBe(1_749_000);
  });

  it('divides what is left across the days that are left, today included', () => {
    expect(s.daysInMonth).toBe(31);
    expect(s.daysLeftIncludingToday).toBe(13);
    expect(s.safeToSpendToday).toBe(134_538.46); // 1,749,000 / 13
  });

  it('holds the daily pace steady across the whole month', () => {
    expect(s.dailyPace).toBe(221_935.48); // 6,880,000 / 31
    expect(s.paceDelta).toBe(-87_397.02);
  });

  it('reports the share of the pot already used', () => {
    expect(Math.round(s.usedFraction * 100)).toBe(75);
  });

  it('lists only the bills that have not landed yet', () => {
    expect(s.upcomingBills).toHaveLength(1);
    expect(s.upcomingBills[0].note).toBe('Sewa kos');
  });

  it('does not move when a known bill is paid', () => {
    // Marking rent as already paid moves it from upcoming to paid. Because it
    // was subtracted up front either way, the number the user reads is the
    // same. This is the property the whole formula exists to protect.
    const rent = state.transactions.find((t) => t.note === 'Sewa kos')!;
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
          amount: 20_000_000,
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
    expect(after.spendableThisMonth).toBe(10_500_000); // 12M - 0 - 1.5M
    expect(after.safeToSpendToday).toBeCloseTo(807_692.31, 2);
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
    // 1,749,000 left + 2,800,000 of rent still held back, less one day of pace.
    expect(f.days[0].projected).toBe(4_327_064.52);
    expect(f.days[1].projected).toBe(4_105_129.04);
    expect(f.days[2].projected).toBe(3_883_193.56);
  });

  it('shows rent as a real cliff on the day it lands', () => {
    const rentDay = f.days[3];
    expect(rentDay.bills).toHaveLength(1);
    expect(rentDay.bills[0].amount).toBe(2_800_000);
    expect(rentDay.projected).toBe(861_258.08); // 3,661,258.08 - 2,800,000
  });

  it('marks the days after rent as tight', () => {
    expect(f.tightThreshold).toBe(1_553_548.36); // a week of everyday spending
    expect(f.days.slice(0, 3).every((d) => !d.isTight)).toBe(true);
    expect(f.days.slice(3).every((d) => d.isTight)).toBe(true);
  });

  it('warns about the bill that causes the dip', () => {
    expect(f.warning?.tx.note).toBe('Sewa kos');
    expect(f.warning?.day.date.getDate()).toBe(22);
  });

  it('stays quiet when the month can absorb the bill', () => {
    const rich = { ...state, monthlyIncome: 30_000_000 };
    const rs = computeSafeToSpend(rich, TODAY);
    const rf = buildForecast(rs, TODAY);
    expect(rf.warning).toBeNull();
    expect(rf.days.some((d) => d.isTight)).toBe(false);
  });
});

describe('parseQuickAdd', () => {
  const cats = SEED_CATEGORIES;

  it('parses keyword then amount', () => {
    const r = parseQuickAdd('kopi 25000', cats);
    expect(r.amount).toBe(25000);
    expect(r.categoryId).toBe('cat_coffee');
    expect(r.type).toBe('expense');
  });

  it('parses amount then keyword', () => {
    const r = parseQuickAdd('25000 kopi', cats);
    expect(r.amount).toBe(25000);
    expect(r.categoryId).toBe('cat_coffee');
  });

  it('still understands the English words, whichever language is showing', () => {
    const r = parseQuickAdd('coffee 4.50', cats);
    expect(r.amount).toBe(4.5);
    expect(r.categoryId).toBe('cat_coffee');
  });

  it('ignores a currency symbol and thousands separators', () => {
    expect(parseQuickAdd('$12.30 lunch', cats).amount).toBe(12.3);
    expect(parseQuickAdd('sewa 2,800,000', cats).amount).toBe(2800000);
  });

  it('maps a merchant to a category and keeps it as the note', () => {
    const r = parseQuickAdd('starbucks 6', cats);
    expect(r.categoryId).toBe('cat_coffee');
    expect(r.note).toBe('Starbucks');
    expect(r.matchedOn).toBe('starbucks');
  });

  it('recognises income and looks only at income categories', () => {
    const r = parseQuickAdd('gaji 6000000', cats);
    expect(r.type).toBe('income');
    expect(r.categoryId).toBe('cat_payroll');
    expect(r.amount).toBe(6000000);
  });

  it('recognises income in English too', () => {
    expect(parseQuickAdd('paycheck 1840', cats).type).toBe('income');
  });

  it('matches a category the user typed by name', () => {
    expect(parseQuickAdd('transportasi 30000', cats).categoryId).toBe('cat_transport');
    expect(parseQuickAdd('transport 30000', cats).categoryId).toBe('cat_transport');
  });

  it('falls back to a prefix match on the category name', () => {
    expect(parseQuickAdd('langgan 55000', cats).categoryId).toBe('cat_subs');
  });

  it('returns a blank result for empty input, and no category when unsure', () => {
    expect(parseQuickAdd('   ', cats).amount).toBeNull();
    const odd = parseQuickAdd('zzzz 10', cats);
    expect(odd.amount).toBe(10);
    expect(odd.categoryId).toBeNull();
  });

  it('does not read a date as an amount', () => {
    expect(parseQuickAdd('makan 8/12', cats).amount).toBeNull();
  });
});

describe('detectRecurring', () => {
  const state = createSeedState(TODAY);
  const charges = detectRecurring(state, TODAY);

  it('finds every flagged charge, largest first', () => {
    expect(charges.map((c) => c.label)).toEqual([
      'Sewa kos',
      'Internet',
      'Membership gym',
      'Netflix',
      'Spotify',
    ]);
  });

  it('totals the invisible spend', () => {
    expect(invisibleSpend(charges)).toBe(3_620_000);
  });

  it('expects the next charge one month on', () => {
    const netflix = charges.find((c) => c.label === 'Netflix')!;
    expect(netflix.nextExpected.getMonth()).toBe(8); // September
    expect(netflix.nextExpected.getDate()).toBe(6);
  });

  it('flags a subscription with no ordinary activity behind it', () => {
    const gym = charges.find((c) => c.label === 'Membership gym')!;
    expect(gym.looksUnused).toBe(true);
    const internet = charges.find((c) => c.label === 'Internet')!;
    expect(internet.looksUnused).toBe(false); // Rumah has real spending in it
  });

  it('never calls rent a forgotten subscription', () => {
    // Rent has no ordinary activity behind it either, so the 60 day rule alone
    // would flag it. A charge that large is a bill, and flagging it would make
    // the whole signal worth ignoring.
    const rent = charges.find((c) => c.label === 'Sewa kos')!;
    expect(rent.looksUnused).toBe(false);
  });
});

describe('insights', () => {
  const state = createSeedState(TODAY);

  it('compares the same stretch of days, not a full month against a part one', () => {
    const month = new Date(2026, 7, 1);
    const c = compareToPreviousMonth(state, month, TODAY);
    expect(c.cutoffDay).toBe(19);
    expect(c.now).toBe(5_951_000); // 5,131,000 discretionary + 820,000 bills paid
    expect(c.before).toBe(5_017_000);
    expect(c.delta).toBe(934_000);
    expect(c.hasPrevious).toBe(true);
  });

  it('totals spending by category, largest first', () => {
    const rows = spendByCategory(state.transactions, new Date(2026, 7, 1), state.categories);
    expect(rows[0].category?.name).toBe('Sewa');
    expect(rows[0].total).toBe(2_800_000);
    // Every expense category with activity gets a row, none are dropped.
    expect(rows.map((r) => r.category?.name)).toContain('Kopi');
  });

  it('projects the month in progress to month end', () => {
    const series = netWorthSeries(state, TODAY);
    expect(series).toHaveLength(7); // six seeded, one projected
    expect(series[5].value).toBe(14_600_000);
    expect(series[6].live).toBe(true);

    // On plan the month adds the 1.5M savings goal, less however far ahead of
    // the daily pace the first nineteen days actually ran.
    expect(series[6].value).toBe(15_185_774.12);

    // The projection continues the trend rather than spiking above it.
    expect(series[6].value).toBeGreaterThan(series[5].value);
    expect(series[6].value - series[5].value).toBeLessThan(1_000_000);
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
            amount: 400_000,
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
  // Formatting reads a module level locale, so each block states the one it
  // means rather than inheriting whatever ran before it.
  it('rounds before it displays, never after', () => {
    setFormatLocale('en-US');
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(money(0.1 + 0.2, 'USD')).toBe('$0.30');
    expect(money(1710.325, 'USD')).toBe('$1,710.33');
  });

  it('drops cents on the hero number only', () => {
    setFormatLocale('en-US');
    expect(moneyWhole(52.02, 'USD')).toBe('$52');
    expect(money(52.02, 'USD')).toBe('$52.02');
  });

  it('signs expenses and income', () => {
    setFormatLocale('en-US');
    expect(signedMoney(4.75, 'expense', 'USD')).toBe('-$4.75');
    expect(signedMoney(1840, 'income', 'USD')).toBe('+$1,840.00');
  });

  it('never shows rupiah with cents, because rupiah has none', () => {
    setFormatLocale('id-ID');
    // A non-breaking space separates the symbol from the digits in id-ID.
    expect(money(25_000, 'IDR').replace(/\u00a0/g, ' ')).toBe('Rp 25.000');
    expect(money(25_000.4, 'IDR').replace(/\u00a0/g, ' ')).toBe('Rp 25.000');
  });

  it('shortens on the scale the language actually counts in', () => {
    setFormatLocale('id-ID');
    expect(moneyCompact(2_800_000, 'IDR').replace(/\u00a0/g, ' ')).toBe('Rp 2,8 jt');
    expect(moneyCompact(350_000, 'IDR').replace(/\u00a0/g, ' ')).toBe('Rp 350 rb');

    setFormatLocale('en-US');
    expect(moneyCompact(1400, 'USD')).toBe('$1.4k');
    expect(moneyCompact(2_400_000, 'USD')).toBe('$2.4M');
    // Below a thousand it stays whole, in either language.
    expect(moneyCompact(52, 'USD')).toBe('$52');
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
