import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDown, ArrowUp } from '@phosphor-icons/react';
import type { Transaction } from '../types';
import { useApp } from '../store/AppContext';
import {
  buildReport,
  GRANULARITIES,
  summariseReport,
  transactionsInBucket,
  type Bucket,
  type Granularity,
} from '../lib/reports';
import { money, moneyWhole, numberCompact } from '../lib/format';
import { chartTheme } from '../lib/palette';
import { SectionHeader, Skeleton, VisuallyHidden } from '../components/primitives';
import { TransactionRow } from '../components/TransactionRow';

/**
 * Money in against money out, over time.
 *
 * Insights answers "where did this month go". This answers "what shape is this
 * over weeks or years", which needs the data bucketed rather than filtered.
 * Transfers are excluded: money moved between your own accounts is neither
 * income nor spending, and counting it would inflate both bars.
 */
export function Reports({
  dark,
  onSelectTransaction,
}: {
  dark: boolean;
  onSelectTransaction: (tx: Transaction) => void;
}) {
  const { state, today, categoryById, ready, t } = useApp();
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [selected, setSelected] = useState<string | null>(null);

  const buckets = useMemo(
    () => buildReport(state, granularity, today),
    [state, granularity, today],
  );
  const summary = useMemo(() => summariseReport(buckets), [buckets]);
  const c = chartTheme(dark);

  const active = selected ? buckets.find((b) => b.key === selected) ?? null : null;
  const rows = useMemo(
    () => (active ? transactionsInBucket(state.transactions, active) : []),
    [active, state.transactions],
  );

  const data = buckets.map((b) => ({
    ...b,
    // Expense is drawn below the line so the two never stack visually.
    outward: -b.expense,
  }));

  return (
    <div className="pb-24 desk:pb-8">
      <header className="px-gutter pb-3 pt-3 desk:pt-6">
        <h1 className="text-xl font-medium text-ink-900 dark:text-ink-50">
          {t('reports.title')}
        </h1>
        <p className="mt-0.5 text-meta text-ink-500 dark:text-ink-400">
          {t('reports.subtitle')}
        </p>
      </header>

      {/* Period ------------------------------------------------------- */}
      <div className="px-gutter">
        <div
          className="flex gap-1 rounded-field bg-ink-100 p-1 dark:bg-night-raised"
          role="radiogroup"
          aria-label={t('transactions.period')}
        >
          {GRANULARITIES.map((g) => {
            const on = granularity === g.id;
            return (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setGranularity(g.id);
                  setSelected(null);
                }}
                className={`press min-h-[44px] flex-1 rounded-chip text-meta font-medium ${
                  on
                    ? 'bg-white text-ink-900 dark:bg-night-card dark:text-ink-50'
                    : 'text-ink-600 dark:text-ink-400'
                }`}
                style={on ? { border: '1px solid var(--hairline)' } : undefined}
              >
                {t(g.key)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="desk:grid desk:grid-cols-3 desk:gap-5 desk:px-gutter desk:pt-4">
        {/* Totals ----------------------------------------------------- */}
        <section className="px-gutter pt-4 desk:col-span-1 desk:px-0 desk:pt-0">
          <SectionHeader title={t('reports.overStretch')} />
          <div className="card grid gap-3">
            <Figure
              label={t('common.moneyIn')}
              value={moneyWhole(summary.income, state.currency)}
              tone="in"
            />
            <Figure
              label={t('common.moneyOut')}
              value={moneyWhole(summary.expense, state.currency)}
              tone="out"
            />
            <div className="hairline-t pt-3">
              <p className="text-meta text-ink-500 dark:text-ink-400">
                {t('reports.leftOver')}
              </p>
              <p
                className={`tnum font-display text-2xl ${
                  summary.net < 0
                    ? 'text-coral-text dark:text-[#F0B49B]'
                    : 'text-brand dark:text-mint'
                }`}
              >
                {moneyWhole(summary.net, state.currency)}
              </p>
            </div>
            <p className="text-meta leading-snug text-ink-500 dark:text-ink-400">
              {summary.busiest
                ? t('reports.summary', {
                    count: summary.count,
                    label: summary.busiest.label,
                    amount: money(summary.busiest.expense, state.currency),
                  })
                : t('reports.summaryPlain', { count: summary.count })}
            </p>
          </div>
        </section>

        {/* Chart ------------------------------------------------------- */}
        <section className="px-gutter pt-5 desk:col-span-2 desk:px-0 desk:pt-0">
          <SectionHeader title={t('reports.inAndOut')} />
          <div className="card">
            {!ready ? (
              <Skeleton className="h-[240px] w-full" />
            ) : summary.count === 0 ? (
              <p className="py-6 text-center text-meta text-ink-500 dark:text-ink-400">
                {t('reports.nothingHere')}
              </p>
            ) : (
              <>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data}
                      margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                      barCategoryGap="18%"
                      onClick={(e) => {
                        const key = e?.activePayload?.[0]?.payload?.key;
                        if (key) setSelected((s) => (s === key ? null : key));
                      }}
                    >
                      <CartesianGrid stroke={c.grid} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: c.axis, fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: c.grid }}
                        interval="preserveStartEnd"
                        height={28}
                      />
                      <YAxis
                        tick={{ fill: c.axis, fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={58}
                        tickFormatter={(v: number) => numberCompact(Math.abs(v))}
                      />
                      <ReferenceLine y={0} stroke={c.axis} />
                      <Tooltip
                        cursor={{ fill: dark ? 'rgb(255 255 255 / 0.05)' : 'rgb(20 24 23 / 0.04)' }}
                        content={<ReportTooltip currency={state.currency} dark={dark} t={t} />}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={26}
                        formatter={(v) => (
                          <span style={{ color: c.axis, fontSize: 12 }}>
                            {t(v === 'income' ? 'common.moneyIn' : 'common.moneyOut')}
                          </span>
                        )}
                      />
                      <Bar dataKey="income" name="income" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                        {data.map((d) => (
                          <Cell
                            key={`i-${d.key}`}
                            fill={c.barToday}
                            stroke={c.barTodayStroke}
                            strokeWidth={1}
                            opacity={selected && selected !== d.key ? 0.35 : 1}
                            style={{ cursor: 'pointer' }}
                          />
                        ))}
                      </Bar>
                      <Bar dataKey="outward" name="expense" radius={[0, 0, 3, 3]} isAnimationActive={false}>
                        {data.map((d) => (
                          <Cell
                            key={`e-${d.key}`}
                            fill={c.barTight}
                            stroke={c.barTightStroke}
                            strokeWidth={1}
                            opacity={selected && selected !== d.key ? 0.35 : 1}
                            style={{ cursor: 'pointer' }}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <p className="mt-1 text-meta text-ink-500 dark:text-ink-400">
                  {t('reports.chartHint')}
                </p>

                <VisuallyHidden>
                  {buckets
                    .filter((b) => b.count > 0)
                    .map(
                      (b) =>
                        `${b.label}: ${t('common.in')} ${money(
                          b.income,
                          state.currency,
                        )}, ${t('common.out')} ${money(b.expense, state.currency)}`,
                    )
                    .join('. ')}
                </VisuallyHidden>
              </>
            )}
          </div>
        </section>

        {/* Drill down --------------------------------------------------- */}
        {active && (
          <section className="px-gutter pt-5 desk:col-span-3 desk:px-0">
            <SectionHeader
              title={t('reports.entries', { label: active.label, count: rows.length })}
              action={
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="press -mr-1 flex min-h-[44px] items-center rounded-chip px-2 text-meta font-medium text-brand-mid dark:text-mint"
                >
                  {t('common.close')}
                </button>
              }
            />
            <div className="card py-1.5">
              {rows.length === 0 ? (
                <p className="py-2 text-meta text-ink-500 dark:text-ink-400">
                  {t('reports.nothingInPeriod')}
                </p>
              ) : (
                rows.map((tx, i) => (
                  <div key={tx.id} className={i > 0 ? 'hairline-t' : undefined}>
                    <TransactionRow
                      tx={tx}
                      category={categoryById(tx.categoryId)}
                      currency={state.currency}
                      dark={dark}
                      today={today}
                      onSelect={onSelectTransaction}
                    />
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone: 'in' | 'out' }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-chip ${
          tone === 'in'
            ? 'bg-mint-soft text-brand dark:bg-[#153429] dark:text-[#8EDCBC]'
            : 'bg-coral-soft text-coral-text dark:bg-[#33221B] dark:text-[#F0B49B]'
        }`}
        aria-hidden="true"
      >
        {tone === 'in' ? <ArrowDown size={17} weight="bold" /> : <ArrowUp size={17} weight="bold" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-meta text-ink-500 dark:text-ink-400">{label}</span>
        <span className="tnum block text-lg font-medium text-ink-900 dark:text-ink-50">
          {value}
        </span>
      </span>
    </div>
  );
}

function ReportTooltip({
  active,
  payload,
  currency,
  dark,
  t,
}: {
  active?: boolean;
  payload?: { payload: Bucket & { outward: number } }[];
  currency: string;
  dark: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div
      className="rounded-field px-3 py-2 text-meta"
      style={{
        backgroundColor: dark ? '#1E2723' : '#141817',
        color: dark ? '#EDEFEE' : '#F7F8F7',
        border: '1px solid rgb(255 255 255 / 0.12)',
      }}
    >
      <p className="font-medium">{b.label}</p>
      <p className="tnum mt-0.5">
        {t('common.in')} {money(b.income, currency)}
      </p>
      <p className="tnum">
        {t('common.out')} {money(b.expense, currency)}
      </p>
      <p className="tnum mt-0.5 opacity-80">
        {t('transactions.net')} {money(b.net, currency)}
      </p>
    </div>
  );
}
