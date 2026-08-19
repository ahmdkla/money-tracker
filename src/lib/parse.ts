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
 * Merchant and slang, mapped to a canonical category id.
 *
 * Ids rather than names, because the seeded categories are Indonesian and a
 * user may rename them to anything at all. The lookup resolves an id first and
 * falls back to matching the label, so both a stock install and a renamed one
 * get a hit, in either language.
 */
const SYNONYMS: Record<string, string> = {
  /* --- coffee ------------------------------------------------------- */
  kopi: 'cat_coffee', kenangan: 'cat_coffee', tuku: 'cat_coffee',
  janji: 'cat_coffee', jiwa: 'cat_coffee', fore: 'cat_coffee',
  ngopi: 'cat_coffee', kapal: 'cat_coffee',
  coffee: 'cat_coffee', latte: 'cat_coffee', espresso: 'cat_coffee',
  cappuccino: 'cat_coffee', starbucks: 'cat_coffee', cafe: 'cat_coffee',
  brew: 'cat_coffee',

  /* --- groceries ---------------------------------------------------- */
  belanja: 'cat_groceries', indomaret: 'cat_groceries', alfamart: 'cat_groceries',
  superindo: 'cat_groceries', hypermart: 'cat_groceries', transmart: 'cat_groceries',
  warung: 'cat_groceries', pasar: 'cat_groceries', sayur: 'cat_groceries',
  sembako: 'cat_groceries',
  groceries: 'cat_groceries', grocery: 'cat_groceries', supermarket: 'cat_groceries',
  market: 'cat_groceries', aldi: 'cat_groceries', tesco: 'cat_groceries',
  kroger: 'cat_groceries', safeway: 'cat_groceries', wholefoods: 'cat_groceries',
  trader: 'cat_groceries',

  /* --- dining ------------------------------------------------------- */
  makan: 'cat_dining', gofood: 'cat_dining', grabfood: 'cat_dining',
  shopeefood: 'cat_dining', bakso: 'cat_dining', soto: 'cat_dining',
  nasi: 'cat_dining', ayam: 'cat_dining', padang: 'cat_dining',
  sate: 'cat_dining', mie: 'cat_dining', jajan: 'cat_dining',
  cemilan: 'cat_dining', kantin: 'cat_dining', restoran: 'cat_dining',
  dining: 'cat_dining', lunch: 'cat_dining', dinner: 'cat_dining',
  brunch: 'cat_dining', breakfast: 'cat_dining', restaurant: 'cat_dining',
  takeout: 'cat_dining', pizza: 'cat_dining', sushi: 'cat_dining',
  burger: 'cat_dining', ramen: 'cat_dining', doordash: 'cat_dining',
  ubereats: 'cat_dining', deliveroo: 'cat_dining', snack: 'cat_dining',
  drinks: 'cat_dining',

  /* --- transport ---------------------------------------------------- */
  gojek: 'cat_transport', grab: 'cat_transport', maxim: 'cat_transport',
  bensin: 'cat_transport', pertamina: 'cat_transport', transjakarta: 'cat_transport',
  busway: 'cat_transport', krl: 'cat_transport', kereta: 'cat_transport',
  ojek: 'cat_transport', taksi: 'cat_transport', parkir: 'cat_transport',
  pesawat: 'cat_transport', angkot: 'cat_transport',
  transport: 'cat_transport', uber: 'cat_transport', lyft: 'cat_transport',
  taxi: 'cat_transport', cab: 'cat_transport', gas: 'cat_transport',
  petrol: 'cat_transport', fuel: 'cat_transport', parking: 'cat_transport',
  train: 'cat_transport', bus: 'cat_transport', metro: 'cat_transport',
  flight: 'cat_transport',

  /* --- subscriptions ------------------------------------------------ */
  langganan: 'cat_subs', membership: 'cat_subs', vidio: 'cat_subs',
  subscription: 'cat_subs', netflix: 'cat_subs', spotify: 'cat_subs',
  hulu: 'cat_subs', icloud: 'cat_subs', dropbox: 'cat_subs',
  gym: 'cat_subs', prime: 'cat_subs', disney: 'cat_subs', youtube: 'cat_subs',

  /* --- rent --------------------------------------------------------- */
  sewa: 'cat_rent', kos: 'cat_rent', kontrakan: 'cat_rent', kontrak: 'cat_rent',
  cicilan: 'cat_rent',
  rent: 'cat_rent', mortgage: 'cat_rent', landlord: 'cat_rent', lease: 'cat_rent',

  /* --- home --------------------------------------------------------- */
  rumah: 'cat_home', listrik: 'cat_home', token: 'cat_home', pdam: 'cat_home',
  pln: 'cat_home', indihome: 'cat_home', pulsa: 'cat_home',
  home: 'cat_home', utilities: 'cat_home', electric: 'cat_home',
  electricity: 'cat_home', water: 'cat_home', internet: 'cat_home',
  wifi: 'cat_home', phone: 'cat_home', heating: 'cat_home',

  /* --- health ------------------------------------------------------- */
  kesehatan: 'cat_health', apotek: 'cat_health', apotik: 'cat_health',
  dokter: 'cat_health', klinik: 'cat_health', obat: 'cat_health',
  fisioterapi: 'cat_health', gigi: 'cat_health', vitamin: 'cat_health',
  health: 'cat_health', pharmacy: 'cat_health', doctor: 'cat_health',
  dentist: 'cat_health', medicine: 'cat_health', clinic: 'cat_health',

  /* --- income ------------------------------------------------------- */
  gaji: 'cat_payroll', gajian: 'cat_payroll', thr: 'cat_payroll',
  honor: 'cat_payroll', transferan: 'cat_payroll', komisi: 'cat_payroll',
  payroll: 'cat_payroll', paycheck: 'cat_payroll', salary: 'cat_payroll',
  wage: 'cat_payroll', wages: 'cat_payroll', payday: 'cat_payroll',
  invoice: 'cat_payroll', freelance: 'cat_payroll', refund: 'cat_payroll',
  bonus: 'cat_payroll', deposit: 'cat_payroll',
};

