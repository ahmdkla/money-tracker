import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Transaction } from './types';
import { AppProvider, useApp } from './store/AppContext';
import { useTheme } from './store/theme';
import {
  AppBar,
  Drawer,
  FloatingAdd,
  Sidebar,
  TAB_LABELS,
  type Tab,
} from './components/Navigation';
import { TransactionSheet } from './components/TransactionSheet';
import { ToastStack, type Toast } from './components/primitives';
import { AuthSheet } from './components/AuthSheet';
import { ImportPrompt } from './components/AccountBits';
import { ResetBalloon, StartFreshSheet } from './components/StartFresh';
import { CommandPalette } from './components/CommandPalette';
import { Home } from './screens/Home';
import { expandRecurring } from './lib/recurringEngine';

/*
 * Home ships in the first chunk because it is why the app opens. Everything
 * else is at least one interaction away, which is plenty of time to fetch it.
 */
const Transactions = lazy(() =>
  import('./screens/Transactions').then((m) => ({ default: m.Transactions })),
);
const Insights = lazy(() => import('./screens/Insights').then((m) => ({ default: m.Insights })));
const Budgets = lazy(() => import('./screens/Budgets').then((m) => ({ default: m.Budgets })));
const More = lazy(() => import('./screens/More').then((m) => ({ default: m.More })));
const Accounts = lazy(() => import('./screens/Accounts').then((m) => ({ default: m.Accounts })));
const Goals = lazy(() => import('./screens/Goals').then((m) => ({ default: m.Goals })));
const Reports = lazy(() => import('./screens/Reports').then((m) => ({ default: m.Reports })));
const CsvImport = lazy(() =>
  import('./components/CsvImport').then((m) => ({ default: m.CsvImport })),
);

