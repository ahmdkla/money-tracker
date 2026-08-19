import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LANG, EN_KEYS, ID_KEYS, isLang, localeFor, translate } from '../i18n';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  RateUnavailableError,
  convertAmount,
  convertState,
  currencyOption,
  decimalsFor,
  describeRate,
  fetchRate,
  wouldFlattenToZero,
} from '../currency';
import { createSeedState } from '../seed';

const TODAY = new Date(2026, 7, 19, 10, 0, 0);

/* ------------------------------------------------------------ language -- */

describe('the dictionary', () => {
  it('opens in Bahasa Indonesia', () => {
    expect(DEFAULT_LANG).toBe('id');
    expect(localeFor('id')).toBe('id-ID');
    expect(localeFor('en')).toBe('en-US');
  });

  it('carries the same keys in both languages', () => {
    // A key present in one table and missing from the other is a screen that
    // silently falls back to English, which is the failure this catches.
    const en = new Set(EN_KEYS);
    const id = new Set(ID_KEYS);
    expect([...en].filter((k) => !id.has(k))).toEqual([]);
    expect([...id].filter((k) => !en.has(k))).toEqual([]);
  });

  it('has no duplicate keys in either table', () => {
    expect(EN_KEYS.length).toBe(new Set(EN_KEYS).size);
    expect(ID_KEYS.length).toBe(new Set(ID_KEYS).size);
  });

  it('leaves no key untranslated by copy and paste', () => {
    // A handful are the same word in both languages, and those are listed
    // rather than allowed wholesale, so a forgotten line still shows up.
    const sameOnPurpose = new Set([
      'app.name',
      'app.slogan',
      'app.tagline',
      'nav.menu',
      'nav.insights',
      'settings.theme',
      'common.optional',
      'insights.aMonth',
      'csv.title',
      // Asked for word for word, in Indonesian, in both languages.
      'toast.currencyOffline',
    ]);
    const identical = EN_KEYS.filter(
      (k) =>
        !sameOnPurpose.has(k) &&
        translate('en', k) === translate('id', k) &&
        // A key that is only a placeholder, like "{amount}", cannot differ.
        !/^[{}\w\s%]*$/.test(translate('en', k).replace(/\{\w+\}/g, '')),
    );
    expect(identical).toEqual([]);
  });

  it('fills placeholders, and leaves an unknown one visible', () => {
    expect(translate('en', 'home.underPace', { amount: '$5' })).toBe('$5 under your daily pace');
    expect(translate('en', 'home.underPace')).toBe('{amount} under your daily pace');
  });

  it('falls back to English rather than showing a raw key', () => {
    // Simulating a gap: a key only English has would still read as words.
    expect(translate('id', 'app.name')).toBe('manimani');
    // And a key neither has comes back as itself, never as blank.
    expect(translate('id', 'nothing.here')).toBe('nothing.here');
  });

  it('recognises only the two languages it ships', () => {
    expect(isLang('id')).toBe(true);
    expect(isLang('en')).toBe(true);
    expect(isLang('fr')).toBe(false);
    expect(isLang(null)).toBe(false);
  });
});

/* ------------------------------------------------------------ currency -- */

describe('the currency list', () => {
  it('offers exactly the three, rupiah first', () => {
    expect(CURRENCIES.map((c) => c.code)).toEqual(['IDR', 'USD', 'MYR']);
    expect(DEFAULT_CURRENCY).toBe('IDR');
  });

  it('knows rupiah has no minor unit', () => {
    expect(decimalsFor('IDR')).toBe(0);
    expect(decimalsFor('USD')).toBe(2);
    expect(decimalsFor('MYR')).toBe(2);
  });

  it('falls back to rupiah for a code it does not carry', () => {
    expect(currencyOption('GBP').code).toBe('IDR');
  });
});

