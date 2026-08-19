/**
 * Every number the user sees passes through here. Rounding happens before
 * display, never after, so no floating point artifacts reach the screen.
 */

const LOCALE = 'en-US';

/** Round to cents. Guards against 0.1 + 0.2 style drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function money(amount: number, currency: string, opts?: { cents?: boolean }): string {
  const cents = opts?.cents ?? true;
  const value = cents ? round2(amount) : Math.round(amount);
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
}

/** Whole-currency, no cents. Used for the hero number and headline copy. */
export function moneyWhole(amount: number, currency: string): string {
  return money(amount, currency, { cents: false });
}

/** Signed amount for a transaction row. Income reads "+", expense "-". */
export function signedMoney(amount: number, type: 'expense' | 'income', currency: string): string {
  const body = money(Math.abs(amount), currency);
  return type === 'income' ? `+${body}` : `-${body}`;
}

/**
 * Short form for chart axes, where a full "$1,400" does not fit the gutter a
 * 390px screen can spare. Rounds to one decimal and drops a trailing .0.
 */
export function moneyCompact(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  if (abs < 1000) return moneyWhole(amount, currency);
  const thousands = amount / 1000;
  const digits = Math.abs(thousands) < 10 ? 1 : 0;
  const body = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(thousands);
  return `${body}k`;
}

export function percent(fraction: number): string {
  return `${Math.round(clamp(fraction, 0, 1) * 100)}%`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const CURRENCIES = [
  { code: 'USD', label: 'US dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British pound' },
  { code: 'CAD', label: 'Canadian dollar' },
  { code: 'AUD', label: 'Australian dollar' },
  { code: 'JPY', label: 'Japanese yen' },
  { code: 'ILS', label: 'Israeli shekel' },
  { code: 'INR', label: 'Indian rupee' },
] as const;

export function currencySymbol(currency: string): string {
  const parts = new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? '$';
}