function ScreenSkeleton() {
  return (
    <div className="space-y-3 px-gutter pt-4" aria-hidden="true">
      <div className="skeleton h-8 w-40" />
      <div className="skeleton h-44 w-full" />
      <div className="skeleton h-28 w-full" />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { state, dispatch, today, auth } = useApp();
  const dark = useTheme(state.darkMode);

  const [tab, setTab] = useState<Tab>('home');
  const [txSheet, setTxSheet] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [focusSearchToken, setFocusSearchToken] = useState(0);
  const [freshOpen, setFreshOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const main = useRef<HTMLElement>(null);

  const notify = useCallback((message: string, tone: Toast['tone'] = 'neutral') => {
    const id = toastId.current++;
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const openAdd = useCallback(() => {
    setEditing(null);
    setTxSheet(true);
  }, []);

  const openEdit = useCallback((tx: Transaction) => {
    setEditing(tx);
    setTxSheet(true);
  }, []);

  const editById = useCallback(
    (id: string) => {
      const tx = state.transactions.find((t) => t.id === id);
      if (tx) openEdit(tx);
    },
    [state.transactions, openEdit],
  );

  /**
   * Changing screen is a navigation, so focus moves to the top of the new
   * view. Without it a screen reader stays parked on the sidebar and never
   * hears that anything happened.
   */
  const changeTab = useCallback((next: Tab) => {
    setTab(next);
    window.scrollTo({ top: 0 });
    window.requestAnimationFrame(() => main.current?.focus());
  }, []);

  /* ------------------------------------------------- recurring bills */

  // Fixed bills are meant to repeat. Run the expansion once the account has
  // settled, and again whenever the date changes under a long-lived tab.
  const expandedFor = useRef('');
  useEffect(() => {
    if (!auth.ready) return;
    const stamp = `${auth.userId ?? 'local'}:${today.toDateString()}:${state.transactions.length}`;
    if (expandedFor.current === stamp) return;

    const { created } = expandRecurring(state, today);
    if (created.length === 0) {
      expandedFor.current = stamp;
      return;
    }
    dispatch({ type: 'tx/add-many', transactions: created });
    // The stamp deliberately is not set here: the next render sees the new
    // length, recomputes, and finds nothing left to create.
  }, [state, today, dispatch, auth.ready, auth.userId]);

  /* ------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Ctrl+K works everywhere, including inside a field.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openAdd();
      } else if (e.key === '/') {
        e.preventDefault();
        changeTab('transactions');
        // The screen claims focus itself once its chunk has loaded.
        setFocusSearchToken((t) => t + 1);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openAdd, changeTab]);

  /* ---------------------------------------------------------- screen */

  const screen = useMemo(() => {
    switch (tab) {
      case 'home':
        return (
          <Home
            dark={dark}
            onSeeAll={() => changeTab('transactions')}
            onSelectTransaction={openEdit}
            onAdd={openAdd}
            onStartFresh={() => setFreshOpen(true)}
          />
        );
      case 'transactions':
        return (
          <Transactions
            dark={dark}
            onSelect={openEdit}
            onImport={() => setCsvOpen(true)}
            focusSearchToken={focusSearchToken}
          />
        );
      case 'accounts':
        return <Accounts dark={dark} />;
      case 'goals':
        return <Goals dark={dark} />;
      case 'reports':
        return <Reports dark={dark} onSelectTransaction={openEdit} />;
      case 'insights':
        return <Insights dark={dark} onSelectTransaction={openEdit} />;
      case 'budgets':
        return <Budgets dark={dark} onAddTransaction={openAdd} />;
      case 'settings':
        return (
          <More
            dark={dark}
            notify={notify}
            onSignIn={() => setAuthOpen(true)}
            onImportCsv={() => setCsvOpen(true)}
            onStartFresh={() => setFreshOpen(true)}
          />
        );
    }
  }, [tab, dark, openEdit, openAdd, notify, changeTab, focusSearchToken]);

  const empty = state.transactions.length === 0;

  return (
    <div className="min-h-dvh bg-ink-100 dark:bg-night-page">
      <a
        href="#main"
        className="sr-only-focusable fixed left-3 top-3 z-[70] rounded-field bg-brand px-4 py-2.5 text-meta font-medium text-white"
      >
        Skip to main content
      </a>

      <Sidebar
        active={tab}
        onChange={changeTab}
        onAdd={openAdd}
        onSearch={() => setPaletteOpen(true)}
        onSignIn={() => setAuthOpen(true)}
      />

      <AppBar
        title={TAB_LABELS[tab]}
        onMenu={() => setDrawerOpen(true)}
        onProfile={() => {
          // The profile control is a real button now. Signed in it goes to the
          // account; signed out it is the fastest route to creating one.
          if (auth.session) changeTab('settings');
          else setAuthOpen(true);
        }}
      />

      {/* The sidebar is fixed, so the content is inset rather than wrapped. */}
      <div className="desk:pl-[248px]">
        <main
          id="main"
          ref={main}
          tabIndex={-1}
          aria-label={TAB_LABELS[tab]}
          className="mx-auto min-h-dvh w-full max-w-app outline-none desk:max-w-shell desk:px-4"
        >
          <Suspense fallback={<ScreenSkeleton />}>{screen}</Suspense>
        </main>
      </div>

      <FloatingAdd onAdd={openAdd} pulse={empty} />
      <ResetBalloon onStartFresh={() => setFreshOpen(true)} />

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        active={tab}
        onChange={changeTab}
        onSearch={() => setPaletteOpen(true)}
        onSignIn={() => setAuthOpen(true)}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={changeTab}
        onAdd={openAdd}
        onImport={() => setCsvOpen(true)}
        onSignIn={() => setAuthOpen(true)}
        onEdit={editById}
        onStartFresh={() => setFreshOpen(true)}
        dark={dark}
      />

      <TransactionSheet
        open={txSheet}
        onClose={() => setTxSheet(false)}
        editing={editing}
        dark={dark}
        onSaved={(m) => notify(m)}
        onDeleted={() => notify('Deleted')}
      />

      <Suspense fallback={null}>
        {csvOpen && (
          <CsvImport
            open={csvOpen}
            onClose={() => setCsvOpen(false)}
            dark={dark}
            notify={notify}
          />
        )}
      </Suspense>

      <StartFreshSheet
        open={freshOpen}
        onClose={() => setFreshOpen(false)}
        onDone={(m) => notify(m)}
      />

      <AuthSheet open={authOpen} onClose={() => setAuthOpen(false)} />
      <ImportPrompt />

      <ToastStack toasts={toasts} />
    </div>
  );
}
