import { describe, expect, it } from 'vitest';
import {
  FALLBACK_EXPENSE_ID,
  FALLBACK_INCOME_ID,
  SEED_CATEGORIES,
  createEmptyState,
  createSeedState,
} from '../seed';
import { validateState } from '../storage';
import { reducer } from '../../store/reducer';
import { parseQuickAdd } from '../parse';
import { setFormatLocale } from '../format';
import { formatAmountInput, sanitiseAmount } from '../../components/TransactionSheet';

const TODAY = new Date(2026, 7, 19, 10, 0, 0);

/* ------------------------------------------------- the catch-all rows -- */

describe('the catch-all categories', () => {
  it('ship with the app, one for each direction', () => {
    const expense = SEED_CATEGORIES.find((c) => c.id === FALLBACK_EXPENSE_ID)!;
    const income = SEED_CATEGORIES.find((c) => c.id === FALLBACK_INCOME_ID)!;
    expect(expense.kind).toBe('expense');
    expect(income.kind).toBe('income');
  });

  it('survive starting fresh, so an empty account can still record something', () => {
    const empty = createEmptyState(TODAY);
    expect(empty.categories.some((c) => c.id === FALLBACK_EXPENSE_ID)).toBe(true);
    expect(empty.categories.some((c) => c.id === FALLBACK_INCOME_ID)).toBe(true);
  });

  it('are added to a save made before they existed', () => {
    const older = JSON.parse(JSON.stringify(createSeedState(TODAY)));
    older.categories = older.categories.filter(
      (c: { id: string }) => c.id !== FALLBACK_EXPENSE_ID && c.id !== FALLBACK_INCOME_ID,
    );
    const loaded = validateState(older)!;
    expect(loaded.categories.some((c) => c.id === FALLBACK_EXPENSE_ID)).toBe(true);
    expect(loaded.categories.some((c) => c.id === FALLBACK_INCOME_ID)).toBe(true);
  });

  it('are named in whichever language the save was in', () => {
    const base = JSON.parse(JSON.stringify(createSeedState(TODAY)));
    base.categories = base.categories.filter(
      (c: { id: string }) => c.id !== FALLBACK_EXPENSE_ID && c.id !== FALLBACK_INCOME_ID,
    );

    const indonesian = validateState({ ...base, lang: 'id' })!;
    expect(indonesian.categories.find((c) => c.id === FALLBACK_EXPENSE_ID)!.name).toBe('Lainnya');

    const english = validateState({ ...base, lang: 'en' })!;
    expect(english.categories.find((c) => c.id === FALLBACK_EXPENSE_ID)!.name).toBe('Other');
  });

  it('are never added twice', () => {
    const twice = validateState(JSON.parse(JSON.stringify(validateState(createSeedState(TODAY))!)))!;
    const ids = twice.categories.map((c) => c.id);
    expect(ids.filter((id) => id === FALLBACK_EXPENSE_ID)).toHaveLength(1);
    expect(ids.filter((id) => id === FALLBACK_INCOME_ID)).toHaveLength(1);
  });

  it('are not something the matcher ever guesses on its own', () => {
    // The catch-all is where a record lands when nothing matched, so the
    // matcher returning it would defeat the point of having it.
    for (const text of ['gojek', 'kopi', 'superindo', 'zzz nothing']) {
      const guess = parseQuickAdd(text, SEED_CATEGORIES).categoryId;
      expect(guess).not.toBe(FALLBACK_EXPENSE_ID);
      expect(guess).not.toBe(FALLBACK_INCOME_ID);
    }
  });
});

/* ------------------------------------------------ guessing from a note -- */

describe('guessing the category from what was typed', () => {
  const cats = SEED_CATEGORIES;

  it('recognises the merchants people actually type', () => {
    expect(parseQuickAdd('Gojek', cats).categoryId).toBe('cat_transport');
    expect(parseQuickAdd('Kopi Kenangan', cats).categoryId).toBe('cat_coffee');
    expect(parseQuickAdd('Indomaret', cats).categoryId).toBe('cat_groceries');
    expect(parseQuickAdd('Netflix', cats).categoryId).toBe('cat_subs');
    expect(parseQuickAdd('Apotek', cats).categoryId).toBe('cat_health');
  });

  it('says nothing rather than guessing wrong', () => {
    expect(parseQuickAdd('Toko sebelah', cats).categoryId).toBeNull();
  });

  it('keeps the direction it worked out, so income never lands in an expense', () => {
    const income = parseQuickAdd('Gaji', cats);
    expect(income.type).toBe('income');
    expect(income.categoryId).toBe('cat_payroll');
  });
});

/* --------------------------------------------------------- amount field -- */

