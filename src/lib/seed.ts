import type { Account, AppState, Category, SavingsGoal, Transaction } from '../types';

/**
 * Demo data for a first run.
 *
 * It is built relative to whatever "today" is, so the app always opens on a
 * month in progress rather than a frozen date. The numbers are tuned so the
 * Home screen shows the product actually doing its job: a month running a
 * little warm, with rent landing in a few days and pulling the seven day
 * forecast under the line.
 */

let counter = 0;
const id = (prefix: string) => `${prefix}_${(counter++).toString(36)}_${Date.now().toString(36)}`;

export const SEED_CATEGORIES: Category[] = [
  { id: 'cat_coffee', name: 'Coffee', icon: 'Coffee', colorKey: 'amber', kind: 'expense' },
  { id: 'cat_groceries', name: 'Groceries', icon: 'ShoppingCart', colorKey: 'clay', kind: 'expense' },
  { id: 'cat_dining', name: 'Dining', icon: 'ForkKnife', colorKey: 'coral', kind: 'expense' },
  { id: 'cat_rent', name: 'Rent', icon: 'House', colorKey: 'evergreen', kind: 'expense' },
  { id: 'cat_transport', name: 'Transport', icon: 'Car', colorKey: 'slate', kind: 'expense' },
  { id: 'cat_subs', name: 'Subscriptions', icon: 'Repeat', colorKey: 'plum', kind: 'expense' },
  { id: 'cat_home', name: 'Home', icon: 'Lightning', colorKey: 'sand', kind: 'expense' },
  { id: 'cat_health', name: 'Health', icon: 'Heartbeat', colorKey: 'mint', kind: 'expense' },
  { id: 'cat_payroll', name: 'Payroll', icon: 'Briefcase', colorKey: 'evergreen', kind: 'income' },
];

/**
 * Somewhere for the money to actually be. Most people running a demo have
 * roughly this shape: a current account that wages land in, a little cash, and
 * a wallet app.
 */
export const SEED_ACCOUNTS: Account[] = [
  {
    id: 'acc_bank',
    name: 'Current account',
    kind: 'bank',
    icon: 'Bank',
    colorKey: 'evergreen',
    openingBalance: 1840.5,
  },
  { id: 'acc_cash', name: 'Cash', kind: 'cash', icon: 'Wallet', colorKey: 'sand', openingBalance: 120 },
  {
    id: 'acc_wallet',
    name: 'E-wallet',
    kind: 'ewallet',
    icon: 'DeviceMobile',
    colorKey: 'plum',
    // Topped up from the current account each month, which is how people
    // actually use one. See the seeded transfers below.
    openingBalance: 90,
  },
  {
    id: 'acc_savings',
    name: 'Savings',
    kind: 'savings',
    icon: 'PiggyBank',
    colorKey: 'mint',
    openingBalance: 2400,
  },
];

/** Two targets, one comfortably on track and one that is not. */
export const SEED_GOALS: SavingsGoal[] = [
  {
    id: 'goal_buffer',
    name: 'Emergency fund',
    target: 3000,
    saved: 2400,
    icon: 'ShieldCheck',
    colorKey: 'evergreen',
  },
  {
    id: 'goal_trip',
    name: 'Trip in the spring',
    target: 1800,
    saved: 320,
    deadline: '2027-04-01',
    icon: 'Suitcase',
    colorKey: 'amber',
  },
];

/** Day of month plus a time of day, clamped so short months never overflow. */
function on(base: Date, day: number, hour = 12, minute = 0, monthOffset = 0): string {
  const month = base.getMonth() + monthOffset;
  const last = new Date(base.getFullYear(), month + 1, 0).getDate();
  const d = new Date(base.getFullYear(), month, Math.min(day, last), hour, minute, 0, 0);
  return d.toISOString();
}

interface Row {
  day: number;
  hour?: number;
  minute?: number;
  amount: number;
  categoryId: string;
  note: string;
  type?: 'expense' | 'income';
  recurring?: boolean;
  accountId?: string;
  /** 0 for this month, -1 for last month. */
  monthOffset?: number;
}

/**
 * Discretionary spending, totalling 1710.32 across the first nineteen days.
 * Against a 2386.52 pot that is roughly seventy two percent used, which is
 * warm but not alarming for the nineteenth of the month.
 */
