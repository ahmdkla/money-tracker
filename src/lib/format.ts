/**
 * Every number the user sees passes through here. Rounding happens before
 * display, never after, so no floating point artifacts reach the screen.
 */

/**
 * The locale every figure is formatted in.
 *
 * Module level rather than threaded through a hundred call sites: it is a
 * display concern, it changes only when the user switches language, and the
 * app is single threaded, so a module variable is honest here in a way it
 * would not be for anything stateful.
 */
let LOCALE = 'id-ID';

export function setFormatLocale(locale: string): void {
  LOCALE = locale;
}

export function formatLocale(): string {
  return LOCALE;
}

/**
 * Decimal places a currency actually uses. Rupiah is not counted in fractions,
 * so showing Rp 25.000,00 would be wrong rather than merely fussy.
 */
export function currencyDecimals(currency: string): number {
  return currency === 'IDR' || currency === 'JPY' ? 0 : 2;
}

/** Round to cents. Guards against 0.1 + 0.2 style drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function money(amount: number, currency: string, opts?: { cents?: boolean }): string {
  // A currency with no minor unit ignores the request for cents entirely.
  const places = currencyDecimals(currency);
  const cents = (opts?.cents ?? true) && places > 0;
  const value = cents ? round2(amount) : Math.round(amount);
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: cents ? places : 0,
    maximumFractionDigits: cents ? places : 0,
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
 * Short-scale words, per language. Rupiah runs in millions for anything
 * ordinary, so "Rp 2.800rb" would be a worse reading than "Rp 2,8 jt".
 */
const COMPACT_WORDS = {
  id: { thousand: 'rb', million: 'jt', sep: ' ' },
  en: { thousand: 'k', million: 'M', sep: '' },
} as const;

/**
 * Short form for chart axes and tight readouts, where a full "Rp 2.800.000"
 * does not fit the gutter a 390px screen can spare. Rounds to one decimal and
 * drops a trailing .0.
 */
export function moneyCompact(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  if (abs < 1000) return moneyWhole(amount, currency);

  const words = LOCALE.startsWith('id') ? COMPACT_WORDS.id : COMPACT_WORDS.en;
  const millions = abs >= 1_000_000;
  const scaled = amount / (millions ? 1_000_000 : 1000);
  const digits = Math.abs(scaled) < 10 ? 1 : 0;
  const body = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(scaled);
  return `${body}${words.sep}${millions ? words.million : words.thousand}`;
}

/**
 * The same short scale as moneyCompact, without the currency symbol.
 *
 * A chart axis has room for "6 jt" and not for "Rp 6 jt", and the symbol is
 * already established by every other number on the screen.
 */
export function numberCompact(amount: number): string {
  const abs = Math.abs(amount);
  const words = LOCALE.startsWith('id') ? COMPACT_WORDS.id : COMPACT_WORDS.en;

  if (abs < 1000) {
    return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(amount);
  }

  const millions = abs >= 1_000_000;
  const scaled = amount / (millions ? 1_000_000 : 1000);
  const digits = Math.abs(scaled) < 10 ? 1 : 0;
  const body = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(scaled);
  return `${body}${words.sep}${millions ? words.million : words.thousand}`;
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

/**
 * The group and decimal characters the current locale actually uses.
 *
 * Indonesian writes 43.000 where English writes 43,000, and a field that
 * groups the wrong way looks broken to whoever is reading it.
 */
export function separators(): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(LOCALE).formatToParts(12345.6);
  return {
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
  };
}

export function currencySymbol(currency: string): string {
  const parts = new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? '$';
}
