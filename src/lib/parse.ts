import type { Category, TxType } from '../types';

/**
 * Natural language quick add.
 *
 * Handles both orders the spec requires, plus the shapes people actually type:
 *   "coffee 4.50"        -> 4.50, Coffee
 *   "4.50 coffee"        -> 4.50, Coffee
 *   "$12.30 lunch"       -> 12.30, Dining
 *   "starbucks 6"        -> 6.00, Coffee,  note "Starbucks"
 *   "paycheck 1840"      -> 1840,  Payroll, income
 *
 * The parse is always shown back to the user before it is committed, so a
 * wrong guess costs a tap, never a wrong record.
 */

export interface ParseResult {
  amount: number | null;
  categoryId: string | null;
  type: TxType;
  /** Merchant text, title cased. Becomes the transaction note. */
  note: string;
  /** The word that matched a category, for the live preview. */
  matchedOn: string | null;
}

/**
 * Merchant and slang to category-name mapping. Keys are matched against the
 * typed words; values are matched against the user's own category names, so
 * this keeps working after categories are renamed or added.
 */
const SYNONYMS: Record<string, string> = {
  // Coffee
  coffee: 'Coffee', latte: 'Coffee', espresso: 'Coffee', cappuccino: 'Coffee',
  starbucks: 'Coffee', cafe: 'Coffee', brew: 'Coffee', flatwhite: 'Coffee',
  // Groceries
  groceries: 'Groceries', grocery: 'Groceries', supermarket: 'Groceries',
  market: 'Groceries', aldi: 'Groceries', tesco: 'Groceries', kroger: 'Groceries',
  safeway: 'Groceries', wholefoods: 'Groceries', trader: 'Groceries',
  // Dining
  dining: 'Dining', lunch: 'Dining', dinner: 'Dining', brunch: 'Dining',
  breakfast: 'Dining', restaurant: 'Dining', takeout: 'Dining', pizza: 'Dining',
  sushi: 'Dining', burger: 'Dining', doordash: 'Dining', ubereats: 'Dining',
  deliveroo: 'Dining', snack: 'Dining', bar: 'Dining', drinks: 'Dining',
  // Transport
  transport: 'Transport', uber: 'Transport', lyft: 'Transport', taxi: 'Transport',
  cab: 'Transport', gas: 'Transport', petrol: 'Transport', fuel: 'Transport',
  parking: 'Transport', train: 'Transport', bus: 'Transport', metro: 'Transport',
  subway: 'Transport', flight: 'Transport',
  // Subscriptions
  subscription: 'Subscriptions', netflix: 'Subscriptions', spotify: 'Subscriptions',
  hulu: 'Subscriptions', icloud: 'Subscriptions', dropbox: 'Subscriptions',
  gym: 'Subscriptions', membership: 'Subscriptions', prime: 'Subscriptions',
  // Rent
  rent: 'Rent', mortgage: 'Rent', landlord: 'Rent', lease: 'Rent',
  // Home
  home: 'Home', utilities: 'Home', electric: 'Home', electricity: 'Home',
  water: 'Home', internet: 'Home', wifi: 'Home', phone: 'Home', heating: 'Home',
  // Health
  health: 'Health', pharmacy: 'Health', doctor: 'Health', dentist: 'Health',
  medicine: 'Health', clinic: 'Health',
  // Income
  payroll: 'Payroll', paycheck: 'Payroll', salary: 'Payroll', wage: 'Payroll',
  wages: 'Payroll', payday: 'Payroll', invoice: 'Payroll', freelance: 'Payroll',
  refund: 'Payroll', bonus: 'Payroll', deposit: 'Payroll',
};

const INCOME_HINTS = new Set([
  'payroll', 'paycheck', 'salary', 'wage', 'wages', 'payday', 'invoice',
  'freelance', 'refund', 'bonus', 'deposit', 'income', 'earned', 'received',
]);

/** Strips currency symbols and thousands separators, keeps the decimal point. */
function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Words, lowercased and stripped of punctuation and digits. */
function normalise(text: string): string[] {
  return text
    .split(/[\s/\-_.,*]+/)
    .map((w) => w.toLowerCase().replace(/[^a-z]/g, ''))
    .filter(Boolean);
}