const DISCRETIONARY: Row[] = [
  { day: 1, amount: 128.4, categoryId: 'cat_groceries', note: 'Trader Joes', hour: 17, minute: 20 },
  { day: 2, amount: 74.2, categoryId: 'cat_dining', note: 'Dinner with Sam', hour: 20, minute: 5 },
  { day: 3, amount: 5.25, categoryId: 'cat_coffee', note: 'Blue Bottle', hour: 8, minute: 40 },
  { day: 4, amount: 52.0, categoryId: 'cat_transport', note: 'Gas', hour: 9, minute: 15 },
  { day: 5, amount: 94.6, categoryId: 'cat_home', note: 'Electric bill', hour: 11, minute: 0 },
  { day: 6, amount: 48.9, categoryId: 'cat_dining', note: 'Weekend brunch', hour: 11, minute: 30 },
  { day: 7, amount: 142.75, categoryId: 'cat_groceries', note: 'Whole Foods', hour: 16, minute: 45 },
  { day: 8, amount: 90.0, categoryId: 'cat_health', note: 'Physio session', hour: 10, minute: 0 },
  { day: 9, amount: 64.0, categoryId: 'cat_transport', note: 'Train tickets', hour: 13, minute: 10 },
  { day: 10, amount: 118.0, categoryId: 'cat_dining', note: 'Birthday dinner', hour: 20, minute: 40 },
  { day: 11, amount: 198.77, categoryId: 'cat_home', note: 'New desk chair', hour: 15, minute: 25 },
  { day: 12, amount: 63.45, categoryId: 'cat_groceries', note: 'Corner market', hour: 18, minute: 55 },
  { day: 13, amount: 185.0, categoryId: 'cat_health', note: 'Dentist copay', hour: 9, minute: 30 },
  { day: 14, amount: 38.4, categoryId: 'cat_dining', note: 'Ramen with Jo', hour: 19, minute: 20 },
  { day: 15, amount: 117.3, categoryId: 'cat_groceries', note: 'Trader Joes', hour: 17, minute: 5 },
  { day: 16, amount: 96.0, categoryId: 'cat_dining', note: 'Dinner out', hour: 20, minute: 15 },
  { day: 16, amount: 5.5, categoryId: 'cat_coffee', note: 'Cafe Lune', hour: 9, minute: 10 },
  { day: 17, amount: 108.9, categoryId: 'cat_groceries', note: 'Whole Foods', hour: 16, minute: 30 },
  { day: 18, amount: 52.85, categoryId: 'cat_groceries', note: 'Corner market', hour: 18, minute: 40 },
  { day: 18, amount: 21.3, categoryId: 'cat_transport', note: 'Uber', hour: 22, minute: 5 },
  { day: 19, amount: 4.75, categoryId: 'cat_coffee', note: 'Blue Bottle', hour: 8, minute: 42 },
];

/** Known fixed charges. Rent is dated ahead so the forecast has something to say. */
const RECURRING: Row[] = [
  { day: 3, amount: 32.0, categoryId: 'cat_subs', note: 'Gym membership', recurring: true, hour: 6 },
  { day: 6, amount: 15.49, categoryId: 'cat_subs', note: 'Netflix', recurring: true, hour: 6 },
  { day: 8, amount: 54.0, categoryId: 'cat_home', note: 'Internet', recurring: true, hour: 6 },
  { day: 12, amount: 11.99, categoryId: 'cat_subs', note: 'Spotify', recurring: true, hour: 6 },
  { day: 22, amount: 680.0, categoryId: 'cat_rent', note: 'Rent', recurring: true, hour: 9 },
];

/** Paid semi-monthly, so the two together are exactly the expected income. */
const INCOME: Row[] = [
  { day: 3, amount: 1840.0, categoryId: 'cat_payroll', note: 'Payroll', type: 'income', hour: 9 },
  { day: 17, amount: 1840.0, categoryId: 'cat_payroll', note: 'Payroll', type: 'income', hour: 9 },
];

/**
 * Last month, so the comparison on Insights has something true to say rather
 * than an empty state on first open.
 *
 * Days one to nineteen come to 1398.32 of discretionary spending. With the
 * 113.48 of fixed bills that land in the same stretch, that is 1511.80 against
 * this month's 1823.80, which is where the "312.00 more" reading comes from.
 */
