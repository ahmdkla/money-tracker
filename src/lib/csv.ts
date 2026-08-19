import type { Category, Transaction } from '../types';
import { matchCategory } from './parse';
import { round2 } from './format';

/**
 * Bank CSV import.
 *
 * Nobody types in a month of transactions by hand, so this is the difference
 * between a demo and something someone keeps using. Every bank exports a
 * different shape, so the approach is: parse anything, guess the columns, show
 * the guess, and let the user correct it before a single row is committed.
 */

/* --------------------------------------------------------------- parsing */

/**
 * A real CSV reader, not a split on commas. Handles quoted fields containing
 * commas and newlines, and doubled quotes as an escape, which is what
 * spreadsheet exports actually produce.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Strip a UTF-8 byte order mark; Excel loves adding one.
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',' || c === ';' || c === '\t') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // handled by the \n branch
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop entirely blank lines, which trailing newlines produce.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/* ------------------------------------------------------------- numbers */

/**
 * Bank amount formats, in one place:
 *   "1,234.56"  "1.234,56"  "-45.00"  "(45.00)"  "$45"  "45.00 CR"
 */
export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  let negative = false;

  // Accountants wrap negatives in brackets.
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/^-/.test(s)) {
    negative = true;
    s = s.slice(1);
  }
  if (/\bDR\b/i.test(s)) negative = true;
  if (/\bCR\b/i.test(s)) negative = false;

  s = s.replace(/[^0-9.,]/g, '');
  if (!s) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > lastDot) {
    // European: 1.234,56
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Anglo: 1,234.56
    s = s.replace(/,/g, '');
  }

  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/* --------------------------------------------------------------- dates */

export type DateOrder = 'auto' | 'dmy' | 'mdy' | 'ymd';

export function parseDate(raw: string, order: DateOrder = 'auto'): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO first: unambiguous, so it never needs the order hint.
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch.map(Number);
    return valid(y, m, d);
  }

  const parts = s.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})/);
  if (parts) {
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    const c = Number(parts[3]);

    if (order === 'ymd' || a > 31) return valid(a, b, c);
    if (order === 'dmy') return valid(c, b, a);
    if (order === 'mdy') return valid(c, a, b);

    // auto: the only reliable tell is a value above twelve.
    if (a > 12) return valid(c, b, a);
    if (b > 12) return valid(c, a, b);
    return valid(c, b, a); // ambiguous, favour day first
  }

  // "12 Aug 2026" and similar.
  const loose = new Date(s);
  return Number.isNaN(loose.getTime()) ? null : loose;
}

function valid(y: number, m: number, d: number): Date | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  return date.getMonth() === m - 1 ? date : null;
}

/** Which way round the ambiguous dates in this file most likely are. */
export function detectDateOrder(values: string[]): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const parts = v.trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-]\d{2,4}/);
    if (!parts) continue;
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    if (a > 12) dmy++;
    else if (b > 12) mdy++;
  }
  if (dmy > mdy) return 'dmy';
  if (mdy > dmy) return 'mdy';
  return 'auto';
}

/* ------------------------------------------------------- column mapping */

export interface ColumnMap {
  date: number;
  description: number;
  /** Single signed column. -1 when the file uses debit and credit instead. */
  amount: number;
  debit: number;
  credit: number;
  /** True when a positive number in `amount` means money going out. */
  positiveIsExpense: boolean;
  dateOrder: DateOrder;
  hasHeader: boolean;
}

const DATE_WORDS = ['date', 'posted', 'transaction date', 'booking', 'time', 'when'];
const DESC_WORDS = ['description', 'details', 'narrative', 'payee', 'merchant', 'memo', 'name', 'reference', 'particulars'];
const AMOUNT_WORDS = ['amount', 'value', 'sum', 'total'];
const DEBIT_WORDS = ['debit', 'withdrawal', 'money out', 'paid out', 'spent', 'outgoing'];
const CREDIT_WORDS = ['credit', 'deposit', 'money in', 'paid in', 'received', 'incoming'];

const findColumn = (headers: string[], words: string[]): number =>
  headers.findIndex((h) => {
    const low = h.trim().toLowerCase();
    return words.some((w) => low === w || low.includes(w));
  });

/** Header row, or numbers in the first row, decide whether row 0 is data. */
function looksLikeHeader(row: string[]): boolean {
  const numeric = row.filter((c) => parseAmount(c) !== null).length;
  return numeric <= Math.max(0, Math.floor(row.length / 3));
}

