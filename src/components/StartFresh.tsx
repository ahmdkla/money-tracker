import { useEffect, useState } from 'react';
import {
  ArrowCounterClockwise,
  Broom,
  DownloadSimple,
  Flask,
  Trash,
  Warning,
} from '@phosphor-icons/react';
import { useApp } from '../store/AppContext';
import { exportState } from '../lib/storage';
import { money } from '../lib/format';
import { Sheet } from './primitives';

/**
 * Clearing out the sample month.
 *
 * The app opens on demo data so the first screen has something to say, but
 * that only works if getting rid of it is obvious and safe. Two things make it
 * safe: the sheet counts exactly what is about to go, and the destructive
 * button stays disabled until the warning has actually been acknowledged
 * rather than tapped past.
 *
 * Export sits in the same sheet, because the moment somebody hesitates over a
 * delete is exactly when a copy is worth offering.
 */
export function StartFreshSheet({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { state, dispatch, t } = useApp();
  const [understood, setUnderstood] = useState(false);
  const [exported, setExported] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUnderstood(false);
    setExported(false);
  }, [open]);

  const counts = [
    [state.transactions.length, 'fresh.countTransactions'],
    [state.accounts.length, 'fresh.countAccounts'],
    [state.budgets.length, 'fresh.countBudgets'],
    [state.goals.length, 'fresh.countGoals'],
    [state.transfers.length, 'fresh.countTransfers'],
  ] as const;

  const spent = state.transactions
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('fresh.title')}
      footer={
        <div className="flex gap-2.5">
          <button type="button" onClick={onClose} className="btn-quiet flex-1">
            {t('fresh.keep')}
          </button>
          <button
            type="button"
            disabled={!understood}
            onClick={() => {
              dispatch({ type: 'data/reset-empty' });
              onDone(t('fresh.doneToast'));
              onClose();
            }}
            className="press flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-field bg-coral-text px-4 text-base font-medium text-white disabled:opacity-40 dark:bg-[#8A3418]"
          >
            <Trash size={18} aria-hidden="true" />
            {t('fresh.deleteAll')}
          </button>
        </div>
      }
    >
      <div className="pb-4 pt-1">
        {/* The warning, in the words the app owes the user. */}
        <div className="flex items-start gap-2.5 rounded-card bg-coral-soft px-3.5 py-3 dark:bg-[#33221B]">
          <Warning
            size={18}
            weight="fill"
            className="mt-0.5 shrink-0 text-coral-text dark:text-coral"
            aria-hidden="true"
          />
          <p className="text-meta leading-snug text-coral-text dark:text-[#F0B49B]">
            {t('fresh.warning')}
          </p>
        </div>

        <p className="mt-3.5 text-meta leading-snug text-ink-600 dark:text-ink-300">
          {t('fresh.body')}
        </p>

        {/* Exactly what is about to go, counted rather than described. */}
        <ul className="mt-3 grid gap-1.5 rounded-card px-3.5 py-3" style={{ border: '1px solid var(--hairline)' }}>
          {counts.map(([n, key]) => (
            <li key={key} className="flex items-baseline justify-between gap-3 text-meta">
              <span className="text-ink-600 dark:text-ink-300">{t(key)}</span>
              <span className="tnum font-medium text-ink-900 dark:text-ink-50">{n}</span>
            </li>
          ))}
          {spent > 0 && (
            <li className="hairline-t flex items-baseline justify-between gap-3 pt-1.5 text-meta">
              <span className="text-ink-600 dark:text-ink-300">
                {t('fresh.spendingRecorded')}
              </span>
              <span className="tnum font-medium text-ink-900 dark:text-ink-50">
                {money(spent, state.currency)}
              </span>
            </li>
          )}
        </ul>

        <button
          type="button"
          onClick={() => {
            exportState(state);
            setExported(true);
          }}
          className="btn-quiet mt-3 w-full justify-start"
        >
          <DownloadSimple size={18} aria-hidden="true" />
          {t(exported ? 'fresh.downloaded' : 'fresh.downloadFirst')}
        </button>

        {/* The gate. A destructive button that is live on arrival gets tapped
            by accident; this one has to be reached for. */}
        <label
          className="mt-3 flex cursor-pointer items-start gap-3 rounded-field px-3 py-2.5"
          style={{ border: '1px solid var(--hairline)' }}
        >
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand-mid"
          />
          <span className="text-meta leading-snug text-ink-800 dark:text-ink-100">
            {t('fresh.understand')}
          </span>
        </label>

        {/* Only worth offering once the sample month is gone. Offering to
            restore what is already on screen just reads as a mistake. */}
        {!state.demoSeeded && (
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'data/reset-seed' });
              onDone(t('fresh.restoredToast'));
              onClose();
            }}
            className="press mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-field text-meta font-medium text-ink-600 dark:text-ink-300"
          >
            <ArrowCounterClockwise size={16} aria-hidden="true" />
            {t('fresh.restore')}
          </button>
        )}
      </div>
    </Sheet>
  );
}

