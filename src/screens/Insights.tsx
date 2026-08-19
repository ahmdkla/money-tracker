import { useMemo, useState } from 'react';
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowsClockwise, CaretLeft, CaretRight, Warning } from '@phosphor-icons/react';
import type { Transaction } from '../types';
import { useApp } from '../store/AppContext';
import { chartTheme, tints } from '../lib/palette';
import { addMonths, monthLabel, sameMonth } from '../lib/date';
import {
  compareToPreviousMonth,
  netWorthSeries,
  spendByCategory,
  transactionsInMonth,
} from '../lib/insights';
import { money, moneyCompact, moneyWhole, numberCompact, round2 } from '../lib/format';
import { detectRecurring, invisibleSpend } from '../lib/recurring';
import {
  CategoryTile,
  SectionHeader,
  Skeleton,
  VisuallyHidden,
} from '../components/primitives';
import { TransactionRow } from '../components/TransactionRow';

export function Insights({
  dark,
  onSelectTransaction,
}: {
  dark: boolean;
  onSelectTransaction: (tx: Transaction) => void;
}) {
  const { state, today, categoryById, ready, t, locale } = useApp();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [focus, setFocus] = useState<string | null>(null);
  /** The slice under the pointer, which the centre reads out. */
  const [hover, setHover] = useState<string | null>(null);

  const currency = state.currency;
  const isCurrentMonth = sameMonth(month, today);
  const tintSet = tints(dark);
  const c = chartTheme(dark);

  const monthTx = useMemo(
    () => transactionsInMonth(state.transactions, month),
    [state.transactions, month],
  );

  const byCategory = useMemo(
    () => spendByCategory(state.transactions, month, state.categories),
    [state.transactions, month, state.categories],
  );

  const monthTotal = round2(byCategory.reduce((s, r) => s + r.total, 0));

  const comparison = useMemo(
    () => compareToPreviousMonth(state, month, today),
    [state, month, today],
  );

  const charges = useMemo(() => detectRecurring(state, today), [state, today]);
  const invisible = invisibleSpend(charges);

  const netWorth = useMemo(() => netWorthSeries(state, today), [state, today]);

  const filtered = focus ? monthTx.filter((tx) => tx.categoryId === focus) : monthTx;
  const focusCategory = focus ? categoryById(focus) : undefined;

  // Hovering is a preview; a pinned slice survives the pointer leaving.
  const shown = hover ?? focus;
  const shownRow = byCategory.find((r) => r.categoryId === shown) ?? null;
  const shareOf = (total: number) =>
    monthTotal > 0 ? Math.round((total / monthTotal) * 100) : 0;

  return (
    <div className="pb-24 desk:pb-8">
      {/* Month selector ---------------------------------------------- */}
      <header className="mx-auto flex max-w-[560px] items-center justify-between gap-2 px-gutter pb-3 pt-3 desk:max-w-none desk:pt-6">
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          aria-label={t('insights.showMonth', { month: monthLabel(addMonths(month, -1)) })}
          className="press flex h-11 w-11 items-center justify-center rounded-full text-ink-700 dark:text-ink-200"
          style={{ border: '1px solid var(--hairline)' }}
        >
          <CaretLeft size={18} weight="bold" />
        </button>
        <h1 className="text-lg font-medium text-ink-900 dark:text-ink-50" aria-live="polite">
          {monthLabel(month)}
        </h1>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          disabled={isCurrentMonth}
          aria-label={
            isCurrentMonth
              ? t('insights.alreadyThisMonth')
              : t('insights.showMonth', { month: monthLabel(addMonths(month, 1)) })
          }
          className="press flex h-11 w-11 items-center justify-center rounded-full text-ink-700 disabled:opacity-35 dark:text-ink-200"
          style={{ border: '1px solid var(--hairline)' }}
        >
          <CaretRight size={18} weight="bold" />
        </button>
      </header>

      <div className="desk:grid desk:grid-cols-2 desk:gap-5 desk:px-gutter">
      {/* Spending by category ---------------------------------------- */}
      <section className="px-gutter pt-2 desk:px-0 desk:pt-0">
        <SectionHeader title={t('insights.spendingByCategory')} />
        <div className="card">
          {byCategory.length === 0 ? (
            <EmptyNote>{t('insights.nothingRecorded', { month: monthLabel(month) })}</EmptyNote>
          ) : !ready ? (
            <Skeleton className="h-[184px] w-full" />
          ) : (
            <>
              {/* No floating tooltip. A tooltip on a donut this size lands on
                  top of the very number it is explaining, so the reading moves
                  into the hole in the middle instead: point at a slice, or pick
                  one from the legend, and the centre says what it is. */}
              <div className="flex justify-center">
                <div className="relative h-[196px] w-[196px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byCategory}
                        dataKey="total"
                        nameKey="categoryId"
                        innerRadius={62}
                        outerRadius={92}
                        paddingAngle={1.5}
                        stroke={c.surface}
                        strokeWidth={2}
                        isAnimationActive={false}
                        onMouseLeave={() => setHover(null)}
                        onClick={(entry: { categoryId?: string }) =>
                          setFocus((f) =>
                            f === entry.categoryId ? null : (entry.categoryId ?? null),
                          )
                        }
                      >
                        {byCategory.map((r) => {
                          const lit = shown === null || shown === r.categoryId;
                          return (
                            <Cell
                              key={r.categoryId}
                              fill={tintSet[r.category?.colorKey ?? 'slate'].solid}
                              opacity={lit ? 1 : 0.28}
                              stroke={shown === r.categoryId ? c.surface : c.surface}
                              strokeWidth={shown === r.categoryId ? 3 : 2}
                              style={{ cursor: 'pointer', transition: 'opacity 140ms' }}
                              onMouseEnter={() => setHover(r.categoryId)}
                            />
                          );
                        })}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-[26px] text-center">
                    {shownRow ? (
                      <>
                        <span className="line-clamp-2 text-micro leading-tight text-ink-500 dark:text-ink-400">
                          {shownRow.category?.name ?? t('common.uncategorised')}
                        </span>
                        <span className="tnum mt-0.5 font-display text-lg leading-none text-ink-900 dark:text-ink-50">
                          {moneyCompact(shownRow.total, currency)}
                        </span>
                        <span className="tnum mt-1 text-micro text-ink-500 dark:text-ink-400">
                          {shareOf(shownRow.total)}%
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-micro text-ink-500 dark:text-ink-400">
                          {t('insights.spent')}
                        </span>
                        <span className="tnum font-display text-xl leading-tight text-ink-900 dark:text-ink-50">
                          {moneyCompact(monthTotal, currency)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* The legend is the real control: full width rows, properly
                  tappable, keyboard reachable, and carrying the share in words
                  as well as in colour. */}
              <ul className="mt-3 divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {byCategory.map((r) => {
                  const selected = focus === r.categoryId;
                  const share = shareOf(r.total);
                  const solid = tintSet[r.category?.colorKey ?? 'slate'].solid;
                  return (
                    <li key={r.categoryId}>
                      <button
                        type="button"
                        onClick={() => setFocus(selected ? null : r.categoryId)}
                        onMouseEnter={() => setHover(r.categoryId)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(r.categoryId)}
                        onBlur={() => setHover(null)}
                        aria-pressed={selected}
                        className={`press flex min-h-[48px] w-full items-center gap-2.5 rounded-chip px-1.5 text-left text-meta ${
                          selected ? 'bg-ink-100 dark:bg-night-raised' : ''
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                          style={{ backgroundColor: solid }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ink-800 dark:text-ink-100">
                            {r.category?.name ?? t('common.uncategorised')}
                          </span>
                          {/* A second read on the same number: the bar is as
                              long as the slice is wide, so the ranking is
                              legible without decoding the ring. */}
                          <span
                            className="mt-1 block h-[3px] rounded-full"
                            style={{
                              width: `${Math.max(share, 2)}%`,
                              backgroundColor: solid,
                              opacity: selected ? 1 : 0.6,
                            }}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="tnum w-9 shrink-0 text-right text-ink-500 dark:text-ink-400">
                          {share}%
                        </span>
                        <span className="tnum w-[84px] shrink-0 text-right font-medium text-ink-900 dark:text-ink-50">
                          {moneyWhole(r.total, currency)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <VisuallyHidden>
                {t('insights.totalSpent', {
                  month: monthLabel(month),
                  amount: money(monthTotal, currency),
                })}{' '}
                {byCategory
                  .map(
                    (r) =>
                      `${r.category?.name ?? t('common.uncategorised')} ${money(r.total, currency)}`,
                  )
                  .join('. ')}
              </VisuallyHidden>
            </>
          )}
        </div>
      </section>

      {/* Comparison --------------------------------------------------- */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader
          title={t(isCurrentMonth ? 'insights.comparedLast' : 'insights.monthOnMonth')}
        />
        <div className="card">
          {comparison.hasPrevious ? (
            <p className="text-base leading-snug text-ink-800 dark:text-ink-100">
              {comparison.delta === 0
                ? t('insights.spentSame')
                : t(comparison.delta > 0 ? 'insights.spentMore' : 'insights.spentLess', {
                    amount: moneyWhole(Math.abs(comparison.delta), currency),
                    when: t(
                      isCurrentMonth
                        ? 'insights.thisTimeLastMonth'
                        : 'insights.theMonthBefore',
                    ),
                  })}
            </p>
          ) : (
            <EmptyNote>{t('insights.noPrevious')}</EmptyNote>
          )}
          <p className="tnum mt-2 text-meta text-ink-500 dark:text-ink-400">
            {t('insights.against', {
              now: money(comparison.now, currency),
              before: money(comparison.before, currency),
            })}
            {isCurrentMonth ? t('insights.sameDays') : '.'}
          </p>
        </div>
      </section>

      {/* Subscription radar ------------------------------------------- */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader
          title={t('insights.subscriptionRadar')}
          icon={<ArrowsClockwise size={13} weight="bold" aria-hidden="true" />}
        />
        <div className="card">
          {charges.length === 0 ? (
            <EmptyNote>{t('insights.noSubscriptions')}</EmptyNote>
          ) : (
            <>
              <div className="hairline-b pb-3">
                <p className="text-meta text-ink-500 dark:text-ink-400">
                  {t('insights.invisibleSpend')}
                </p>
                <p className="tnum font-display text-2xl text-ink-900 dark:text-ink-50">
                  {money(invisible, currency)}
                  <span className="ml-1.5 font-sans text-meta font-normal text-ink-500 dark:text-ink-400">
                    {t('insights.aMonth')}
                  </span>
                </p>
              </div>
              <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {charges.map((r) => (
                  <li key={r.key} className="flex items-center gap-3 py-2.5">
                    <CategoryTile
                      category={categoryById(r.categoryId)}
                      dark={dark}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium text-ink-900 dark:text-ink-50">
                        {r.label}
                      </p>
                      <p className="mt-0.5 truncate text-meta text-ink-500 dark:text-ink-400">
                        {t('insights.nextOn', {
                          date: r.nextExpected.toLocaleDateString(locale, {
                            month: 'short',
                            day: 'numeric',
                          }),
                        })}
                      </p>
                      {r.looksUnused && (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-chip bg-amber-soft px-1.5 py-0.5 text-micro font-medium text-amber-text dark:bg-[#332810] dark:text-[#F0C176]">
                          <Warning size={11} weight="fill" aria-hidden="true" />
                          {t('insights.notUsedLately')}
                        </p>
                      )}
                    </div>
                    <span className="tnum shrink-0 text-base font-medium text-ink-900 dark:text-ink-50">
                      {money(r.monthlyCost, currency)}
                    </span>
                  </li>
                ))}
              </ul>
              {charges.some((r) => r.looksUnused) && (
                <p className="hairline-t mt-2 pt-2.5 text-micro leading-snug text-ink-500 dark:text-ink-400">
                  {t('insights.radarFootnote')}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Net worth ---------------------------------------------------- */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader title={t('insights.netWorth')} />
        <div className="card">
          {netWorth.length < 2 ? (
            <EmptyNote>{t('insights.notEnoughHistory')}</EmptyNote>
          ) : !ready ? (
            <Skeleton className="h-[128px] w-full" />
          ) : (
            <>
              <p className="mb-2 text-meta text-ink-500 dark:text-ink-400">
                {t('insights.netWorthCaption')}
              </p>
              <div className="h-[128px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={netWorth} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fill: c.axis, fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: c.grid }}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fill: c.axis, fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={46}
                      tickFormatter={numberCompact}
                      domain={['dataMin - 400', 'dataMax + 400']}
                    />
                    <Tooltip content={<NetWorthTooltip currency={currency} dark={dark} />} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={c.line}
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: c.line, strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="projected"
                      stroke={c.line}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <VisuallyHidden>
                {t('insights.netWorth')}.{' '}
                {netWorth.map((p) => `${p.label} ${money(p.value, currency)}`).join('. ')}
              </VisuallyHidden>
            </>
          )}
        </div>
      </section>

      {/* Filtered list ------------------------------------------------ */}
      <section className="px-gutter pt-5 desk:col-span-2 desk:px-0">
        <SectionHeader
          title={
            focusCategory
              ? t('insights.inMonth', {
                  name: focusCategory.name,
                  month: monthLabel(month),
                })
              : t('insights.allThisMonth')
          }
          action={
            focus ? (
              <button
                type="button"
                onClick={() => setFocus(null)}
                className="press -mr-1 rounded-chip px-1 py-1 text-meta font-medium text-brand-mid dark:text-mint"
              >
                {t('insights.clearFilter')}
              </button>
            ) : undefined
          }
        />
        <div className="card py-1.5">
          {filtered.length === 0 ? (
            <EmptyNote>{t('insights.nothingFor', { month: monthLabel(month) })}</EmptyNote>
          ) : (
            filtered.map((tx, i) => (
              <div key={tx.id} className={i > 0 ? 'hairline-t' : undefined}>
                <TransactionRow
                  tx={tx}
                  category={categoryById(tx.categoryId)}
                  currency={currency}
                  dark={dark}
                  today={today}
                  onSelect={onSelectTransaction}
                />
              </div>
            ))
          )}
        </div>
      </section>
      </div>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-2 text-meta leading-snug text-ink-500 dark:text-ink-400">{children}</p>
  );
}

function NetWorthTooltip({
  active,
  payload,
  label,
  currency,
  dark,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  currency: string;
  dark: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-field px-3 py-2 text-meta"
      style={{
        backgroundColor: dark ? '#1E2723' : '#141817',
        color: dark ? '#EDEFEE' : '#F7F8F7',
        border: '1px solid rgb(255 255 255 / 0.12)',
      }}
    >
      <p className="font-medium">{label}</p>
      <p className="tnum mt-0.5">{money(payload[0].value, currency)}</p>
    </div>
  );
}
