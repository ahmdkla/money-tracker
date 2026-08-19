import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Transaction } from '../types';
import { useApp } from '../store/AppContext';
import { chartTheme } from '../lib/palette';
import { money, numberCompact } from '../lib/format';
import { VisuallyHidden } from './primitives';

/*
 * Split out from Home so Recharts is not in the initial bundle. The hero
 * number is the reason the app exists and it must not wait on a chart
 * library; this arrives a moment later, behind the skeleton that is already
 * holding its space.
 */

export function ForecastChart({ dark }: { dark: boolean }) {
  const { forecast, state, t } = useApp();
  const c = chartTheme(dark);

  const data = forecast.days.map((d) => ({
    label: d.label,
    value: d.projected,
    tight: d.isTight,
    today: d.isToday,
    bills: d.bills,
    date: d.date,
  }));

  const tightCount = forecast.days.filter((d) => d.isTight).length;

  return (
    <>
      <div className="h-[168px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%">
            <YAxis
              tick={{ fill: c.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={numberCompact}
            />
            <XAxis
              dataKey="label"
              tick={(props) => <DayTick {...props} data={data} axis={c.axis} tight={c.barTightStroke} />}
              tickLine={false}
              axisLine={{ stroke: c.grid }}
              interval={0}
              height={34}
            />
            <ReferenceLine
              y={forecast.tightThreshold}
              stroke={c.reference}
              strokeDasharray="3 4"
            />
            <ReferenceLine y={0} stroke={c.grid} />
            <Tooltip
              cursor={{ fill: dark ? 'rgb(255 255 255 / 0.05)' : 'rgb(20 24 23 / 0.04)' }}
              content={<ForecastTooltip currency={state.currency} dark={dark} t={t} />}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell
                  key={d.label + d.date.toISOString()}
                  fill={d.tight ? c.barTight : d.today ? c.barToday : c.bar}
                  stroke={
                    d.tight ? c.barTightStroke : d.today ? c.barTodayStroke : c.barStroke
                  }
                  strokeWidth={1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* The legend also carries the meaning in words, so colour is never the
          only thing distinguishing a tight day from an ordinary one. */}
      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-ink-500 dark:text-ink-400">
        <LegendKey fill={c.barToday} stroke={c.barTodayStroke} label={t('home.legendToday')} />
        <LegendKey fill={c.bar} stroke={c.barStroke} label={t('home.legendOrdinary')} />
        <LegendKey
          fill={c.barTight}
          stroke={c.barTightStroke}
          label={t('home.legendTight')}
        />
        <li className="flex items-center gap-1.5">
          <span
            className="h-0 w-3.5"
            style={{ borderTop: `1px dashed ${c.reference}` }}
            aria-hidden="true"
          />
          {t('home.legendThreshold')}
        </li>
      </ul>

      <VisuallyHidden>
        {t('home.next7Days')}.{' '}
        {data
          .map(
            (d) =>
              `${d.label}, ${money(d.value, state.currency)}${
                d.tight ? `, ${t('forecast.tight')}` : ''
              }`,
          )
          .join('. ')}
        .{' '}
        {tightCount > 0
          ? t('forecast.tightDays', { count: tightCount })
          : t('forecast.noTightDays')}
      </VisuallyHidden>
    </>
  );
}

function LegendKey({ fill, stroke, label }: { fill: string; stroke: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-[2px]"
        style={{ backgroundColor: fill, border: `1px solid ${stroke}` }}
        aria-hidden="true"
      />
      {label}
    </li>
  );
}

/** Tight days get a coral label and a dot, so the axis repeats the signal. */
function DayTick(props: {
  x?: number;
  y?: number;
  payload?: { value: string; index: number };
  data: { tight: boolean; today: boolean }[];
  axis: string;
  tight: string;
}) {
  const { x = 0, y = 0, payload, data, axis, tight } = props;
  const d = payload ? data[payload.index] : undefined;
  const isTight = d?.tight ?? false;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={13}
        textAnchor="middle"
        fontSize={11}
        fontWeight={d?.today ? 600 : 400}
        fill={isTight ? tight : axis}
      >
        {payload?.value}
      </text>
      {isTight && <circle cx={0} cy={22} r={2} fill={tight} />}
    </g>
  );
}

function ForecastTooltip({
  active,
  payload,
  currency,
  dark,
  t,
}: {
  active?: boolean;
  payload?: { payload: { label: string; value: number; tight: boolean; bills: Transaction[] } }[];
  currency: string;
  dark: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  return (
    <div
      className="rounded-field px-3 py-2 text-meta"
      style={{
        backgroundColor: dark ? '#1E2723' : '#141817',
        color: dark ? '#EDEFEE' : '#F7F8F7',
        border: '1px solid rgb(255 255 255 / 0.12)',
      }}
    >
      <p className="font-medium">{d.label}</p>
      <p className="tnum mt-0.5">{t('home.spentLeft', { amount: money(d.value, currency) })}</p>
      {d.bills.map((b) => (
        <p key={b.id} className="mt-0.5 opacity-80">
          {b.note ?? t('home.aBill')} {money(b.amount, currency)}
        </p>
      ))}
      {d.tight && <p className="mt-0.5 opacity-80">{t('forecast.underRunway')}</p>}
    </div>
  );
}
