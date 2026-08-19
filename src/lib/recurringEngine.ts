import type { AppState, Transaction } from '../types';
import { addMonths, monthKey } from './date';
import { round2 } from './format';

/**
 * Making a fixed bill actually recur.
 *
 * Until now `recurring` was only a label. Rent was marked as a bill, the
 * forecast treated it as one, and then next month it simply was not there and
 * you had to type it in again. That is the gap this closes.
 *
 * The rules are deliberately dull, because a process that silently invents
 * money movements has to be predictable:
 *
 *   - A series is one merchant in one category. "Netflix" in Subscriptions.
 *   - The next occurrence is one calendar month after the most recent one.
 *   - Nothing is created for a month that already has an instance, so running
 *     this twice is harmless and running it after a manual entry does not
 *     double up.
 *   - Nothing is created for a series the user has stopped.
 *   - It only ever looks a short way ahead, so the forecast has what it needs
 *     without the ledger filling up with imaginary future.
 */

/** How far ahead to create bills. Two months covers the 7-day forecast. */
const HORIZON_MONTHS = 2;

/** Belt and braces against a runaway loop on odd data. */
const MAX_CREATED = 36;

/** One merchant in one category. Stable across renames of other things. */
export function seriesKey(tx: Pick<Transaction, 'categoryId' | 'note'>): string {
  return `${tx.categoryId}::${(tx.note ?? '').trim().toLowerCase()}`;
}

export interface Expansion {
  created: Transaction[];
  /** Series that were skipped because the user stopped them. */
  skippedSeries: string[];
}

export function expandRecurring(state: AppState, today: Date = new Date()): Expansion {
  const ended = new Set(state.endedSeries ?? []);
  const horizon = addMonths(today, HORIZON_MONTHS);

  // Group every existing bill by series, and remember which months are taken.
  const series = new Map<string, { latest: Transaction; months: Set<string> }>();

  for (const tx of state.transactions) {
    if (!tx.recurring || tx.type !== 'expense') continue;
    const key = seriesKey(tx);
    const entry = series.get(key);
    const when = new Date(tx.date);

    if (!entry) {
      series.set(key, { latest: tx, months: new Set([monthKey(when)]) });
    } else {
      entry.months.add(monthKey(when));
      if (when > new Date(entry.latest.date)) entry.latest = tx;
    }
  }

  const created: Transaction[] = [];
  const skippedSeries: string[] = [];

  for (const [key, entry] of series) {
    if (ended.has(key)) {
      skippedSeries.push(key);
      continue;
    }

    const template = entry.latest;
    let next = addMonths(new Date(template.date), 1);
    let guard = 0;

    while (next <= horizon && guard < MAX_CREATED && created.length < MAX_CREATED) {
      guard++;
      const key2 = monthKey(next);

      // A month that already has this bill is left alone, whether it got there
      // automatically or because somebody typed it in.
      if (!entry.months.has(key2)) {
        entry.months.add(key2);
        created.push({
          id: `tx_${next.getTime().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          amount: round2(template.amount),
          type: 'expense',
          categoryId: template.categoryId,
          note: template.note,
          date: next.toISOString(),
          recurring: true,
        });
      }

      next = addMonths(next, 1);
    }
  }

  return { created, skippedSeries };
}

/** Every future instance of a series, for when the user stops a bill. */
export function futureInstancesOf(
  state: AppState,
  key: string,
  today: Date = new Date(),
): Transaction[] {
  const now = today.getTime();
  return state.transactions.filter(
    (t) => t.recurring && seriesKey(t) === key && new Date(t.date).getTime() > now,
  );
}

/** Human label for a series, for confirmation copy. */
export function seriesLabel(tx: Transaction, categoryName: string | undefined): string {
  return tx.note?.trim() || categoryName || 'This bill';
}
