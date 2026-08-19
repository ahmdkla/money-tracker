import type { Account, AppState, Category, SavingsGoal, Transaction } from '../types';

/**
 * Demo data for a first run, in rupiah.
 *
 * Built relative to whatever "today" is, so the app always opens on a month in
 * progress rather than a frozen date. The numbers are tuned so the Home screen
 * shows the product doing its job: a month running a little warm, with the
 * rent landing in a few days and pulling the seven day forecast under the line.
 *
 * Merchants are ones an Indonesian user actually sees on a statement, so the
 * quick-add matcher and the CSV importer are exercised against realistic names
 * rather than invented ones.
 */

/**
 * The catch-all categories, by id.
 *
 * Exported because more than one place needs to find them without matching on
 * a name that the user is free to change.
 */
export const FALLBACK_EXPENSE_ID = 'cat_other';
export const FALLBACK_INCOME_ID = 'cat_other_income';

/** The names they are created with, per language, for an older save. */
export const FALLBACK_NAMES = {
  id: { expense: 'Lainnya', income: 'Pemasukan lain' },
  en: { expense: 'Other', income: 'Other income' },
} as const;

let counter = 0;
const id = (prefix: string) => `${prefix}_${(counter++).toString(36)}_${Date.now().toString(36)}`;

export const SEED_CATEGORIES: Category[] = [
  { id: 'cat_coffee', name: 'Kopi', icon: 'Coffee', colorKey: 'amber', kind: 'expense' },
  { id: 'cat_groceries', name: 'Belanja', icon: 'ShoppingCart', colorKey: 'clay', kind: 'expense' },
  { id: 'cat_dining', name: 'Makan di luar', icon: 'ForkKnife', colorKey: 'coral', kind: 'expense' },
  { id: 'cat_rent', name: 'Sewa', icon: 'House', colorKey: 'evergreen', kind: 'expense' },
  { id: 'cat_transport', name: 'Transportasi', icon: 'Car', colorKey: 'slate', kind: 'expense' },
  { id: 'cat_subs', name: 'Langganan', icon: 'Repeat', colorKey: 'plum', kind: 'expense' },
  { id: 'cat_home', name: 'Rumah', icon: 'Lightning', colorKey: 'sand', kind: 'expense' },
  { id: 'cat_health', name: 'Kesehatan', icon: 'Heartbeat', colorKey: 'mint', kind: 'expense' },
  { id: 'cat_payroll', name: 'Gaji', icon: 'Briefcase', colorKey: 'evergreen', kind: 'income' },
  // The two below are the ones nobody chooses on purpose. They exist so that
  // recording something is never blocked by not knowing where it belongs:
  // a transaction with no category lands here and can be moved later.
  { id: FALLBACK_EXPENSE_ID, name: 'Lainnya', icon: 'Tag', colorKey: 'slate', kind: 'expense' },
  {
    id: FALLBACK_INCOME_ID,
    name: 'Pemasukan lain',
    icon: 'Tag',
    colorKey: 'slate',
    kind: 'income',
  },
];

/** Where the money sits. Topped up from the main account, as people do. */
export const SEED_ACCOUNTS: Account[] = [
  {
    id: 'acc_bank',
    name: 'Rekening utama',
    kind: 'bank',
    icon: 'Bank',
    colorKey: 'evergreen',
    openingBalance: 4200000,
  },
  {
    id: 'acc_cash',
    name: 'Tunai',
    kind: 'cash',
    icon: 'Wallet',
    colorKey: 'sand',
    openingBalance: 350000,
  },
  {
    id: 'acc_wallet',
    name: 'Dompet digital',
    kind: 'ewallet',
    icon: 'DeviceMobile',
    colorKey: 'plum',
    openingBalance: 500000,
  },
  {
    id: 'acc_savings',
    name: 'Tabungan',
    kind: 'savings',
    icon: 'PiggyBank',
    colorKey: 'mint',
    openingBalance: 8500000,
  },
];

