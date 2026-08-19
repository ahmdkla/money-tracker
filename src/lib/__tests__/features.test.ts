import { describe, expect, it } from 'vitest';
import { createSeedState, SEED_CATEGORIES } from '../seed';
import { expandRecurring, seriesKey } from '../recurringEngine';
import {
  EMPTY_FILTER,
  activeFilterCount,
  filterTransactions,
  isFilterActive,
  summarise,
} from '../filter';
import { buildDrafts, guessColumns, parseAmount, parseCsv, parseDate } from '../csv';
import { reducer } from '../../store/reducer';

const TODAY = new Date(2026, 7, 19, 10, 0, 0);

/* ------------------------------------------------- recurring engine ---- */

describe('expandRecurring', () => {
  const state = createSeedState(TODAY);

  it('creates the next instance of each bill, and no more than the horizon', () => {
    const { created } = expandRecurring(state, TODAY);
    expect(created.length).toBeGreaterThan(0);
    // Every created row is a bill, and none is in the past.
    expect(created.every((t) => t.recurring && t.type === 'expense')).toBe(true);
    expect(created.every((t) => new Date(t.date) > TODAY)).toBe(true);
    // Nothing beyond two months out.
    const limit = new Date(2026, 9, 20);
    expect(created.every((t) => new Date(t.date) <= limit)).toBe(true);
  });

  it('carries the amount, category and merchant across', () => {
    const { created } = expandRecurring(state, TODAY);
    const netflix = created.find((t) => t.note === 'Netflix');
    expect(netflix).toBeDefined();
    expect(netflix!.amount).toBe(15.49);
    expect(netflix!.categoryId).toBe('cat_subs');
  });

  it('is idempotent: running it twice creates nothing the second time', () => {
    const first = expandRecurring(state, TODAY);
    const after = { ...state, transactions: [...state.transactions, ...first.created] };
    const second = expandRecurring(after, TODAY);
    expect(second.created).toHaveLength(0);
  });

  it('never doubles up on a month that already has the bill', () => {
    const { created } = expandRecurring(state, TODAY);
    const seen = new Set<string>();
    for (const t of created) {
      const d = new Date(t.date);
      const key = `${seriesKey(t)}|${d.getFullYear()}-${d.getMonth()}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('leaves a stopped series alone', () => {
    const rent = state.transactions.find((t) => t.note === 'Rent')!;
    const key = seriesKey(rent);
    const stopped = { ...state, endedSeries: [key] };
    const { created, skippedSeries } = expandRecurring(stopped, TODAY);
    expect(skippedSeries).toContain(key);
    expect(created.some((t) => seriesKey(t) === key)).toBe(false);
  });

  it('does nothing at all when there are no bills', () => {
    const none = {
      ...state,
      transactions: state.transactions.filter((t) => !t.recurring),
    };
    expect(expandRecurring(none, TODAY).created).toHaveLength(0);
  });
});

describe('stopping a series', () => {
  const state = createSeedState(TODAY);
  const rent = state.transactions.find((t) => t.note === 'Rent')!;
  const key = seriesKey(rent);

  it('removes future instances but keeps what has already been paid', () => {
    const withFuture = {
      ...state,
      transactions: [...state.transactions, ...expandRecurring(state, TODAY).created],
    };
    const paidBefore = withFuture.transactions.filter(
      (t) => seriesKey(t) === key && new Date(t.date) <= TODAY,
    ).length;

    const after = reducer(withFuture, { type: 'series/end', key });

    expect(after.endedSeries).toContain(key);
    expect(after.transactions.filter((t) => seriesKey(t) === key && new Date(t.date) > TODAY))
      .toHaveLength(0);
    expect(
      after.transactions.filter((t) => seriesKey(t) === key && new Date(t.date) <= TODAY).length,
    ).toBe(paidBefore);
  });

  it('and then the engine respects it', () => {
    const after = reducer(state, { type: 'series/end', key });
    expect(expandRecurring(after, TODAY).created.some((t) => seriesKey(t) === key)).toBe(false);
  });
});

/* -------------------------------------------------------- filtering ---- */

describe('filterTransactions', () => {
  const state = createSeedState(TODAY);
  const all = state.transactions;
  const cats = state.categories;

  it('returns everything when nothing is set', () => {
    expect(filterTransactions(all, cats, EMPTY_FILTER)).toHaveLength(all.length);
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
  });

  it('searches notes, category names and amounts', () => {
    expect(
      filterTransactions(all, cats, { ...EMPTY_FILTER, text: 'blue bottle' }).length,
    ).toBeGreaterThan(0);
    const byCategory = filterTransactions(all, cats, { ...EMPTY_FILTER, text: 'groceries' });
    expect(byCategory.every((t) => t.categoryId === 'cat_groceries')).toBe(true);
    // Rent is 680 in both seeded months, so an amount search finds both.
    const byAmount = filterTransactions(all, cats, { ...EMPTY_FILTER, text: '680' });
    expect(byAmount).toHaveLength(2);
    expect(byAmount.every((t) => t.note === 'Rent')).toBe(true);
  });

  it('filters by direction', () => {
    const income = filterTransactions(all, cats, { ...EMPTY_FILTER, type: 'income' });
    expect(income.length).toBeGreaterThan(0);
    expect(income.every((t) => t.type === 'income')).toBe(true);
  });

  it('filters by category, allowing several', () => {
    const r = filterTransactions(all, cats, {
      ...EMPTY_FILTER,
      categoryIds: ['cat_coffee', 'cat_dining'],
    });
    expect(r.every((t) => ['cat_coffee', 'cat_dining'].includes(t.categoryId))).toBe(true);
    expect(r.length).toBeGreaterThan(0);
  });

  it('filters by an inclusive date range', () => {
    const r = filterTransactions(all, cats, {
      ...EMPTY_FILTER,
      from: '2026-08-01',
      to: '2026-08-19',
    });
    expect(r.length).toBeGreaterThan(0);
    for (const t of r) {
      const d = new Date(t.date);
      expect(d.getMonth()).toBe(7);
      expect(d.getDate()).toBeGreaterThanOrEqual(1);
      expect(d.getDate()).toBeLessThanOrEqual(19);
    }
  });

  it('filters by amount, and by bills only', () => {
    const big = filterTransactions(all, cats, { ...EMPTY_FILTER, min: '100' });
    expect(big.every((t) => t.amount >= 100)).toBe(true);

    const bills = filterTransactions(all, cats, { ...EMPTY_FILTER, recurringOnly: true });
    expect(bills.every((t) => t.recurring)).toBe(true);
  });

  it('combines filters rather than replacing them', () => {
    const r = filterTransactions(all, cats, {
      ...EMPTY_FILTER,
      type: 'expense',
      categoryIds: ['cat_groceries'],
      min: '100',
    });
    expect(r.every((t) => t.type === 'expense' && t.categoryId === 'cat_groceries' && t.amount >= 100)).toBe(true);
  });

  it('counts what is active, for the badge', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTER, text: 'x', type: 'expense' })).toBe(2);
    expect(activeFilterCount({ ...EMPTY_FILTER, from: '2026-01-01', to: '2026-02-01' })).toBe(1);
  });

  it('totals what survived', () => {
    // Two seeded months, paid semi-monthly: four payrolls of 1840.
    const s = summarise(filterTransactions(all, cats, { ...EMPTY_FILTER, type: 'income' }));
    expect(s.received).toBe(7360);
    expect(s.spent).toBe(0);
    expect(s.net).toBe(7360);
  });
});

/* ------------------------------------------------------------- CSV ----- */

describe('csv parsing', () => {
  it('handles quoted fields containing commas', () => {
    const rows = parseCsv('Date,Description,Amount\n2026-08-01,"COFFEE, LARGE",-4.50\n');
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe('COFFEE, LARGE');
    expect(rows[1][2]).toBe('-4.50');
  });

  it('handles doubled quotes as an escape', () => {
    const rows = parseCsv('a,b\n1,"say ""hi"" now"\n');
    expect(rows[1][1]).toBe('say "hi" now');
  });

  it('reads the amount formats banks actually produce', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('(45.00)')).toBe(-45);
    expect(parseAmount('-45.00')).toBe(-45);
    expect(parseAmount('$45')).toBe(45);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('n/a')).toBeNull();
  });

  it('reads dates in the orders banks actually produce', () => {
    expect(parseDate('2026-08-19')!.getMonth()).toBe(7);
    expect(parseDate('19/08/2026', 'dmy')!.getDate()).toBe(19);
    expect(parseDate('08/19/2026', 'mdy')!.getDate()).toBe(19);
    // Unambiguous without a hint, because 19 cannot be a month.
    expect(parseDate('19/08/2026')!.getDate()).toBe(19);
    expect(parseDate('not a date')).toBeNull();
  });

  it('guesses the columns from the header row', () => {
    const rows = parseCsv(
      'Transaction Date,Description,Amount\n' +
        '01/08/2026,TESCO STORES,-42.10\n' +
        '02/08/2026,SALARY,1840.00\n',
    );
    const map = guessColumns(rows);
    expect(map.hasHeader).toBe(true);
    expect(map.date).toBe(0);
    expect(map.description).toBe(1);
    expect(map.amount).toBe(2);
  });

  it('builds drafts, assigns categories and flags duplicates', () => {
    const state = createSeedState(TODAY);
    const rows = parseCsv(
      'Date,Description,Amount\n' +
        '2026-08-25,STARBUCKS STORE 4471,-5.25\n' +
        '2026-08-25,UBER TRIP,-18.40\n' +
        '2026-08-26,MYSTERY VENDOR,-9.99\n',
    );
    const map = guessColumns(rows);
    const { drafts, rejected } = buildDrafts(rows, map, SEED_CATEGORIES, state.transactions);

    expect(rejected).toHaveLength(0);
    expect(drafts).toHaveLength(3);

    // The merchant matcher does the obvious ones.
    expect(drafts[0].categoryId).toBe('cat_coffee');
    expect(drafts[1].categoryId).toBe('cat_transport');
    // And leaves the ones it cannot place, rather than guessing wrong.
    expect(drafts[2].categoryId).toBeNull();

    expect(drafts.every((d) => d.type === 'expense')).toBe(true);
    expect(drafts[0].amount).toBe(5.25);
  });

  it('finds the merchant inside a mangled bank description', () => {
    const rows = parseCsv(
      'Date,Description,Amount\n' +
        '2026-08-21,"NETFLIX.COM, AMSTERDAM",-15.49\n' +
        '2026-08-21,UBER   *TRIP HELP.UBER.CO,-18.40\n' +
        '2026-08-21,TESCO-STORES-3299,-42.10\n' +
        '2026-08-22,ACME LTD SALARY,1840.00\n',
    );
    const { drafts } = buildDrafts(rows, guessColumns(rows), SEED_CATEGORIES, []);
    expect(drafts[0].categoryId).toBe('cat_subs');      // NETFLIX.COM
    expect(drafts[1].categoryId).toBe('cat_transport'); // UBER *TRIP
    expect(drafts[2].categoryId).toBe('cat_groceries'); // TESCO-STORES
    expect(drafts[3].categoryId).toBe('cat_payroll');   // and income still works
    expect(drafts[3].type).toBe('income');
  });

  it('does not guess from a short fragment inside an unrelated word', () => {
    // "gas" lives inside "Vegas"; a confident wrong category is worse than none.
    const rows = parseCsv(
      'Date,Description,Amount\n2026-08-21,VEGAS HOTEL,-220.00\n',
    );
    const { drafts } = buildDrafts(rows, guessColumns(rows), SEED_CATEGORIES, []);
    expect(drafts[0].categoryId).toBeNull();
  });

  it('unticks a row that is already recorded', () => {
    const state = createSeedState(TODAY);
    const existing = state.transactions.find((t) => t.note === 'Blue Bottle')!;
    const d = new Date(existing.date);
    const line = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const rows = parseCsv(`Date,Description,Amount\n${line},Blue Bottle,-${existing.amount}\n`);
    const map = guessColumns(rows);
    const { drafts } = buildDrafts(rows, map, SEED_CATEGORIES, state.transactions);

    expect(drafts[0].duplicateOf).toBe(existing.id);
    expect(drafts[0].include).toBe(false);
  });

  it('reads separate money in and money out columns', () => {
    const rows = parseCsv(
      'Date,Details,Paid out,Paid in\n2026-08-01,RENT,680.00,\n2026-08-03,PAYROLL,,1840.00\n',
    );
    const map = guessColumns(rows);
    expect(map.debit).toBeGreaterThanOrEqual(0);
    expect(map.credit).toBeGreaterThanOrEqual(0);

    const { drafts } = buildDrafts(rows, { ...map, amount: -1 }, SEED_CATEGORIES, []);
    expect(drafts[0].type).toBe('expense');
    expect(drafts[0].amount).toBe(680);
    expect(drafts[1].type).toBe('income');
    expect(drafts[1].amount).toBe(1840);
  });
});