/**
 * The floating way out.
 *
 * The banner explains, but it sits at the top of Home and scrolls away. This
 * follows you, so the offer is never more than one reach from the thumb, and
 * it is the only floating control in the app that is temporary: once the
 * sample month has been dealt with it is gone for good.
 *
 * Sized down to a fingernail on a phone, where the add button already owns the
 * corner. The visible circle is 34px but the hit area is padded out to the
 * full 44, because a small target and a small button are different things.
 */
export function ResetBalloon({ onStartFresh }: { onStartFresh: () => void }) {
  const { state, t } = useApp();
  if (!state.demoSeeded || state.transactions.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center
                 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))]
                 desk:bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
    >
      <div className="flex w-full max-w-app justify-end px-gutter desk:max-w-shell desk:px-6">
        <button
          type="button"
          onClick={onStartFresh}
          aria-label={t('fresh.balloonAria')}
          title={t('fresh.balloonAria')}
          className="press pointer-events-auto flex min-h-[44px] min-w-[44px] items-center
                     justify-center gap-2 rounded-full bg-amber-text text-white
                     dark:bg-[#F0C176] dark:text-[#332810]
                     desk:min-h-[48px] desk:px-4"
          style={{ boxShadow: '0 2px 10px rgb(20 24 23 / 0.28)' }}
        >
          {/* On a phone the label would not fit next to the add button, so the
              icon carries it and the accessible name does the explaining. */}
          <span
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full
                       desk:h-auto desk:w-auto"
          >
            <Broom size={18} weight="bold" aria-hidden="true" />
          </span>
          <span className="hidden text-meta font-semibold desk:inline">
            {t('fresh.bannerCta')}
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * The nudge on Home.
 *
 * Without it the reset is a row at the bottom of Settings, which is where
 * things go to be missed. It only appears while the sample month is still what
 * is on screen, and it disappears for good once it has been dealt with.
 */
export function SampleDataBanner({ onStartFresh }: { onStartFresh: () => void }) {
  const { state, t } = useApp();
  if (!state.demoSeeded || state.transactions.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-amber-soft px-4 py-3 dark:bg-[#332810]"
      style={{ border: '1px solid var(--hairline)' }}
    >
      <Flask
        size={18}
        weight="fill"
        className="shrink-0 text-amber-text dark:text-[#F0C176]"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 text-meta leading-snug text-amber-text dark:text-[#F0C176]">
        <strong className="font-semibold">{t('fresh.bannerTitle')}</strong>{' '}
        {t('fresh.bannerBody')}
      </p>
      <button
        type="button"
        onClick={onStartFresh}
        className="press min-h-[44px] shrink-0 rounded-field bg-amber-text px-3.5 text-meta font-semibold text-white dark:bg-[#F0C176] dark:text-[#332810]"
      >
        {t('fresh.bannerCta')}
      </button>
    </div>
  );
}