export function guessColumns(rows: string[][]): ColumnMap {
  const hasHeader = rows.length > 1 && looksLikeHeader(rows[0]);
  const headers = hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`);
  const body = hasHeader ? rows.slice(1) : rows;

  let date = findColumn(headers, DATE_WORDS);
  let description = findColumn(headers, DESC_WORDS);
  let amount = findColumn(headers, AMOUNT_WORDS);
  const debit = findColumn(headers, DEBIT_WORDS);
  const credit = findColumn(headers, CREDIT_WORDS);

  // No usable headers, so fall back to what the data looks like.
  if (date < 0) {
    date = headers.findIndex((_, i) =>
      body.slice(0, 8).every((r) => r[i] !== undefined && parseDate(r[i]) !== null),
    );
  }
  if (amount < 0 && debit < 0 && credit < 0) {
    amount = headers.findIndex((_, i) => {
      if (i === date) return false;
      const cells = body.slice(0, 8).map((r) => r[i]);
      return cells.every((c) => c !== undefined && parseAmount(c) !== null);
    });
  }
  if (description < 0) {
    description = headers.findIndex(
      (_, i) =>
        i !== date &&
        i !== amount &&
        i !== debit &&
        i !== credit &&
        body.slice(0, 8).some((r) => (r[i] ?? '').trim().length > 2),
    );
  }

  const dateSamples = date >= 0 ? body.slice(0, 40).map((r) => r[date] ?? '') : [];

  // Most banks write spending as a negative number. If the column is
  // overwhelmingly negative, that is the convention in play.
  let positiveIsExpense = false;
  if (amount >= 0) {
    const values = body
      .slice(0, 40)
      .map((r) => parseAmount(r[amount] ?? ''))
      .filter((n): n is number => n !== null);
    const negatives = values.filter((n) => n < 0).length;
    positiveIsExpense = values.length > 0 && negatives === 0;
  }

  return {
    date: Math.max(date, 0),
    description: Math.max(description, 0),
    amount,
    debit,
    credit,
    positiveIsExpense,
    dateOrder: detectDateOrder(dateSamples),
    hasHeader,
  };
}

/* ------------------------------------------------------------ building */

export interface DraftRow {
  include: boolean;
  date: Date;
  description: string;
  amount: number;
  type: 'expense' | 'income';
  categoryId: string | null;
  duplicateOf: string | null;
  rowIndex: number;
}

export interface BuildResult {
  drafts: DraftRow[];
  /** Rows that could not be read at all, with the reason. */
  /** `reason` is a dictionary key; `detail` fills its {value} placeholder. */
  rejected: { rowIndex: number; reason: string; detail?: string }[];
}

/** Same day, same amount, same merchant is a duplicate, near enough. */
function duplicateKey(dateMs: number, amount: number, description: string): string {
  const day = new Date(dateMs);
  const ymd = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
  return `${ymd}|${amount.toFixed(2)}|${description.trim().toLowerCase().slice(0, 24)}`;
}

export function buildDrafts(
  rows: string[][],
  map: ColumnMap,
  categories: Category[],
  existing: Transaction[],
): BuildResult {
  const body = map.hasHeader ? rows.slice(1) : rows;
  const drafts: DraftRow[] = [];
  const rejected: BuildResult['rejected'] = [];

  const seen = new Map<string, string>();
  for (const t of existing) {
    seen.set(duplicateKey(new Date(t.date).getTime(), t.amount, t.note ?? ''), t.id);
  }

  body.forEach((row, i) => {
    const rawDate = row[map.date] ?? '';
    const date = parseDate(rawDate, map.dateOrder);
    if (!date) {
      rejected.push({
        rowIndex: i,
        reason: 'csv.rejectDate',
        detail: rawDate.slice(0, 20),
      });
      return;
    }

    let signed: number | null = null;
    if (map.amount >= 0) {
      const n = parseAmount(row[map.amount] ?? '');
      if (n !== null) signed = map.positiveIsExpense ? -Math.abs(n) : n;
    } else {
      const debit = map.debit >= 0 ? parseAmount(row[map.debit] ?? '') : null;
      const credit = map.credit >= 0 ? parseAmount(row[map.credit] ?? '') : null;
      if (debit) signed = -Math.abs(debit);
      else if (credit) signed = Math.abs(credit);
    }

    if (signed === null || signed === 0) {
      rejected.push({ rowIndex: i, reason: 'csv.rejectAmount' });
      return;
    }

    const description = (row[map.description] ?? '').trim().replace(/\s+/g, ' ');
    const type = signed < 0 ? 'expense' : 'income';
    const amount = round2(Math.abs(signed));

    // The direction is already known from the sign, so only the category
    // needs guessing: "STARBUCKS STORE 4471" should land in Coffee.
    const categoryId = matchCategory(description, categories, type).categoryId;

    const key = duplicateKey(date.getTime(), amount, description);
    const duplicateOf = seen.get(key) ?? null;
    if (!duplicateOf) seen.set(key, 'pending');

    drafts.push({
      include: !duplicateOf,
      date,
      description,
      amount,
      type,
      categoryId,
      duplicateOf,
      rowIndex: i,
    });
  });

  return { drafts, rejected };
}

export function draftsToTransactions(drafts: DraftRow[]): Transaction[] {
  return drafts
    .filter((d) => d.include && d.categoryId)
    .map((d, i) => ({
      id: `tx_csv_${Date.now().toString(36)}_${i.toString(36)}`,
      amount: d.amount,
      type: d.type,
      categoryId: d.categoryId!,
      note: d.description || undefined,
      date: d.date.toISOString(),
    }));
}