describe('the amount field', () => {
  it('groups the way the language does', () => {
    setFormatLocale('id-ID');
    expect(formatAmountInput('43000')).toBe('43.000');
    expect(formatAmountInput('2800000')).toBe('2.800.000');

    setFormatLocale('en-US');
    expect(formatAmountInput('43000')).toBe('43,000');
    expect(formatAmountInput('1400')).toBe('1,400');
  });

  it('reads back what it just wrote', () => {
    setFormatLocale('id-ID');
    expect(sanitiseAmount(formatAmountInput('2800000'), 0)).toBe('2800000');

    setFormatLocale('en-US');
    expect(sanitiseAmount(formatAmountInput('1234.56'), 2)).toBe('1234.56');
  });

  it('accepts the decimal character the keyboard actually offers', () => {
    setFormatLocale('id-ID');
    // An Indonesian keypad gives a comma; the stored value is still a number.
    expect(sanitiseAmount('12,50', 2)).toBe('12.50');
  });

  it('refuses a decimal point on a currency that has no cents', () => {
    setFormatLocale('id-ID');
    expect(sanitiseAmount('25000,75', 0)).toBe('25000');

    setFormatLocale('en-US');
    expect(sanitiseAmount('25000.75', 0)).toBe('25000');
  });

  it('treats a full stop as grouping in Indonesian, which is what it means', () => {
    setFormatLocale('id-ID');
    // "2.800.000" is two point eight million, not two point eight.
    expect(sanitiseAmount('2.800.000', 0)).toBe('2800000');
  });

  it('drops anything that is not a number', () => {
    setFormatLocale('en-US');
    expect(sanitiseAmount('Rp 43abc000', 2)).toBe('43000');
    expect(sanitiseAmount('', 2)).toBe('');
  });

  it('keeps one decimal point and trims the leading zeros', () => {
    setFormatLocale('en-US');
    expect(sanitiseAmount('1.2.3', 2)).toBe('1.23');
    expect(sanitiseAmount('007', 2)).toBe('7');
    expect(sanitiseAmount('0.5', 2)).toBe('0.5');
  });

  it('holds a rupiah figure long enough to be useful', () => {
    setFormatLocale('id-ID');
    // Twelve digits is a hundred billion rupiah, comfortably past any salary.
    expect(sanitiseAmount('999999999999', 0)).toBe('999999999999');
  });
});

/* ------------------------------------- a budget on a brand new category -- */

describe('setting a budget on a category that does not exist yet', () => {
  const TODAY_B = new Date(2026, 7, 19, 10, 0, 0);

  it('creates the category first, so the budget has something to point at', () => {
    const start = createSeedState(TODAY_B);
    const id = 'cat_school';

    // The order the sheet dispatches in. Reversing it would leave a budget
    // referencing a category that is not there yet.
    const withCategory = reducer(start, {
      type: 'category/add',
      category: { id, name: 'Sekolah', icon: 'Tag', colorKey: 'plum', kind: 'expense' },
    });
    const withBudget = reducer(withCategory, {
      type: 'budget/set',
      budget: { categoryId: id, monthlyLimit: 750_000 },
    });

    expect(withBudget.categories.find((c) => c.id === id)!.name).toBe('Sekolah');
    expect(withBudget.budgets.find((b) => b.categoryId === id)!.monthlyLimit).toBe(750_000);
  });

  it('leaves every other category and budget alone', () => {
    const start = createSeedState(TODAY_B);
    const after = reducer(
      reducer(start, {
        type: 'category/add',
        category: { id: 'cat_new', name: 'Baru', icon: 'Tag', colorKey: 'slate', kind: 'expense' },
      }),
      { type: 'budget/set', budget: { categoryId: 'cat_new', monthlyLimit: 100_000 } },
    );

    expect(after.categories).toHaveLength(start.categories.length + 1);
    expect(after.budgets).toHaveLength(start.budgets.length + 1);
    for (const b of start.budgets) {
      expect(after.budgets.find((x) => x.categoryId === b.categoryId)!.monthlyLimit).toBe(
        b.monthlyLimit,
      );
    }
  });

  it('rounds the limit and never stores a negative one', () => {
    const start = createSeedState(TODAY_B);
    const odd = reducer(start, {
      type: 'budget/set',
      budget: { categoryId: 'cat_coffee', monthlyLimit: 250_000.567 },
    });
    expect(odd.budgets.find((b) => b.categoryId === 'cat_coffee')!.monthlyLimit).toBe(250_000.57);

    const negative = reducer(start, {
      type: 'budget/set',
      budget: { categoryId: 'cat_coffee', monthlyLimit: -50 },
    });
    expect(negative.budgets.find((b) => b.categoryId === 'cat_coffee')!.monthlyLimit).toBe(0);
  });

  it('replaces rather than duplicates when the category already has one', () => {
    const start = createSeedState(TODAY_B);
    const again = reducer(start, {
      type: 'budget/set',
      budget: { categoryId: 'cat_coffee', monthlyLimit: 300_000 },
    });
    expect(again.budgets.filter((b) => b.categoryId === 'cat_coffee')).toHaveLength(1);
    expect(again.budgets.find((b) => b.categoryId === 'cat_coffee')!.monthlyLimit).toBe(300_000);
  });
});
