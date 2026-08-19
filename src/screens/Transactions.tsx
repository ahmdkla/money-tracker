import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  FileArrowUp,
  FunnelSimple,
  MagnifyingGlass,
  X,
} from '@phosphor-icons/react';
import type { Transaction } from '../types';
import { useApp } from '../store/AppContext';
import {
  activeFilterCount,
  DATE_PRESETS,
  EMPTY_FILTER,
  filterTransactions,
  isFilterActive,
  summarise,
  type TxFilter,
} from '../lib/filter';
import { money, moneyWhole } from '../lib/format';
import { monthLabel } from '../lib/date';
import { tints } from '../lib/palette';
import { TransactionRow } from '../components/TransactionRow';
import { SectionHeader } from '../components/primitives';

/**
 * Every transaction, searchable.
 *
 * The app had no way to look anything up, which is fine at sixty records and
 * miserable at six hundred. Filters live in a panel that is open by default on
 * a wide screen, where there is room for it, and behind a button on a phone,
 * where there is not.
 */
export function Transactions({
  dark,
  onSelect,
  onImport,
  focusSearchToken = 0,
}: {
  dark: boolean;
  onSelect: (tx: Transaction) => void;
  onImport: () => void;
  /**
   * Bumped when the user pressed "/" elsewhere. The screen is lazily loaded,
   * so the shell cannot focus the field itself: by the time the key is
   * handled this component does not exist yet. It claims focus on arrival
   * instead, and again on every later press.
   */
  focusSearchToken?: number;
}) {
  const { state, today, categoryById, t } = useApp();
  const [filter, setFilter] = useState<TxFilter>(EMPTY_FILTER);
  const [panelOpen, setPanelOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusSearchToken) return;
    const id = window.requestAnimationFrame(() => {
      search.current?.focus();
      search.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [focusSearchToken]);

  const results = useMemo(
    () => filterTransactions(state.transactions, state.categories, filter),
    [state.transactions, state.categories, filter],
  );
  const totals = useMemo(() => summarise(results), [results]);
  const active = isFilterActive(filter);
  const count = activeFilterCount(filter);
  const tintSet = tints(dark);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of results) {
      const label = monthLabel(new Date(tx.date));
      const list = map.get(label) ?? [];
      list.push(tx);
      map.set(label, list);
    }
    return [...map.entries()];
  }, [results]);

  const set = <K extends keyof TxFilter>(key: K, value: TxFilter[K]) =>
    setFilter((f) => ({ ...f, [key]: value }));

  const toggleCategory = (id: string) =>
    setFilter((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter((c) => c !== id)
        : [...f.categoryIds, id],
    }));

  return (
    <div className="pb-24 desk:pb-8">
      <header className="flex flex-wrap items-center gap-3 px-gutter pb-3 pt-3 desk:pt-6">
        <h1 className="text-xl font-medium text-ink-900 dark:text-ink-50">
          {t('transactions.title')}
        </h1>
        <span className="flex-1" />
        <button type="button" onClick={onImport} className="btn-quiet min-h-[44px] px-3 text-meta">
          <FileArrowUp size={17} aria-hidden="true" />
          {t('transactions.importCsv')}
        </button>
      </header>

      {/* Search always visible; it is the thing people came for. ------- */}
      <div className="px-gutter">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MagnifyingGlass
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-500"
              aria-hidden="true"
            />
            <label htmlFor="tx-search" className="sr-only">
              {t('nav.searchTransactions')}
            </label>
            <input
              id="tx-search"
              ref={search}
              value={filter.text}
              onChange={(e) => set('text', e.target.value)}
              placeholder={t('transactions.searchPlaceholder')}
              className="field pl-10"
              type="search"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
            aria-controls="tx-filters"
            className="btn-quiet min-h-[48px] shrink-0 px-3 desk:hidden"
          >
            <FunnelSimple size={18} aria-hidden="true" />
            {t('transactions.filters')}
            {count > 0 && (
              <span className="ml-0.5 rounded-full bg-brand px-1.5 text-micro font-semibold text-white dark:bg-mint dark:text-brand">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="desk:grid desk:grid-cols-[280px_minmax(0,1fr)] desk:gap-5 desk:px-gutter desk:pt-4">
        {/* Filters ---------------------------------------------------- */}
        <aside
          id="tx-filters"
          className={`px-gutter pt-3 desk:block desk:px-0 desk:pt-0 ${panelOpen ? 'block' : 'hidden'}`}
        >
          <div className="card desk:sticky desk:top-6">
            <div className="flex items-center justify-between">
              <h2 className="text-meta font-medium uppercase tracking-[0.07em] text-ink-500 dark:text-ink-400">
                {t('transactions.filters')}
              </h2>
              {active && (
                <button
                  type="button"
                  onClick={() => setFilter(EMPTY_FILTER)}
                  className="press -mr-1 flex min-h-[44px] items-center gap-1 rounded-chip px-2 text-meta font-medium text-brand-mid dark:text-mint"
                >
                  <X size={13} weight="bold" aria-hidden="true" />
                  {t('common.clear')}
                </button>
              )}
            </div>

            <fieldset className="mt-2">
              <legend className="label">{t('transactions.direction')}</legend>
              <div
                className="flex gap-1 rounded-field bg-ink-100 p-1 dark:bg-night-raised"
                role="radiogroup"
                aria-label={t('transactions.direction')}
              >
                {(
                  [
                    ['all', 'common.all'],
                    ['expense', 'common.out'],
                    ['income', 'common.in'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={filter.type === v}
                    onClick={() => set('type', v)}
                    className={`press min-h-[44px] flex-1 rounded-chip text-meta font-medium ${
                      filter.type === v
                        ? 'bg-white text-ink-900 dark:bg-night-card dark:text-ink-50'
                        : 'text-ink-600 dark:text-ink-400'
                    }`}
                    style={filter.type === v ? { border: '1px solid var(--hairline)' } : undefined}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-3">
              <legend className="label">{t('transactions.period')}</legend>
              <div className="flex flex-wrap gap-1.5">
                {DATE_PRESETS.map((p) => {
                  const r = p.range(today);
                  const on = filter.from === r.from && filter.to === r.to;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setFilter((f) =>
                          on ? { ...f, from: '', to: '' } : { ...f, from: r.from, to: r.to },
                        )
                      }
                      className={`press min-h-[44px] rounded-chip px-2.5 text-meta font-medium ${
                        on
                          ? 'bg-brand text-white dark:bg-mint dark:text-brand'
                          : 'text-ink-700 dark:text-ink-200'
                      }`}
                      style={on ? undefined : { border: '1px solid var(--hairline)' }}
                    >
                      {t(p.key)}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 desk:grid-cols-1">
                <div>
                  <label htmlFor="f-from" className="label">
                    {t('transactions.from')}
                  </label>
                  <input
                    id="f-from"
                    type="date"
                    value={filter.from}
                    onChange={(e) => set('from', e.target.value)}
                    className="field tnum"
                  />
                </div>
                <div>
                  <label htmlFor="f-to" className="label">
                    {t('transactions.to')}
                  </label>
                  <input
                    id="f-to"
                    type="date"
                    value={filter.to}
                    onChange={(e) => set('to', e.target.value)}
                    className="field tnum"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="mt-3">
              <legend className="label">{t('common.amount')}</legend>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="f-min" className="sr-only">
                    {t('transactions.minAmount')}
                  </label>
                  <input
                    id="f-min"
                    value={filter.min}
                    onChange={(e) => set('min', e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    placeholder={t('transactions.min')}
                    className="field tnum"
                  />
                </div>
                <div>
                  <label htmlFor="f-max" className="sr-only">
                    {t('transactions.maxAmount')}
                  </label>
                  <input
                    id="f-max"
                    value={filter.max}
                    onChange={(e) => set('max', e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    placeholder={t('transactions.max')}
                    className="field tnum"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="mt-3">
              <legend className="label">{t('transactions.categories')}</legend>
              <div className="flex flex-wrap gap-1.5">
                {state.categories.map((c) => {
                  const on = filter.categoryIds.includes(c.id);
                  const tint = tintSet[c.colorKey];
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleCategory(c.id)}
                      className="press min-h-[44px] rounded-chip px-2.5 text-meta font-medium"
                      style={{
                        backgroundColor: on ? tint.bg : 'transparent',
                        color: on ? tint.fg : undefined,
                        border: on ? `1px solid ${tint.fg}` : '1px solid var(--hairline)',
                      }}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="mt-3 flex min-h-[44px] items-center gap-2.5 text-meta">
              <input
                type="checkbox"
                checked={filter.recurringOnly}
                onChange={(e) => set('recurringOnly', e.target.checked)}
                className="h-5 w-5 accent-brand-mid"
              />
              <span className="flex items-center gap-1.5 text-ink-700 dark:text-ink-200">
                <ArrowsClockwise size={14} aria-hidden="true" />
                {t('transactions.billsOnly')}
              </span>
            </label>
          </div>
        </aside>

        {/* Results ----------------------------------------------------- */}
        <section className="px-gutter pt-4 desk:px-0 desk:pt-0">
          <div className="mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1" aria-live="polite">
            <p className="text-meta text-ink-600 dark:text-ink-300">
              <strong className="tnum font-semibold text-ink-900 dark:text-ink-50">
                {totals.count}
              </strong>{' '}
              {t(totals.count === 1 ? 'common.transaction' : 'common.transactions')}
              {active ? ` ${t('transactions.matching')}` : ''}
            </p>
            {totals.spent > 0 && (
              <p className="text-meta text-ink-500 dark:text-ink-400">
                {t('common.out')} <span className="tnum">{money(totals.spent, state.currency)}</span>
              </p>
            )}
            {totals.received > 0 && (
              <p className="text-meta text-ink-500 dark:text-ink-400">
                {t('common.in')}{' '}
                <span className="tnum">{money(totals.received, state.currency)}</span>
              </p>
            )}
            {totals.spent > 0 && totals.received > 0 && (
              <p className="text-meta text-ink-500 dark:text-ink-400">
                {t('transactions.net')}{' '}
                <span className="tnum">{moneyWhole(totals.net, state.currency)}</span>
              </p>
            )}
          </div>

          {results.length === 0 ? (
            <div className="card">
              <p className="text-base font-medium text-ink-900 dark:text-ink-50">
                {t(
                  state.transactions.length === 0
                    ? 'transactions.emptyTitle'
                    : 'transactions.noMatchTitle',
                )}
              </p>
              <p className="mt-1.5 text-meta leading-snug text-ink-600 dark:text-ink-300">
                {t(
                  state.transactions.length === 0
                    ? 'transactions.emptyBody'
                    : 'transactions.noMatchBody',
                )}
              </p>
              {active && (
                <button
                  type="button"
                  onClick={() => setFilter(EMPTY_FILTER)}
                  className="btn-quiet mt-3 w-full"
                >
                  {t('transactions.clearFilters')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map(([label, list]) => (
                <div key={label}>
                  <SectionHeader title={label} />
                  <div className="card py-1.5">
                    {list.map((tx, i) => (
                      <div key={tx.id} className={i > 0 ? 'hairline-t' : undefined}>
                        <TransactionRow
                          tx={tx}
                          category={categoryById(tx.categoryId)}
                          currency={state.currency}
                          dark={dark}
                          today={today}
                          onSelect={onSelect}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