export interface CategoryMatch {
  categoryId: string | null;
  matchedOn: string | null;
  matchedName: string | null;
}

/**
 * Find the category a description belongs to.
 *
 * Split out from parseQuickAdd because CSV import already knows the amount,
 * and running the amount extractor over a bank description does real damage:
 * "TESCO-STORES-3299" is a single token, so the digits get eaten as the
 * amount and the merchant disappears with them.
 */
export function matchCategory(
  text: string,
  categories: Category[],
  type: TxType,
): CategoryMatch {
  const words = normalise(text);
  const pool = categories.filter((c) => c.kind === type);
  const byName = (target: string) =>
    pool.find((c) => c.name.toLowerCase() === target.toLowerCase());

  const found = (hit: Category | undefined, on: string): CategoryMatch | null =>
    hit ? { categoryId: hit.id, matchedOn: on, matchedName: hit.name } : null;

  // 1. A known merchant or slang word, exactly.
  for (const w of words) {
    const target = SYNONYMS[w];
    if (!target) continue;
    const hit = found(byName(target), w);
    if (hit) return hit;
  }

  // 2. A category the user actually has, by name.
  for (const w of words) {
    const hit = found(
      pool.find((c) => c.name.toLowerCase() === w),
      w,
    );
    if (hit) return hit;
  }

  // 3. A known merchant hiding inside a longer word. Bank exports mangle
  //    names: "NETFLIXCOM", "UBERTRIP", "TESCOSTORES". Only keys of five
  //    characters or more, because short ones ("gas", "bar") turn up inside
  //    unrelated words, and a confident wrong guess is worse than none.
  let best: { key: string; target: string } | null = null;
  for (const w of words) {
    if (w.length < 5) continue;
    for (const key of Object.keys(SYNONYMS)) {
      if (key.length < 5 || !w.includes(key)) continue;
      if (!best || key.length > best.key.length) best = { key, target: SYNONYMS[key] };
    }
  }
  if (best) {
    const hit = found(byName(best.target), best.key);
    if (hit) return hit;
  }

  // 4. A prefix of a category name, so "sub" finds "Subscriptions".
  for (const w of words) {
    if (w.length < 3) continue;
    const hit = found(
      pool.find(
        (c) => c.name.toLowerCase().startsWith(w) || w.startsWith(c.name.toLowerCase()),
      ),
      w,
    );
    if (hit) return hit;
  }

  return { categoryId: null, matchedOn: null, matchedName: null };
}

/** Does anything in this text suggest money coming in rather than going out? */
export function looksLikeIncome(text: string): boolean {
  return normalise(text).some((w) => INCOME_HINTS.has(w));
}

export function parseQuickAdd(input: string, categories: Category[]): ParseResult {
  const empty: ParseResult = {
    amount: null,
    categoryId: null,
    type: 'expense',
    note: '',
    matchedOn: null,
  };

  const text = input.trim();
  if (!text) return empty;

  // A number token: optional currency symbol, digits, optional decimals.
  // "4.50", "$12", "1,240.00" all qualify, in either order, so "coffee 4.50"
  // and "4.50 coffee" parse identically.
  const tokens = text.split(/\s+/);
  let amount: number | null = null;
  let amountIndex = -1;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!/[0-9]/.test(t)) continue;
    // Reject things that are clearly not amounts, such as a date.
    if (/^[0-9]{1,2}[/-][0-9]{1,2}/.test(t)) continue;
    const n = toNumber(t);
    if (n !== null) {
      amount = n;
      amountIndex = i;
      break;
    }
  }

  const words = tokens.filter((_, i) => i !== amountIndex);
  const phrase = words.join(' ');
  const type: TxType = looksLikeIncome(phrase) ? 'income' : 'expense';
  const match = matchCategory(phrase, categories, type);

  // "coffee 4.50" should not leave a note reading "Coffee": the category
  // already says that. "starbucks 6" should, because that is the merchant.
  const rawNote = titleCase(phrase);
  const note =
    match.matchedName && rawNote.toLowerCase() === match.matchedName.toLowerCase()
      ? ''
      : rawNote;

  return {
    amount,
    categoryId: match.categoryId,
    type,
    note,
    matchedOn: match.matchedOn,
  };
}
