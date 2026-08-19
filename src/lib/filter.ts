import type { Category, Transaction, TxType } from '../types';
import { startOfDay } from './date';

/**
 * Transaction search and filtering.
 *
 * Pure, so the same predicate serves the transactions screen, the command
 * palette and any future export. Nothing here knows about React.
 */

export type AmountDirection = 'all' | TxType;

export interface TxFilter {
  /** Free text across note and category name. */
  text: string;
  /** Empty means every category. */
  categoryIds: string[];
  type: AmountDirection;
  /** Inclusive, as YYYY-MM-DD. */
  from: string;
  to: string;
  min: string;
  max: string;
  recurringOnly: boolean;
}

export const EMPTY_FILTER: TxFilter = {
  text: '',
  categoryIds: [],
  type: 'all',
  from: '',
  to: '',
  min: '',
  max: '',
  recurringOnly: false,
};

export function isFilterActive(f: TxFilter): boolean {
  return (
    f.text.trim() !== '' ||
    f.categoryIds.length > 0 ||
    f.type !== 'all' ||
    f.from !== '' ||
    f.to !== '' ||
    f.min !== '' ||
    f.max !== '' ||
    f.recurringOnly
  );
}

/** How many parts of the filter are doing something, for the UI badge. */
export function activeFilterCount(f: TxFilter): number {
  let n = 0;
  if (f.text.trim()) n++;
  if (f.categoryIds.length) n++;
  if (f.type !== 'all') n++;
  if (f.from || f.to) n++;
  if (f.min || f.max) n++;
  if (f.recurringOnly) n++;
  return n;
}

function parseBound(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Local midnight for a YYYY-MM-DD string, or null if unset or unparseable. */
function parseDayBound(value: string, endOfDay = false): number | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, 999);
  return date.getTime();
}

export function filterTransactions(
  transactions: Transaction[],
  categories: Category[],
  f: TxFilter,
): Transaction[] {
  const names = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
  const needle = f.text.trim().toLowerCase();
  const from = parseDayBound(f.from);
  const to = parseDayBound(f.to, true);
  const min = parseBound(f.min);
  const max = parseBound(f.max);
  const categorySet = f.categoryIds.length ? new Set(f.categoryIds) : null;

  return transactions.filter((t) => {
    if (f.type !== 'all' && t.type !== f.type) return false;
    if (f.recurringOnly && !t.recurring) return false;
    if (categorySet && !categorySet.has(t.categoryId)) return false;

    if (min !== null && t.amount < min) return false;
    if (max !== null && t.amount > max) return false;

    if (from !== null || to !== null) {
      const when = new Date(t.date).getTime();
      if (from !== null && when < from) return false;
      if (to !== null && when > to) return false;
    }

    if (needle) {
      const note = (t.note ?? '').toLowerCase();
      const category = names.get(t.categoryId) ?? '';
      // Amount is searchable too: typing "4.75" should find the coffee.
      const amount = String(t.amount);
      if (!note.includes(needle) && !category.includes(needle) && !amount.includes(needle)) {
        return false;
      }
    }

    return true;
  });
}

/* ------------------------------------------------------------- presets */

export interface DatePreset {
  id: string;
  /** Dictionary key, resolved by the screen that renders the chip. */
  key: string;
  range: (today: Date) => { from: string; to: string };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const DATE_PRESETS: DatePreset[] = [
  {
    id: 'this-month',
    key: 'transactions.thisMonth',
    range: (today) => ({
      from: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: iso(today),
    }),
  },
  {
    id: 'last-month',
    key: 'transactions.lastMonth',
    range: (today) => ({
      from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: iso(new Date(today.getFullYear(), today.getMonth(), 0)),
    }),
  },
  {
    id: 'last-30',
    key: 'transactions.last30',
    range: (today) => {
      const start = startOfDay(today);
      start.setDate(start.getDate() - 29);
      return { from: iso(start), to: iso(today) };
    },
  },
  {
    id: 'this-year',
    key: 'transactions.thisYear',
    range: (today) => ({
      from: iso(new Date(today.getFullYear(), 0, 1)),
      to: iso(today),
    }),
  },
];

/** Totals for whatever survived the filter, shown above the list. */
export function summarise(transactions: Transaction[]): {
  count: number;
  spent: number;
  received: number;
  net: number;
} {
  let spent = 0;
  let received = 0;
  for (const t of transactions) {
    if (t.type === 'expense') spent += t.amount;
    else received += t.amount;
  }
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  return {
    count: transactions.length,
    spent: round(spent),
    received: round(received),
    net: round(received - spent),
  };
}
