import type { Transaction } from '../types';
import { addDays, sameDay, sameMonth, startOfDay, shortWeekday } from './date';
import { round2 } from './format';
import type { SafeToSpend } from './safeToSpend';

/**
 * Seven-day cash projection.
 *
 * safeToSpendToday answers "today". This answers "and then what?" by walking
 * forward day by day: everyday spending drains at dailyPace, and each known
 * bill lands on its real date. That is what makes rent show up as a visible
 * cliff rather than a number that quietly shrinks.
 */

export interface ForecastDay {
  date: Date;
  /** Projected money left in the month's pot at the end of this day. */
  projected: number;
  isToday: boolean;
  /** Below the tight threshold: draw it coral. */
  isTight: boolean;
  /** Bills landing on this day, if any. */
  bills: Transaction[];
  label: string;
}

export interface Forecast {
  days: ForecastDay[];
  /** Under this a day reads as tight: less than a week of everyday spending left. */
  tightThreshold: number;
  /** The bill worth warning about, if the window actually dips. */
  warning: { tx: Transaction; day: ForecastDay } | null;
}

export function buildForecast(
  s: SafeToSpend,
  today: Date = new Date(),
  /** What to call the first column. Passed in so this stays language free. */
  todayWord = 'Today',
): Forecast {
  const start = startOfDay(today);
  // A week of everyday spending. Above it there is room to absorb a surprise;
  // below it a single unexpected charge becomes a problem. It is drawn on the
  // chart as a labelled reference line so the colour is never the only signal.
  const tightThreshold = round2(Math.max(s.dailyPace * 7, 0));

  // Start from the uncommitted pot: everything not yet paid out this month.
  // Bills still ahead are added back so they can land on their own dates.
  const upcomingTotal = s.upcomingBills.reduce((sum, t) => sum + t.amount, 0);
  let running = s.remainingThisMonth + upcomingTotal;

  const days: ForecastDay[] = [];

  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const bills = s.upcomingBills.filter((t) => sameDay(new Date(t.date), date));

    // Everyday spending drains at the steady pace, but only for days that are
    // still inside this month; next month's pot is a different pot.
    if (sameMonth(date, today)) running -= s.dailyPace;
    running -= bills.reduce((sum, t) => sum + t.amount, 0);

    const projected = round2(running);
    days.push({
      date,
      projected,
      bills,
      isToday: i === 0,
      isTight: projected < tightThreshold,
      // The word for today comes from the caller; the weekday follows the
      // formatting locale, which the language switch already sets.
      label: i === 0 ? todayWord : shortWeekday(date),
    });
  }

  // Warn only when a bill genuinely causes a dip. A bill that the month
  // absorbs comfortably is not news, and a banner that always shows is noise.
  let warning: Forecast['warning'] = null;
  const dipDay = days.find((d) => d.isTight && d.bills.length > 0);
  if (dipDay) {
    const biggest = [...dipDay.bills].sort((a, b) => b.amount - a.amount)[0];
    warning = { tx: biggest, day: dipDay };
  }

  return { days, tightThreshold, warning };
}