/** One comfortably on track, one that is not. */
export const SEED_GOALS: SavingsGoal[] = [
  {
    id: 'goal_buffer',
    name: 'Dana darurat',
    target: 12000000,
    saved: 8500000,
    icon: 'ShieldCheck',
    colorKey: 'evergreen',
  },
  {
    id: 'goal_trip',
    name: 'Liburan tahun depan',
    target: 9000000,
    saved: 1600000,
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
 * Everyday spending across the first nineteen days. Against the month's pot
 * this comes to roughly seventy two percent used, which is warm but not
 * alarming for the nineteenth.
 */
const DISCRETIONARY: Row[] = [
  { day: 1, amount: 385000, categoryId: 'cat_groceries', note: 'Superindo', hour: 17, minute: 20 },
  { day: 2, amount: 222000, categoryId: 'cat_dining', note: 'Makan sama Sam', hour: 20, minute: 5 },
  { day: 3, amount: 26000, categoryId: 'cat_coffee', note: 'Kopi Kenangan', hour: 8, minute: 40 },
  { day: 4, amount: 156000, categoryId: 'cat_transport', note: 'Bensin', hour: 9, minute: 15 },
  { day: 5, amount: 284000, categoryId: 'cat_home', note: 'Token listrik', hour: 11, minute: 0 },
  { day: 6, amount: 147000, categoryId: 'cat_dining', note: 'Brunch akhir pekan', hour: 11, minute: 30 },
  { day: 7, amount: 428000, categoryId: 'cat_groceries', note: 'Indomaret', hour: 16, minute: 45 },
  { day: 8, amount: 270000, categoryId: 'cat_health', note: 'Fisioterapi', hour: 10, minute: 0 },
  { day: 9, amount: 192000, categoryId: 'cat_transport', note: 'Tiket kereta', hour: 13, minute: 10 },
  { day: 10, amount: 354000, categoryId: 'cat_dining', note: 'Makan ulang tahun', hour: 20, minute: 40 },
  { day: 11, amount: 596000, categoryId: 'cat_home', note: 'Kursi kerja baru', hour: 15, minute: 25 },
  { day: 12, amount: 190000, categoryId: 'cat_groceries', note: 'Warung dekat rumah', hour: 18, minute: 55 },
  { day: 13, amount: 555000, categoryId: 'cat_health', note: 'Tambal gigi', hour: 9, minute: 30 },
  { day: 14, amount: 115000, categoryId: 'cat_dining', note: 'Ramen bareng Jo', hour: 19, minute: 20 },
  { day: 15, amount: 352000, categoryId: 'cat_groceries', note: 'Superindo', hour: 17, minute: 5 },
  { day: 16, amount: 288000, categoryId: 'cat_dining', note: 'Makan malam di luar', hour: 20, minute: 15 },
  { day: 16, amount: 28000, categoryId: 'cat_coffee', note: 'Kopi Tuku', hour: 9, minute: 10 },
  { day: 17, amount: 327000, categoryId: 'cat_groceries', note: 'Alfamart', hour: 16, minute: 30 },
  { day: 18, amount: 158000, categoryId: 'cat_groceries', note: 'Warung dekat rumah', hour: 18, minute: 40 },
  { day: 18, amount: 43000, categoryId: 'cat_transport', note: 'Gojek', hour: 22, minute: 5 },
  { day: 19, amount: 15000, categoryId: 'cat_coffee', note: 'Kopi Kenangan', hour: 8, minute: 42 },
];

/** Known fixed charges. Rent is dated ahead so the forecast has something to say. */
const RECURRING: Row[] = [
  { day: 3, amount: 350000, categoryId: 'cat_subs', note: 'Membership gym', recurring: true, hour: 6 },
  { day: 6, amount: 65000, categoryId: 'cat_subs', note: 'Netflix', recurring: true, hour: 6 },
  { day: 8, amount: 350000, categoryId: 'cat_home', note: 'Internet', recurring: true, hour: 6 },
  { day: 12, amount: 55000, categoryId: 'cat_subs', note: 'Spotify', recurring: true, hour: 6 },
  { day: 22, amount: 2800000, categoryId: 'cat_rent', note: 'Sewa kos', recurring: true, hour: 9 },
];

/** Paid twice a month, so the two together are exactly the expected income. */
const INCOME: Row[] = [
  { day: 3, amount: 6000000, categoryId: 'cat_payroll', note: 'Gaji', type: 'income', hour: 9 },
  { day: 17, amount: 6000000, categoryId: 'cat_payroll', note: 'Gaji', type: 'income', hour: 9 },
];

/**
 * Last month, so the comparison on Insights has something true to say rather
 * than an empty state on first open.
 */
const PREVIOUS: Row[] = (
  [
    { day: 1, amount: 338000, categoryId: 'cat_groceries', note: 'Superindo', hour: 17 },
    { day: 2, amount: 16000, categoryId: 'cat_coffee', note: 'Kopi Kenangan', hour: 8 },
    { day: 2, amount: 89000, categoryId: 'cat_dining', note: 'Makan siang', hour: 13 },
    { day: 3, amount: 194000, categoryId: 'cat_dining', note: 'Makan malam di luar', hour: 20 },
    { day: 4, amount: 139000, categoryId: 'cat_home', note: 'Air PDAM', hour: 11 },
    { day: 5, amount: 146000, categoryId: 'cat_transport', note: 'Bensin', hour: 9 },
    { day: 6, amount: 403000, categoryId: 'cat_groceries', note: 'Indomaret', hour: 16 },
    { day: 7, amount: 265000, categoryId: 'cat_home', note: 'Token listrik', hour: 11 },
    { day: 8, amount: 116000, categoryId: 'cat_dining', note: 'Pesan GoFood', hour: 19 },
    { day: 9, amount: 127000, categoryId: 'cat_dining', note: 'Brunch akhir pekan', hour: 11 },
    { day: 10, amount: 270000, categoryId: 'cat_health', note: 'Fisioterapi', hour: 10 },
    { day: 10, amount: 16000, categoryId: 'cat_coffee', note: 'Kopi Kenangan', hour: 8 },
    { day: 11, amount: 176000, categoryId: 'cat_groceries', note: 'Warung dekat rumah', hour: 18 },
    { day: 12, amount: 346000, categoryId: 'cat_groceries', note: 'Indomaret', hour: 16 },
    { day: 13, amount: 192000, categoryId: 'cat_transport', note: 'Tiket kereta', hour: 13 },
    { day: 14, amount: 111000, categoryId: 'cat_dining', note: 'Ramen', hour: 19 },
    { day: 14, amount: 240000, categoryId: 'cat_home', note: 'Keperluan rumah', hour: 15 },
    { day: 15, amount: 364000, categoryId: 'cat_groceries', note: 'Superindo', hour: 17 },
    { day: 16, amount: 74000, categoryId: 'cat_transport', note: 'Gojek', hour: 22 },
    { day: 17, amount: 264000, categoryId: 'cat_dining', note: 'Minum ulang tahun', hour: 21 },
    { day: 17, amount: 129000, categoryId: 'cat_health', note: 'Apotek', hour: 12 },
    { day: 18, amount: 17000, categoryId: 'cat_coffee', note: 'Kopi Tuku', hour: 9 },
    { day: 19, amount: 165000, categoryId: 'cat_groceries', note: 'Warung dekat rumah', hour: 18 },
    // The rest of the month, so last month reads as a whole month.
    { day: 21, amount: 295000, categoryId: 'cat_groceries', note: 'Indomaret', hour: 16 },
    { day: 23, amount: 218000, categoryId: 'cat_dining', note: 'Makan malam di luar', hour: 20 },
    { day: 25, amount: 16000, categoryId: 'cat_coffee', note: 'Kopi Kenangan', hour: 8 },
    { day: 27, amount: 153000, categoryId: 'cat_transport', note: 'Bensin', hour: 9 },
    { day: 28, amount: 314000, categoryId: 'cat_groceries', note: 'Superindo', hour: 17 },
    { day: 30, amount: 133000, categoryId: 'cat_dining', note: 'Pesan GoFood', hour: 19 },
    // The same standing bills, on the same days.
    { day: 3, amount: 350000, categoryId: 'cat_subs', note: 'Membership gym', recurring: true, hour: 6 },
    { day: 6, amount: 65000, categoryId: 'cat_subs', note: 'Netflix', recurring: true, hour: 6 },
    { day: 8, amount: 350000, categoryId: 'cat_home', note: 'Internet', recurring: true, hour: 6 },
    { day: 12, amount: 55000, categoryId: 'cat_subs', note: 'Spotify', recurring: true, hour: 6 },
    { day: 22, amount: 2800000, categoryId: 'cat_rent', note: 'Sewa kos', recurring: true, hour: 9 },
    { day: 3, amount: 6000000, categoryId: 'cat_payroll', note: 'Gaji', type: 'income', hour: 9 },
    { day: 17, amount: 6000000, categoryId: 'cat_payroll', note: 'Gaji', type: 'income', hour: 9 },
  ] as Row[]
).map((r) => ({ ...r, monthOffset: -1 }));

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
 * the wallet app for transport, the main account for everything else, which is
 * roughly how people actually split it.
 */
function accountForRow(r: Row): string {
  if (r.type === 'income') return 'acc_bank';
  if (r.recurring) return 'acc_bank';
  if (r.categoryId === 'cat_coffee') return 'acc_cash';
  if (r.categoryId === 'cat_transport') return 'acc_wallet';
  // Under a hundred thousand is pocket money in rupiah; anything larger is
  // card or transfer, which keeps the cash account from going implausibly
  // negative across two months of history.
  if (r.amount < 100000) return 'acc_cash';
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
  const values = [10400000, 11200000, 12100000, 12800000, 13700000, 14600000];
  const netWorthHistory = [-6, -5, -4, -3, -2, -1].map((offset, i) => {
    const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    return {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      value: values[i],
    };
  });

  return {
    name: 'Maya',
    monthlyIncome: 12000000,
    savingsGoalPerMonth: 1500000,
    currency: 'IDR',
    darkMode: 'system',
    lang: 'id',
    categories: SEED_CATEGORIES,
    transactions,
    budgets: [
      { categoryId: 'cat_groceries', monthlyLimit: 2600000 },
      { categoryId: 'cat_dining', monthlyLimit: 1400000 },
      { categoryId: 'cat_coffee', monthlyLimit: 200000 },
      { categoryId: 'cat_transport', monthlyLimit: 600000 },
    ],
    netWorthHistory,
    endedSeries: [],
    demoSeeded: true,
    accounts: SEED_ACCOUNTS,
    goals: SEED_GOALS,
    transfers: [
      {
        id: 'tr_seed_1',
        amount: 600000,
        fromAccountId: 'acc_bank',
        toAccountId: 'acc_cash',
        note: 'Uang tunai buat seminggu',
        date: on(base, Math.max(1, Math.min(base.getDate(), 14)), 10, 0),
      },
      {
        id: 'tr_seed_2',
        amount: 1500000,
        fromAccountId: 'acc_bank',
        toAccountId: 'acc_savings',
        note: 'Sisihan bulanan',
        date: on(base, Math.max(1, Math.min(base.getDate(), 3)), 9, 0),
      },
      {
        id: 'tr_seed_3',
        amount: 500000,
        fromAccountId: 'acc_bank',
        toAccountId: 'acc_wallet',
        note: 'Top up',
        date: on(base, Math.max(1, Math.min(base.getDate(), 5)), 8, 0),
      },
      {
        id: 'tr_seed_4',
        amount: 500000,
        fromAccountId: 'acc_bank',
        toAccountId: 'acc_wallet',
        note: 'Top up',
        date: on(base, 5, 8, 0, -1),
      },
    ],
  };
}

/** An account with nothing in it. What "start fresh" clears down to. */
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
      {
        id: 'acc_cash',
        name: 'Tunai',
        kind: 'cash',
        icon: 'Wallet',
        colorKey: 'sand',
        openingBalance: 0,
      },
    ],
    transfers: [],
    goals: [],
  };
}
