import type { AppState } from '../types';
import { round2 } from './format';

/**
 * Currency, and converting between the three the app supports.
 *
 * Amounts are stored as plain numbers in whichever currency is currently
 * selected. Switching therefore rewrites every stored figure at the live rate
 * rather than just relabelling them, because relabelling would silently turn
 * fifty thousand rupiah into fifty thousand dollars.
 *
 * The rate comes from the network, and there is no offline fallback on
 * purpose: a stale or guessed rate would quietly corrupt every number in the
 * app. If the request fails the switch does not happen and the user is told.
 */

export interface CurrencyOption {
  code: string;
  /** Shown in the picker. */
  label: string;
  /** Decimal places. Rupiah is not counted in fractions. */
  decimals: number;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'IDR', label: 'Rupiah Indonesia', decimals: 0 },
  { code: 'USD', label: 'US Dollar', decimals: 2 },
  { code: 'MYR', label: 'Ringgit Malaysia', decimals: 2 },
];

export const DEFAULT_CURRENCY = 'IDR';

export function currencyOption(code: string): CurrencyOption {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

export function decimalsFor(code: string): number {
  return currencyOption(code).decimals;
}

/* ------------------------------------------------------------ the rate */

export class RateUnavailableError extends Error {
  constructor() {
    super('rate unavailable');
    this.name = 'RateUnavailableError';
  }
}

const ENDPOINT = 'https://open.er-api.com/v6/latest';

/**
 * How many units of `to` one unit of `from` buys.
 *
 * No key, no account, and refreshed daily by the provider. A failure of any
 * kind, including being offline, throws rather than returning a guess.
 */
export async function fetchRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new RateUnavailableError();
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(from)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) throw new RateUnavailableError();
    const body = (await res.json()) as {
      result?: string;
      rates?: Record<string, number>;
    };

    const rate = body.result === 'success' ? body.rates?.[to] : undefined;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new RateUnavailableError();
    }
    return rate;
  } catch {
    throw new RateUnavailableError();
  }
}

/* ------------------------------------------------------- the conversion */

/** Rounds to whatever the target currency actually uses. */
export function convertAmount(amount: number, rate: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(amount * rate * factor) / factor;
}

/**
 * Every stored figure, rewritten at the given rate.
 *
 * Pure, and deliberately exhaustive: a money field left behind here would sit
 * in the old currency forever and quietly poison a total. Transaction ids,
 * dates, categories and everything else are untouched.
 */
export function convertState(state: AppState, rate: number, to: string): AppState {
  const d = decimalsFor(to);
  const c = (n: number) => convertAmount(n, rate, d);

  return {
    ...state,
    currency: to,
    monthlyIncome: c(state.monthlyIncome),
    savingsGoalPerMonth: c(state.savingsGoalPerMonth),
    transactions: state.transactions.map((t) => ({ ...t, amount: c(t.amount) })),
    budgets: state.budgets.map((b) => ({ ...b, monthlyLimit: c(b.monthlyLimit) })),
    accounts: state.accounts.map((a) => ({ ...a, openingBalance: c(a.openingBalance) })),
    transfers: state.transfers.map((t) => ({ ...t, amount: c(t.amount) })),
    goals: state.goals.map((g) => ({ ...g, target: c(g.target), saved: c(g.saved) })),
    netWorthHistory: state.netWorthHistory.map((n) => ({ ...n, value: c(n.value) })),
  };
}

/** A readable rate for the confirmation, e.g. "1 USD = 17.857 IDR". */
export function describeRate(from: string, to: string, rate: number, locale: string): string {
  const shown =
    rate >= 1
      ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(rate)
      : new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 }).format(rate);
  return `1 ${from} = ${shown} ${to}`;
}

/** Guards against a rounding wipeout, e.g. IDR to USD on tiny amounts. */
export function wouldFlattenToZero(state: AppState, rate: number, to: string): boolean {
  const d = decimalsFor(to);
  const nonZero = state.transactions.filter((t) => t.amount > 0);
  if (nonZero.length === 0) return false;
  const lost = nonZero.filter((t) => convertAmount(t.amount, rate, d) === 0).length;
  // More than a third of records rounding away means the conversion is lossy
  // enough to be worth warning about rather than doing silently.
  return lost / nonZero.length > 0.34;
}

export { round2 };