const PREVIOUS: Row[] = [
  { day: 1, amount: 112.6, categoryId: 'cat_groceries', note: 'Trader Joes', hour: 17 },
  { day: 2, amount: 5.25, categoryId: 'cat_coffee', note: 'Blue Bottle', hour: 8 },
  { day: 2, amount: 29.77, categoryId: 'cat_dining', note: 'Lunch', hour: 13 },
  { day: 3, amount: 64.8, categoryId: 'cat_dining', note: 'Dinner out', hour: 20 },
  { day: 4, amount: 46.2, categoryId: 'cat_home', note: 'Water bill', hour: 11 },
  { day: 5, amount: 48.5, categoryId: 'cat_transport', note: 'Gas', hour: 9 },
  { day: 6, amount: 134.2, categoryId: 'cat_groceries', note: 'Whole Foods', hour: 16 },
  { day: 7, amount: 88.4, categoryId: 'cat_home', note: 'Electric bill', hour: 11 },
  { day: 8, amount: 38.6, categoryId: 'cat_dining', note: 'Takeout', hour: 19 },
  { day: 9, amount: 42.3, categoryId: 'cat_dining', note: 'Weekend brunch', hour: 11 },
  { day: 10, amount: 90.0, categoryId: 'cat_health', note: 'Physio session', hour: 10 },
  { day: 10, amount: 5.25, categoryId: 'cat_coffee', note: 'Blue Bottle', hour: 8 },
  { day: 11, amount: 58.75, categoryId: 'cat_groceries', note: 'Corner market', hour: 18 },
  { day: 12, amount: 115.3, categoryId: 'cat_groceries', note: 'Whole Foods', hour: 16 },
  { day: 13, amount: 64.0, categoryId: 'cat_transport', note: 'Train tickets', hour: 13 },
  { day: 14, amount: 36.9, categoryId: 'cat_dining', note: 'Ramen', hour: 19 },
  { day: 14, amount: 80.0, categoryId: 'cat_home', note: 'Household', hour: 15 },
  { day: 15, amount: 121.4, categoryId: 'cat_groceries', note: 'Trader Joes', hour: 17 },
  { day: 16, amount: 24.8, categoryId: 'cat_transport', note: 'Uber', hour: 22 },
  { day: 17, amount: 88.0, categoryId: 'cat_dining', note: 'Birthday drinks', hour: 21 },
  { day: 17, amount: 42.9, categoryId: 'cat_health', note: 'Pharmacy', hour: 12 },
  { day: 18, amount: 5.5, categoryId: 'cat_coffee', note: 'Cafe Lune', hour: 9 },
  { day: 19, amount: 54.9, categoryId: 'cat_groceries', note: 'Corner market', hour: 18 },
  // The rest of the month, so last month reads as a whole month.
  { day: 21, amount: 98.4, categoryId: 'cat_groceries', note: 'Whole Foods', hour: 16 },
  { day: 23, amount: 72.5, categoryId: 'cat_dining', note: 'Dinner out', hour: 20 },
  { day: 25, amount: 5.25, categoryId: 'cat_coffee', note: 'Blue Bottle', hour: 8 },
  { day: 27, amount: 51.0, categoryId: 'cat_transport', note: 'Gas', hour: 9 },
  { day: 28, amount: 104.8, categoryId: 'cat_groceries', note: 'Trader Joes', hour: 17 },
  { day: 30, amount: 44.2, categoryId: 'cat_dining', note: 'Takeout', hour: 19 },
  // The same standing bills, on the same days.
  { day: 3, amount: 32.0, categoryId: 'cat_subs', note: 'Gym membership', recurring: true, hour: 6 },
  { day: 6, amount: 15.49, categoryId: 'cat_subs', note: 'Netflix', recurring: true, hour: 6 },
  { day: 8, amount: 54.0, categoryId: 'cat_home', note: 'Internet', recurring: true, hour: 6 },
  { day: 12, amount: 11.99, categoryId: 'cat_subs', note: 'Spotify', recurring: true, hour: 6 },
  { day: 22, amount: 680.0, categoryId: 'cat_rent', note: 'Rent', recurring: true, hour: 9 },
  { day: 3, amount: 1840.0, categoryId: 'cat_payroll', note: 'Payroll', type: 'income', hour: 9 },
  { day: 17, amount: 1840.0, categoryId: 'cat_payroll', note: 'Payroll', type: 'income', hour: 9 },
].map((r) => ({ ...r, monthOffset: -1 }) as Row);

function toTransaction(base: Date, r: Row): Transaction {
  let date = on(base, r.day, r.hour ?? 12, r.minute ?? 0, r.monthOffset ?? 0);

  // Rows sit at fixed times of day, so opening the app at one in the morning
  // would date this morning's coffee in the future and drop it out of Recent.
  // Known bills are exempt: rent is meant to be ahead.
  if (!r.recurring && new Date(date) > base) {
    date = new Date(base.getTime() - 5 * 60_000).toISOString();
  }

  return {
    id: id('tx'),
    amount: r.amount,
    type: r.type ?? 'expense',
    categoryId: r.categoryId,
    note: r.note,
    date,
    accountId: r.accountId ?? accountForRow(r),
    ...(r.recurring ? { recurring: true } : {}),
  };
}

