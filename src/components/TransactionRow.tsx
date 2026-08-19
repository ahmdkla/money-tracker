import { ArrowsClockwise } from '@phosphor-icons/react';
import type { Category, Transaction } from '../types';
import { relativeTime } from '../lib/date';
import { signedMoney } from '../lib/format';
import { useApp } from '../store/AppContext';
import { CategoryTile } from './primitives';

/**
 * One line of history. Merchant on top, category and when underneath, the
 * amount on the right. Income is green and signed; an expense is plain dark
 * text, because a list of ordinary spending should not read as a list of
 * warnings.
 */
export function TransactionRow({
  tx,
  category,
  currency,
  dark,
  today,
  onSelect,
}: {
  tx: Transaction;
  category: Category | undefined;
  currency: string;
  dark: boolean;
  today: Date;
  onSelect?: (tx: Transaction) => void;
}) {
  const { t, relWords, locale } = useApp();
  const title = tx.note?.trim() || category?.name || t('common.transaction');
  const when = relativeTime(tx.date, today, relWords, locale);
  const amount = signedMoney(tx.amount, tx.type, currency);

  const body = (
    <>
      <CategoryTile category={category} dark={dark} />
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-base font-medium text-ink-900 dark:text-ink-50">
            {title}
          </span>
          {tx.recurring && (
            <ArrowsClockwise
              size={13}
              weight="bold"
              className="shrink-0 text-ink-400 dark:text-ink-500"
              aria-hidden="true"
            />
          )}
        </span>
        <span className="mt-0.5 block truncate text-meta text-ink-500 dark:text-ink-400">
          {category?.name ?? t('common.uncategorised')} · {when}
          {tx.recurring ? ` · ${t('common.recurring')}` : ''}
        </span>
      </span>
      <span
        className={`tnum shrink-0 text-base font-medium ${
          tx.type === 'income' ? 'text-brand-mid dark:text-mint' : 'text-ink-900 dark:text-ink-50'
        }`}
      >
        {amount}
      </span>
    </>
  );

  if (!onSelect) {
    return <div className="flex items-center gap-3 py-2.5">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(tx)}
      className="press flex w-full items-center gap-3 rounded-field py-2.5 text-left"
      aria-label={t('tx.editAria', { name: title, amount, when })}
    >
      {body}
    </button>
  );
}