/**
 * Labels a canonical id is known by, so a renamed category still matches. The
 * seeded Indonesian name comes first, then the English equivalent.
 */
const CANONICAL_LABELS: Record<string, string[]> = {
  cat_coffee: ['Kopi', 'Coffee'],
  cat_groceries: ['Belanja', 'Groceries'],
  cat_dining: ['Makan di luar', 'Dining'],
  cat_rent: ['Sewa', 'Rent'],
  cat_transport: ['Transportasi', 'Transport'],
  cat_subs: ['Langganan', 'Subscriptions'],
  cat_home: ['Rumah', 'Home'],
  cat_health: ['Kesehatan', 'Health'],
  cat_payroll: ['Gaji', 'Payroll'],
};

const INCOME_HINTS = new Set([
  'payroll', 'paycheck', 'salary', 'wage', 'wages', 'payday', 'invoice',
  'freelance', 'refund', 'bonus', 'deposit', 'income', 'earned', 'received',
  // Indonesian
  'gaji', 'gajian', 'thr', 'honor', 'pemasukan', 'masuk', 'transferan',
  'penghasilan', 'komisi', 'untung', 'dividen', 'refund',
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
  /**
   * A canonical id resolves to the category with that id, or failing that to
   * one named as that concept in either language.
   */
  const byCanonical = (canonical: string) => {
    const direct = pool.find((c) => c.id === canonical);
    if (direct) return direct;
    const labels = (CANONICAL_LABELS[canonical] ?? []).map((l) => l.toLowerCase());
    return pool.find((c) => labels.includes(c.name.toLowerCase()));
  };

  const found = (hit: Category | undefined, on: string): CategoryMatch | null =>
    hit ? { categoryId: hit.id, matchedOn: on, matchedName: hit.name } : null;

  // 1. A known merchant or slang word, exactly.
  for (const w of words) {
    const target = SYNONYMS[w];
    if (!target) continue;
    const hit = found(byCanonical(target), w);
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
    const hit = found(byCanonical(best.target), best.key);
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