/**
 * Which account a seeded row came out of. Cash for the small everyday things,
 * the wallet app for transport, the current account for everything else, which
 * is roughly how people actually split it.
 */
function accountForRow(r: Row): string {
  if (r.type === 'income') return 'acc_bank';
  if (r.recurring) return 'acc_bank';
  if (r.categoryId === 'cat_coffee') return 'acc_cash';
  if (r.categoryId === 'cat_transport') return 'acc_wallet';
  if (r.amount < 25) return 'acc_cash';
  return 'acc_bank';
}

/**
 * Seeded rows sit on fixed days of the month. Opening the app on the 3rd would
 * otherwise leave almost nothing on screen, so any row dated after today is
 * pulled back onto a day that has already happened. Rent is exempt: a bill in
 * the near future is the whole point of it.
 */
function fitToToday(base: Date, rows: Row[], keepFuture = false): Row[] {
  const todayDay = base.getDate();
  if (keepFuture || todayDay >= 20) return rows;

  const span = Math.max(todayDay - 1, 1);
  return rows.map((r) => {
    if (r.day <= todayDay) return r;
    const shifted = ((r.day - 1) % span) + 1;
    return { ...r, day: Math.min(shifted, todayDay) };
  });
}

export function createSeedState(today: Date = new Date()): AppState {
  counter = 0;
  const base = new Date(today);

  const rows: Row[] = [
    ...fitToToday(base, DISCRETIONARY),
    ...fitToToday(base, RECURRING, true),
    ...fitToToday(base, INCOME),
    ...PREVIOUS,
  ];

  const transactions = rows
    .map((r) => toTransaction(base, r))
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));

  // Six months of gentle upward drift. The current month is derived live in
  // Insights from real transactions, so the last point moves as the app is used.
  const values = [2940, 3180, 3420, 3610, 3890, 4120];
  const netWorthHistory = [-6, -5, -4, -3, -2, -1].map((offset, i) => {
    const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    return {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      value: values[i],
    };
  });

  return {
    name: 'Maya',
    monthlyIncome: 3680,
    savingsGoalPerMonth: 500,
    currency: 'USD',
    darkMode: 'system',
    categories: SEED_CATEGORIES,
    transactions,
    budgets: [
      { categoryId: 'cat_groceries', monthlyLimit: 800 },
      { categoryId: 'cat_dining', monthlyLimit: 420 },
      { categoryId: 'cat_coffee', monthlyLimit: 60 },
      { categoryId: 'cat_transport', monthlyLimit: 200 },
    ],
    netWorthHistory,
    endedSeries: [],
    demoSeeded: true,
    accounts: SEED_ACCOUNTS,
    goals: SEED_GOALS,
    transfers: [
      {
        id: 'tr_seed_1',
        amount: 200,
        fromAccountId: 'acc_bank',
        toAccountId: 'acc_cash',
        note: 'Cash for the week',
        date: on(base, Math.max(1, Math.min(base.getDate(), 14)), 10, 0),
      },
      {
        id: 'tr_seed_2',
        amount: 500,
        fromAccountId: 'acc_bank',
        toAccountId: 'acc_savings',
        note: 'Monthly set aside',
        date: on(base, Math.max(1, Math.min(base.getDate(), 3)), 9, 0),
      },
      {
        id: 'tr_seed_3',
        amount: 150,
        fromAccountId: 'acc_bank',
        toAccountId: 'acc_wallet',
        note: 'Top up',
        date: on(base, Math.max(1, Math.min(base.getDate(), 5)), 8, 0),
      },
      {
        id: 'tr_seed_4',
        amount: 150,
        fromAccountId: 'acc_bank',
        toAccountId: 'acc_wallet',
        note: 'Top up',
        date: on(base, 5, 8, 0, -1),
      },
    ],
  };
}

/** An account with nothing in it. What "Reset demo data" clears down to. */
export function createEmptyState(today: Date = new Date()): AppState {
  const seed = createSeedState(today);
  return {
    ...seed,
    name: 'there',
    transactions: [],
    budgets: [],
    netWorthHistory: [],
    endedSeries: [],
    demoSeeded: false,
    // An empty account still needs somewhere to put the first transaction.
    accounts: [
      { id: 'acc_cash', name: 'Cash', kind: 'cash', icon: 'Wallet', colorKey: 'sand', openingBalance: 0 },
    ],
    transfers: [],
    goals: [],
  };
}
