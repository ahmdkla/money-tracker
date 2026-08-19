import type { AppState } from '../types';

const BASE_KEY = 'manimani.state.v1';

/** What the key was before the app was renamed. Read once, then migrated. */
const LEGACY_BASE_KEY = 'clearing.state.v1';

/**
 * Anonymous work lives under the bare key; a signed-in account gets its own,
 * so two people sharing a laptop never see each other's money, and signing
 * back in repaints instantly from cache before the server answers.
 */
export function storageKey(userId?: string | null): string {
  return userId ? `${BASE_KEY}.${userId}` : BASE_KEY;
}

export const STORAGE_KEY = BASE_KEY;

/**
 * Fingerprints of the sample month.
 *
 * `demoSeeded` was added after the app had already been in use, so anybody
 * who had the demo sitting in their browser loaded it back with the flag
 * missing, which hid the very banner and button that exist to clear it out.
 * When the field is absent the state is examined instead of assumed.
 *
 * Ids first, because they are conclusive: nothing but the seed creates a
 * transfer called `tr_seed_1` or a goal called `goal_buffer`. Notes are the
 * fallback for saves old enough to predate accounts, and three have to match
 * before it counts, so somebody who genuinely shops at one of these is not
 * told their own records are a demo.
 */
const SEED_ONLY_IDS = ['acc_wallet', 'acc_savings', 'goal_buffer', 'goal_trip'];

const SEED_NOTES = [
  'Trader Joes', 'Blue Bottle', 'Dinner with Sam', 'Ramen with Jo',
  'Physio session', 'Dentist copay', 'New desk chair', 'Weekend brunch',
  'Corner market', 'Cafe Lune', 'Birthday dinner', 'Train tickets',
  'Gym membership', 'Whole Foods',
];

function looksLikeSeed(s: Partial<AppState>): boolean {
  const transactions = Array.isArray(s.transactions) ? s.transactions : [];
  if (transactions.length === 0) return false;

  const transfers = Array.isArray(s.transfers) ? s.transfers : [];
  if (transfers.some((t) => typeof t?.id === 'string' && t.id.startsWith('tr_seed_'))) {
    return true;
  }

  const ids = new Set<unknown>([
    ...(Array.isArray(s.accounts) ? s.accounts : []).map((a) => a?.id),
    ...(Array.isArray(s.goals) ? s.goals : []).map((g) => g?.id),
  ]);
  if (SEED_ONLY_IDS.some((id) => ids.has(id))) return true;

  const notes = new Set(transactions.map((t) => t?.note).filter(Boolean));
  return SEED_NOTES.filter((n) => notes.has(n)).length >= 3;
}

/** Narrow an unknown blob to AppState, or reject it. Used for load and import. */
export function validateState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<AppState>;

  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const str = (v: unknown) => typeof v === 'string' && v.length > 0;

  if (!Array.isArray(s.transactions) || !Array.isArray(s.categories)) return null;
  if (!num(s.monthlyIncome) || !num(s.savingsGoalPerMonth)) return null;
  if (!str(s.currency)) return null;

  const categoryOk = s.categories.every(
    (c) => str(c?.id) && str(c?.name) && str(c?.icon) && str(c?.colorKey) && str(c?.kind),
  );
  const txOk = s.transactions.every(
    (t) => str(t?.id) && num(t?.amount) && str(t?.type) && str(t?.categoryId) && str(t?.date),
  );
  if (!categoryOk || !txOk) return null;

  return {
    name: str(s.name) ? s.name! : 'there',
    monthlyIncome: s.monthlyIncome!,
    savingsGoalPerMonth: s.savingsGoalPerMonth!,
    currency: s.currency!,
    darkMode:
      s.darkMode === 'light' || s.darkMode === 'dark' || s.darkMode === 'system'
        ? s.darkMode
        : 'system',
    transactions: s.transactions,
    categories: s.categories,
    budgets: Array.isArray(s.budgets) ? s.budgets : [],
    netWorthHistory: Array.isArray(s.netWorthHistory) ? s.netWorthHistory : [],
    // Added after the first release, so a file exported before it still loads.
    endedSeries: Array.isArray(s.endedSeries)
      ? s.endedSeries.filter((k): k is string => typeof k === 'string')
      : [],
    // An explicit false is a decision the user made, and is left alone. Only
    // a missing field gets inferred.
    demoSeeded: s.demoSeeded === true || (s.demoSeeded === undefined && looksLikeSeed(s)),
    accounts: Array.isArray(s.accounts) ? s.accounts : [],
    transfers: Array.isArray(s.transfers) ? s.transfers : [],
    goals: Array.isArray(s.goals) ? s.goals : [],
  };
}

export function loadState(userId?: string | null): AppState | null {
  try {
    const key = storageKey(userId);
    let raw = localStorage.getItem(key);

    // The app used to be called Clearing. Anyone who used it then still has
    // their months under the old key, and a rename is no reason to lose them.
    if (!raw) {
      const legacy = userId ? `${LEGACY_BASE_KEY}.${userId}` : LEGACY_BASE_KEY;
      raw = localStorage.getItem(legacy);
      if (raw) {
        localStorage.setItem(key, raw);
        localStorage.removeItem(legacy);
      }
    }

    if (!raw) return null;
    return validateState(JSON.parse(raw));
  } catch {
    // Corrupt or unreadable storage should never be fatal: fall back to seed.
    return null;
  }
}

export function saveState(state: AppState, userId?: string | null): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // Private mode or a full quota. The session still works, it just will not
    // survive a refresh, and that is not worth interrupting the user over.
  }
}

export function clearState(userId?: string | null): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* nothing useful to do */
  }
}

export function exportState(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Local date, not UTC. Exporting at one in the morning should not produce a
  // file stamped with yesterday.
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
  a.download = `manimani-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a beat to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