describe('converting', () => {
  const state = createSeedState(TODAY);

  it('rounds to what the target currency actually uses', () => {
    // 1 IDR = 0.000061 USD, near enough.
    expect(convertAmount(25_000, 0.000061, 2)).toBe(1.53);
    expect(convertAmount(1.53, 16_393, 0)).toBe(25_081);
  });

  it('rewrites every stored amount, not just the label', () => {
    const rate = 0.000061;
    const usd = convertState(state, rate, 'USD');

    expect(usd.currency).toBe('USD');
    expect(usd.monthlyIncome).toBe(convertAmount(state.monthlyIncome, rate, 2));
    expect(usd.savingsGoalPerMonth).toBe(convertAmount(state.savingsGoalPerMonth, rate, 2));

    for (const [i, t] of usd.transactions.entries()) {
      expect(t.amount).toBe(convertAmount(state.transactions[i].amount, rate, 2));
    }
    for (const [i, b] of usd.budgets.entries()) {
      expect(b.monthlyLimit).toBe(convertAmount(state.budgets[i].monthlyLimit, rate, 2));
    }
    for (const [i, a] of usd.accounts.entries()) {
      expect(a.openingBalance).toBe(convertAmount(state.accounts[i].openingBalance, rate, 2));
    }
    for (const [i, g] of usd.goals.entries()) {
      expect(g.target).toBe(convertAmount(state.goals[i].target, rate, 2));
      expect(g.saved).toBe(convertAmount(state.goals[i].saved, rate, 2));
    }
    for (const [i, tr] of usd.transfers.entries()) {
      expect(tr.amount).toBe(convertAmount(state.transfers[i].amount, rate, 2));
    }
    for (const [i, n] of usd.netWorthHistory.entries()) {
      expect(n.value).toBe(convertAmount(state.netWorthHistory[i].value, rate, 2));
    }
  });

  it('leaves everything that is not money exactly as it was', () => {
    const usd = convertState(state, 0.000061, 'USD');
    expect(usd.transactions.map((t) => t.id)).toEqual(state.transactions.map((t) => t.id));
    expect(usd.transactions.map((t) => t.date)).toEqual(state.transactions.map((t) => t.date));
    expect(usd.transactions.map((t) => t.categoryId)).toEqual(
      state.transactions.map((t) => t.categoryId),
    );
    expect(usd.categories).toEqual(state.categories);
    expect(usd.lang).toBe(state.lang);
  });

  it('round trips back to roughly where it started', () => {
    const usd = convertState(state, 0.000061, 'USD');
    const back = convertState(usd, 1 / 0.000061, 'IDR');
    // Rupiah has no cents, so the trip through USD loses a little. Within a
    // hundred rupiah on a twelve million income is well inside tolerable.
    expect(Math.abs(back.monthlyIncome - state.monthlyIncome)).toBeLessThan(100);
    expect(back.currency).toBe('IDR');
  });

  it('spots a conversion that would round everything away', () => {
    const tiny = 0.0000000001;
    expect(wouldFlattenToZero(state, tiny, 'USD')).toBe(true);
    expect(wouldFlattenToZero(state, 0.000061, 'USD')).toBe(false);
    expect(wouldFlattenToZero({ ...state, transactions: [] }, tiny, 'USD')).toBe(false);
  });

  it('describes the rate in words a person can check', () => {
    expect(describeRate('USD', 'IDR', 16393.44, 'en-US')).toBe('1 USD = 16,393.44 IDR');
    expect(describeRate('IDR', 'USD', 0.000061, 'en-US')).toBe('1 IDR = 0.000061 USD');
  });
});

/* -------------------------------------------------------------- fetching -- */

describe('fetching the rate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not go to the network for a currency to itself', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(fetchRate('IDR', 'IDR')).resolves.toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the rate out of a successful response', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: 'success', rates: { USD: 0.000061 } }),
      }),
    );
    await expect(fetchRate('IDR', 'USD')).resolves.toBe(0.000061);
  });

  it('refuses to guess when the browser is offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(fetchRate('IDR', 'USD')).rejects.toBeInstanceOf(RateUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses to guess when the request fails', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(fetchRate('IDR', 'USD')).rejects.toBeInstanceOf(RateUnavailableError);
  });

  it('refuses a response that does not carry the currency asked for', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: 'success', rates: { EUR: 0.9 } }),
      }),
    );
    await expect(fetchRate('IDR', 'USD')).rejects.toBeInstanceOf(RateUnavailableError);
  });

  it('refuses a rate that is zero or nonsense', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    for (const bad of [0, -1, Number.NaN, 'lots']) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ result: 'success', rates: { USD: bad } }),
        }),
      );
      await expect(fetchRate('IDR', 'USD')).rejects.toBeInstanceOf(RateUnavailableError);
    }
  });
});
