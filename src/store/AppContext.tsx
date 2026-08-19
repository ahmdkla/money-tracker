import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppState, Category } from '../types';
import { reducer, type Action } from './reducer';
import { useAuth, type AuthState } from './auth';
import { loadState, saveState } from '../lib/storage';
import { createSeedState } from '../lib/seed';
import { computeSafeToSpend, type SafeToSpend } from '../lib/safeToSpend';
import { buildForecast, type Forecast } from '../lib/forecast';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { loadRemoteState, pushAction, replaceRemoteState } from '../lib/remote';
import { SyncQueue, type SyncStatus } from '../lib/sync';

interface AppContextValue {
  state: AppState;
  dispatch: (action: Action) => void;
  /** Recomputed whenever state or the calendar day changes. */
  safe: SafeToSpend;
  forecast: Forecast;
  today: Date;
  categoryById: (id: string) => Category | undefined;
  /** True once the first paint has happened; charts wait for it. */
  ready: boolean;
  auth: AuthState;
  syncStatus: SyncStatus;
  /** Set when signing in over an empty account with local work to rescue. */
  pendingImport: AppState | null;
  resolvePendingImport: (accept: boolean) => void;
  /** True while the account is being pulled down. */
  loadingAccount: boolean;
  accountError: string | null;
  retryAccountLoad: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function initLocal(): AppState {
  return loadState() ?? createSeedState();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, rawDispatch] = useReducer(reducer, undefined, initLocal);
  const [today, setToday] = useState(() => new Date());
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pendingImport, setPendingImport] = useState<AppState | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // The reducer is pure, so running it here gives exactly what the store is
  // about to hold. It is kept in a ref and updated synchronously, so two
  // dispatches in the same tick still queue the right rows.
  const latest = useRef(state);
  const queue = useRef<SyncQueue | null>(null);
  // Resolved once the lazy client lands. Only ever read after sign in, which
  // cannot happen before the client exists.
  const db = useRef<SupabaseClient | null>(null);
  const userId = auth.userId;

  /* ---------------------------------------------------------- dispatch */

  const dispatch = useCallback(
    (action: Action) => {
      const previous = latest.current;
      const next = reducer(previous, action);
      latest.current = next;
      rawDispatch(action);

      const client = db.current;
      const q = queue.current;
      if (!client || !userId || !q) return;

      // Optimistic: the UI has already moved. The write follows behind it.
      q.push(action.type, () => pushAction(client, userId, action, next, previous));
    },
    [userId],
  );

  /* ------------------------------------------------- local persistence */

  useEffect(() => {
    latest.current = state;
    // Cached per account, so a reload repaints before the network answers.
    saveState(state, userId);
  }, [state, userId]);

  useEffect(() => {
    setReady(true);
  }, []);

  /* ------------------------------------------------------ account load */

  useEffect(() => {
    queue.current?.stop();
    queue.current = null;
    setSyncStatus('idle');

    if (!isSupabaseConfigured || !userId) {
      // Signed out. Fall back to whatever the anonymous copy holds, so signing
      // out returns you to the demo rather than to someone else's numbers.
      if (auth.ready) {
        const local = loadState() ?? createSeedState();
        latest.current = local;
        rawDispatch({ type: 'data/replace', state: local });
      }
      return;
    }

    const q = new SyncQueue();
    queue.current = q;
    const unsubscribe = q.subscribe((s) => setSyncStatus(s));

    let cancelled = false;
    setLoadingAccount(true);
    setAccountError(null);

    // Repaint from this account's cache first, so coming back feels instant.
    const cached = loadState(userId);
    if (cached) {
      latest.current = cached;
      rawDispatch({ type: 'data/replace', state: cached });
    }

    void getSupabase()
      .then(async (client) => {
        if (!client) throw new Error('The backend could not be reached.');
        if (cancelled) return;
        db.current = client;

        const remote = await loadRemoteState(client, userId);
        if (cancelled) return;
        latest.current = remote;
        rawDispatch({ type: 'data/replace', state: remote });

        // A new account holds its starting categories and nothing else. If
        // there is real work in the anonymous copy, offer to carry it across
        // rather than silently stranding it.
        const anon = loadState();
        if (remote.transactions.length === 0 && anon && anon.transactions.length > 0) {
          setPendingImport(anon);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAccountError(err instanceof Error ? err.message : 'Could not load your account.');
      })
      .finally(() => {
        if (!cancelled) setLoadingAccount(false);
      });

    return () => {
      cancelled = true;
      unsubscribe();
      q.stop();
    };
  }, [userId, auth.ready, reloadNonce]);

  const retryAccountLoad = useCallback(() => setReloadNonce((n) => n + 1), []);

  const resolvePendingImport = useCallback(
    (accept: boolean) => {
      const incoming = pendingImport;
      setPendingImport(null);
      const client = db.current;
      if (!accept || !incoming || !client || !userId) return;

      // Keep the account's own appearance choice, take the local records.
      const merged: AppState = { ...incoming, darkMode: latest.current.darkMode };
      latest.current = merged;
      rawDispatch({ type: 'data/replace', state: merged });
      queue.current?.push('import-local', () => replaceRemoteState(client, userId, merged));
    },
    [pendingImport, userId],
  );

  /* ---------------------------------------------------------- the date */

  useEffect(() => {
    const refresh = () => {
      const now = new Date();
      setToday((prev) => (prev.toDateString() === now.toDateString() ? prev : now));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, []);

  /* ------------------------------------------------------- derivations */

  const safe = useMemo(() => computeSafeToSpend(state, today), [state, today]);
  const forecast = useMemo(() => buildForecast(safe, today), [safe, today]);

  const categoryIndex = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of state.categories) map.set(c.id, c);
    return map;
  }, [state.categories]);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      dispatch,
      safe,
      forecast,
      today,
      ready,
      auth,
      syncStatus,
      pendingImport,
      resolvePendingImport,
      loadingAccount,
      accountError,
      retryAccountLoad,
      categoryById: (id: string) => categoryIndex.get(id),
    }),
    [
      state,
      dispatch,
      safe,
      forecast,
      today,
      ready,
      auth,
      syncStatus,
      pendingImport,
      resolvePendingImport,
      loadingAccount,
      accountError,
      retryAccountLoad,
      categoryIndex,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
