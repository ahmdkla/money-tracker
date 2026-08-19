import { lazy, Suspense, useMemo } from 'react';
import {
  Bell,
  CalendarBlank,
  CheckCircle,
  TrendDown,
  TrendUp,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react';
import type { Transaction } from '../types';
import { useApp } from '../store/AppContext';
import { fullDateLabel, greetingKeyFor, weekdayLabel } from '../lib/date';
import { money, moneyWhole, plural } from '../lib/format';
import { totalBalance } from '../lib/accounts';
import { buildAlerts, type Alert } from '../lib/alerts';
import {
  ProgressBar,
  SectionHeader,
  Skeleton,
  useCountUp,
  VisuallyHidden,
} from '../components/primitives';
import { TransactionRow } from '../components/TransactionRow';
import { SampleDataBanner } from '../components/StartFresh';

const ForecastChart = lazy(() =>
  import('../components/ForecastChart').then((m) => ({ default: m.ForecastChart })),
);

const CHART_SKELETON = <Skeleton className="h-[168px] w-full" />;

export function Home({
  dark,
  onSeeAll,
  onSelectTransaction,
  onAdd,
  onStartFresh,
}: {
  dark: boolean;
  onSeeAll: () => void;
  onSelectTransaction: (tx: Transaction) => void;
  onAdd: () => void;
  onStartFresh: () => void;
}) {
  const { state, safe, forecast, today, categoryById, ready, t } = useApp();
  const currency = state.currency;
  const empty = state.transactions.length === 0;

  // Recent means what has already happened. The list is newest first, so a
  // rent bill dated three days out would otherwise sit at the top of a
  // section headed "Recent", which it plainly is not.
  const balance = useMemo(() => totalBalance(state, today), [state, today]);

  const alerts = useMemo(
    () => buildAlerts(state, safe, today, (n) => moneyWhole(n, state.currency), t),
    [state, safe, today, t],
  );

  const recent = useMemo(() => {
    const now = today.getTime();
    return state.transactions.filter((t) => +new Date(t.date) <= now).slice(0, 3);
  }, [state.transactions, today]);

  return (
    <div className="pb-24 desk:pb-8">
      {/* 1. Greeting -------------------------------------------------- */}
      <header className="flex items-start justify-between gap-4 px-gutter pb-4 pt-3 desk:pt-6">
        <div className="min-w-0">
          <p className="text-lg font-medium text-ink-900 dark:text-ink-50">
            {t(greetingKeyFor(today))}, {state.name}
          </p>
          <p className="mt-0.5 text-meta text-ink-500 dark:text-ink-400">
            {fullDateLabel(today)}
          </p>
        </div>

      </header>

      <section className="px-gutter pb-4">
        <SampleDataBanner onStartFresh={onStartFresh} />
      </section>

      {!empty && state.accounts.length > 0 && (
        <section className="px-gutter pb-4">
          <div
            className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-card bg-white px-4 py-3 dark:bg-night-card"
            style={{ border: '1px solid var(--hairline)' }}
          >
            <span className="text-meta text-ink-500 dark:text-ink-400">
              {t('home.totalBalance')}
            </span>
            <span className="tnum text-lg font-medium text-ink-900 dark:text-ink-50">
              {moneyWhole(balance, currency)}
            </span>
            <span className="text-meta text-ink-500 dark:text-ink-400">
              {t('home.acrossAccounts', {
                count: state.accounts.filter((a) => !a.archived).length,
              })}
            </span>
          </div>
        </section>
      )}

      <div className="desk:grid desk:grid-cols-3 desk:gap-5 desk:px-gutter">
      {/* 2. Hero ------------------------------------------------------ */}
      <section className="px-gutter desk:col-span-1 desk:px-0">
        {empty ? <EmptyHero onAdd={onAdd} /> : <Hero currency={currency} />}
      </section>

      {!empty && (
        <>
          {/* 3. Forecast --------------------------------------------- */}
          <section className="px-gutter pt-6 desk:col-span-2 desk:pt-0">
            <SectionHeader
              title={t('home.next7Days')}
              icon={<CalendarBlank size={14} weight="bold" aria-hidden="true" />}
            />
            <div className="card">
              <p className="mb-3 text-meta text-ink-600 dark:text-ink-300">
                {t('home.forecastCaption')}
              </p>
              {ready ? (
                <Suspense fallback={CHART_SKELETON}>
                  <ForecastChart dark={dark} />
                </Suspense>
              ) : (
                CHART_SKELETON
              )}
            </div>
          </section>

          {/* 4. Warning banner --------------------------------------- */}
          {forecast.warning && (
            <section className="px-gutter pt-3 desk:col-span-3 desk:pt-0">
              <div className="flex items-start gap-3 rounded-card bg-coral-soft px-4 py-3.5 dark:bg-[#33221B]">
                <Warning
                  size={19}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-coral-text dark:text-coral"
                  aria-hidden="true"
                />
                <p className="text-meta leading-snug text-coral-text dark:text-[#F0B49B]">
                  {t('home.billWarning', {
                    name:
                      forecast.warning.tx.note ??
                      categoryById(forecast.warning.tx.categoryId)?.name ??
                      t('home.aBill'),
                    amount: moneyWhole(forecast.warning.tx.amount, currency),
                    day: weekdayLabel(forecast.warning.day.date),
                  })}
                </p>
              </div>
            </section>
          )}

          {/* 5. Recent ------------------------------------------------ */}
          <section className="px-gutter pt-6 desk:col-span-2 desk:pt-0">
            <SectionHeader
              title={t('home.recent')}
              action={
                <button
                  type="button"
                  onClick={onSeeAll}
                  // Negative margin keeps the visual rhythm while the hit area
                  // reaches the 44px minimum.
                  className="press -my-2.5 -mr-2 flex min-h-[44px] items-center rounded-chip px-2 text-meta font-medium text-brand-mid dark:text-mint"
                >
                  {t('common.seeAll')}
                </button>
              }
            />
            <div className="card py-1.5">
              {recent.map((tx, i) => (
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
              ))}
            </div>
          </section>
          {/* 6. Alerts ------------------------------------------------ */}
          {alerts.length > 0 && (
            <section className="px-gutter pt-6 desk:col-span-2 desk:px-0 desk:pt-0">
              <SectionHeader
                title={t('home.worthKnowing')}
                icon={<Bell size={13} weight="bold" aria-hidden="true" />}
              />
              <ul className="card divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {alerts.slice(0, 4).map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5 py-2.5">
                    <AlertGlyph tone={a.tone} />
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium text-ink-900 dark:text-ink-50">
                        {a.title}
                      </p>
                      <p className="mt-0.5 text-meta leading-snug text-ink-600 dark:text-ink-300">
                        {a.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 7. Budgets, desktop only: the width is there, use it. --- */}
          <section className="hidden desk:col-span-1 desk:block">
            <BudgetGlance dark={dark} />
          </section>
        </>
      )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------ budget glance */

/**
 * A compact read on the budgets, shown beside Recent where a desktop has room
 * for it. Deliberately not a second copy of the Budgets screen: three bars and
 * a way through, nothing more.
 */
function BudgetGlance({ dark }: { dark: boolean }) {
  const { state, today, categoryById, t } = useApp();

  const rows = useMemo(() => {
    const spent = new Map<string, number>();
    for (const t of state.transactions) {
      if (t.type !== 'expense') continue;
      const d = new Date(t.date);
      if (d.getFullYear() !== today.getFullYear() || d.getMonth() !== today.getMonth()) continue;
      spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + t.amount);
    }
    return state.budgets
      .map((b) => {
        const used = spent.get(b.categoryId) ?? 0;
        return {
          ...b,
          used,
          fraction: b.monthlyLimit > 0 ? used / b.monthlyLimit : 0,
          category: categoryById(b.categoryId),
        };
      })
      .sort((a, b) => b.fraction - a.fraction)
      .slice(0, 4);
  }, [state.transactions, state.budgets, today, categoryById]);

  if (rows.length === 0) return null;

  return (
    <>
      <SectionHeader title={t('home.budgets')} />
      <div className="card space-y-3">
        {rows.map((r) => {
          const tone = r.fraction > 1 ? '#F0997B' : r.fraction >= 0.8 ? '#EF9F27' : '#0F6E56';
          return (
            <div key={r.categoryId}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-meta font-medium text-ink-900 dark:text-ink-50">
                  {r.category?.name ?? t('common.category')}
                </span>
                <span className="tnum shrink-0 text-meta text-ink-500 dark:text-ink-400">
                  {t('budgets.ofLimit', {
                    spent: moneyWhole(r.used, state.currency),
                    limit: moneyWhole(r.monthlyLimit, state.currency),
                  })}
                </span>
              </div>
              <div className="mt-1.5">
                <ProgressBar
                  fraction={r.fraction}
                  tone={tone}
                  label={t('budgets.percentUsed', {
                    name: r.category?.name ?? t('common.category'),
                    percent: Math.round(r.fraction * 100),
                  })}
                  height={6}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="sr-only">{dark ? 'dark theme' : 'light theme'}</p>
    </>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero({ currency }: { currency: string }) {
  const { safe, state, t } = useApp();
  const shown = useCountUp(safe.safeToSpendToday);

  const ahead = safe.paceDelta >= 0;
  const delta = Math.abs(Math.round(safe.paceDelta));

  return (
    <div className="rounded-hero bg-brand px-5 pb-5 pt-5 text-white">
      <p className="text-meta font-medium uppercase tracking-[0.09em] text-mint-soft">
        {t('home.safeToSpend')}
      </p>

      {/* The line box is fixed so a change of digits never nudges the layout. */}
      <p className="mt-1.5 flex h-[68px] items-center">
        <span className="tnum font-display text-hero-sm font-normal sm:text-hero">
          {safe.atLimit ? moneyWhole(0, currency) : moneyWhole(shown, currency)}
        </span>
        <VisuallyHidden>
          {' '}
          {t('home.exactly', { amount: money(safe.safeToSpendToday, currency) })}
        </VisuallyHidden>
      </p>

      {safe.atLimit ? (
        <p className="mt-1 max-w-[34ch] text-meta leading-snug text-mint-soft">
          {t('home.atLimit')}
        </p>
      ) : (
        <p
          className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-meta font-medium ${
            ahead ? 'bg-mint text-brand' : 'bg-coral text-coral-text'
          }`}
        >
          {ahead ? (
            <TrendUp size={14} weight="bold" aria-hidden="true" />
          ) : (
            <TrendDown size={14} weight="bold" aria-hidden="true" />
          )}
          {t(ahead ? 'home.underPace' : 'home.overPace', {
            amount: moneyWhole(delta, currency),
          })}
        </p>
      )}

      <div className="mt-5">
        <div className="[&>div]:bg-brand-deep">
          <ProgressBar
            fraction={safe.usedFraction}
            tone="#5DCAA5"
            label={t('home.percentUsed', {
              percent: Math.round(safe.usedFraction * 100),
            })}
            height={5}
          />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3 text-meta text-mint-soft">
          <span className="tnum">
            {t('home.leftThisMonth', {
              amount: moneyWhole(Math.max(0, safe.remainingThisMonth), state.currency),
            })}
          </span>
          <span className="tnum">
            {t('home.daysToGo', {
              count: plural(
                safe.daysLeftIncludingToday,
                t('common.day'),
                t('common.days'),
              ),
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Tone carries an icon as well as a colour, so it is never colour alone. */
function AlertGlyph({ tone }: { tone: Alert['tone'] }) {
  if (tone === 'warning') {
    return (
      <Warning
        size={17}
        weight="fill"
        className="mt-0.5 shrink-0 text-coral-text dark:text-[#F0B49B]"
        aria-hidden="true"
      />
    );
  }
  if (tone === 'attention') {
    return (
      <WarningCircle
        size={17}
        weight="fill"
        className="mt-0.5 shrink-0 text-amber-text dark:text-[#F0C176]"
        aria-hidden="true"
      />
    );
  }
  return (
    <CheckCircle
      size={17}
      className="mt-0.5 shrink-0 text-brand-mid dark:text-mint"
      aria-hidden="true"
    />
  );
}

function EmptyHero({ onAdd }: { onAdd: () => void }) {
  const { t } = useApp();
  return (
    <div className="rounded-hero bg-brand px-5 py-6 text-white">
      <p className="text-meta font-medium uppercase tracking-[0.09em] text-mint-soft">
        {t('home.safeToSpend')}
      </p>
      <p className="mt-2 max-w-[26ch] font-display text-[1.6rem] leading-snug">
        {t('home.emptyTitle')}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="press mt-4 inline-flex min-h-[44px] items-center rounded-field bg-mint px-4 text-meta font-semibold text-brand"
      >
        {t('home.emptyCta')}
      </button>
    </div>
  );
}
