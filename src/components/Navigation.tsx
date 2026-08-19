import { useEffect, useRef, type ReactNode } from 'react';
import {
  ChartBar,
  ChartDonut,
  Gear,
  House,
  List,
  MagnifyingGlass,
  Plus,
  Receipt,
  SignIn,
  SignOut,
  Target,
  UserCircle,
  Wallet,
  Cards,
  X,
} from '@phosphor-icons/react';
import { useApp } from '../store/AppContext';
import { signOut } from '../store/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { SyncBadge } from './AccountBits';

export type Tab =
  | 'home'
  | 'transactions'
  | 'accounts'
  | 'budgets'
  | 'goals'
  | 'insights'
  | 'reports'
  | 'settings';

/**
 * Grouped by what the user is trying to do: record something, look after the
 * money, or look back at it. The order is the order of those questions.
 */
export const TAB_GROUPS: { title: string | null; items: Tab[] }[] = [
  { title: null, items: ['home', 'transactions', 'accounts'] },
  { title: 'Plan', items: ['budgets', 'goals'] },
  { title: 'Look back', items: ['insights', 'reports'] },
  { title: null, items: ['settings'] },
];

export const TABS: { id: Tab; label: string; Icon: typeof House }[] = [
  { id: 'home', label: 'Home', Icon: House },
  { id: 'transactions', label: 'Transactions', Icon: Receipt },
  { id: 'accounts', label: 'Accounts', Icon: Cards },
  { id: 'budgets', label: 'Budgets', Icon: Wallet },
  { id: 'goals', label: 'Goals', Icon: Target },
  { id: 'insights', label: 'Insights', Icon: ChartDonut },
  { id: 'reports', label: 'Reports', Icon: ChartBar },
  { id: 'settings', label: 'Settings', Icon: Gear },
];

const BY_ID = new Map(TABS.map((t) => [t.id, t]));
export const tabInfo = (id: Tab) => BY_ID.get(id)!;

export const TAB_LABELS: Record<Tab, string> = {
  home: 'Home',
  transactions: 'Transactions',
  accounts: 'Accounts',
  budgets: 'Budgets',
  goals: 'Savings goals',
  insights: 'Insights',
  reports: 'Reports',
  settings: 'Settings',
};

/* ------------------------------------------------------------ wordmark */

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-brand dark:bg-mint"
        aria-hidden="true"
      >
        {/* A ledger rule and a mark above the line. Not a sparkle. */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M3 11.5h10"
            stroke="currentColor"
            className="text-mint dark:text-brand"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M4.5 8.5 7 5.5l2 2 2.5-3"
            stroke="currentColor"
            className="text-white dark:text-brand"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="font-display text-[1.05rem] font-normal lowercase tracking-[-0.01em] text-ink-900 dark:text-ink-50">
          manimani
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------- sidebar */

/**
 * Desktop navigation.
 *
 * On the left, where every web application of this shape puts it, and where
 * a mouse expects to find it. The mobile drawer opens from the right instead,
 * because that is a thumb decision rather than a pointer one.
 */
export function Sidebar({
  active,
  onChange,
  onAdd,
  onSearch,
  onSignIn,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  onAdd: () => void;
  onSearch: () => void;
  onSignIn: () => void;
}) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-white px-3 py-4 desk:flex dark:bg-night-card"
      style={{ borderRight: '1px solid var(--hairline)' }}
    >
      <div className="px-2 pb-4">
        <Wordmark />
      </div>

      <button type="button" onClick={onAdd} className="btn-primary mb-1.5 min-h-[44px]">
        <Plus size={18} weight="bold" aria-hidden="true" />
        Add transaction
      </button>

      <button
        type="button"
        onClick={onSearch}
        className="press mb-4 flex min-h-[44px] items-center gap-2 rounded-field px-2.5 text-meta text-ink-500 dark:text-ink-400"
        style={{ border: '1px solid var(--hairline)' }}
      >
        <MagnifyingGlass size={16} aria-hidden="true" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="rounded bg-ink-100 px-1.5 py-0.5 text-micro font-medium text-ink-500 dark:bg-night-raised dark:text-ink-400">
          Ctrl K
        </kbd>
      </button>

      <div className="flex-1 overflow-y-auto">
        {TAB_GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
            {group.title && (
              <p className="px-2.5 pb-1 text-micro font-medium uppercase tracking-[0.07em] text-ink-400 dark:text-ink-500">
                {group.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((id) => {
                const { label, Icon } = tabInfo(id);
                const on = active === id;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onChange(id)}
                      aria-current={on ? 'page' : undefined}
                      className={`press flex min-h-[44px] w-full items-center gap-3 rounded-field px-2.5 text-left text-base ${
                        on
                          ? 'bg-ink-100 font-semibold text-brand dark:bg-night-raised dark:text-mint'
                          : 'font-normal text-ink-700 dark:text-ink-300'
                      }`}
                    >
                      <Icon size={20} weight={on ? 'fill' : 'regular'} aria-hidden="true" />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <AccountFooter onSignIn={onSignIn} onSettings={() => onChange('settings')} />
    </nav>
  );
}

/* ------------------------------------------------------ account footer */

function AccountFooter({
  onSignIn,
  onSettings,
}: {
  onSignIn: () => void;
  onSettings: () => void;
}) {
  const { auth, state } = useApp();

  if (!auth.session) {
    return (
      <div className="hairline-t pt-3">
        <p className="px-1 pb-2 text-meta leading-snug text-ink-500 dark:text-ink-400">
          {isSupabaseConfigured
            ? 'Not signed in. This browser is the only copy.'
            : 'Local only. Accounts are not connected yet.'}
        </p>
        <button type="button" onClick={onSignIn} className="btn-quiet w-full justify-start">
          <SignIn size={17} aria-hidden="true" />
          Log in or sign up
        </button>
      </div>
    );
  }

  return (
    <div className="hairline-t pt-3">
      <button
        type="button"
        onClick={onSettings}
        className="press flex w-full items-center gap-2.5 rounded-field p-1.5 text-left"
      >
        <Avatar name={state.name} email={auth.email} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-meta font-medium text-ink-900 dark:text-ink-50">
            {state.name}
          </span>
          <span className="block truncate text-micro text-ink-500 dark:text-ink-400">
            {auth.email}
          </span>
        </span>
      </button>
      <div className="px-1.5 pt-1">
        <SyncBadge />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- avatar */

export function Avatar({
  name,
  email,
  size = 36,
}: {
  name: string;
  email?: string | null;
  size?: number;
}) {
  const letter = (name?.trim()?.[0] ?? email?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-brand font-medium text-white dark:bg-brand-mid"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

/* ------------------------------------------------------------- app bar */

/**
 * Mobile top bar. Brand on the left, the two controls a thumb needs on the
 * right: the profile button, which is a real button now, and the menu that
 * opens the drawer.
 */
export function AppBar({
  onMenu,
  onProfile,
  title,
}: {
  onMenu: () => void;
  onProfile: () => void;
  title: string;
}) {
  const { auth, state } = useApp();

  return (
    <header
      className="safe-t sticky top-0 z-20 flex items-center gap-2 bg-ink-100/95 px-gutter py-2 backdrop-blur-[2px] desk:hidden dark:bg-night-page/95"
      style={{ borderBottom: '1px solid var(--hairline)' }}
    >
      <Wordmark />
      <span className="sr-only">{title}</span>
      <span className="flex-1" />

      <button
        type="button"
        onClick={onProfile}
        aria-label={auth.session ? `Account, signed in as ${auth.email}` : 'Account'}
        className="press flex h-11 w-11 items-center justify-center rounded-full"
      >
        {auth.session ? (
          <Avatar name={state.name} email={auth.email} size={32} />
        ) : (
          <UserCircle size={26} className="text-ink-600 dark:text-ink-300" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        aria-haspopup="dialog"
        className="press flex h-11 w-11 items-center justify-center rounded-full text-ink-700 dark:text-ink-200"
      >
        <List size={24} aria-hidden="true" />
      </button>
    </header>
  );
}

/* -------------------------------------------------------------- drawer */

/**
 * Mobile navigation, sliding in from the right.
 *
 * The right edge is the reachable one for most people holding a phone in one
 * hand, which is why the trigger and the panel both live there rather than in
 * the top left corner convention would otherwise suggest.
 */
export function Drawer({
  open,
  onClose,
  active,
  onChange,
  onSearch,
  onSignIn,
  children,
}: {
  open: boolean;
  onClose: () => void;
  active: Tab;
  onChange: (t: Tab) => void;
  onSearch: () => void;
  onSignIn: () => void;
  children?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const { auth, state } = useApp();

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((n) => n.offsetParent !== null);

    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 desk:hidden">
      <div
        className="animate-scrim-in absolute inset-0 bg-ink-950/55"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="animate-drawer-in absolute inset-y-0 right-0 flex w-[290px] max-w-[86vw] flex-col bg-white px-3 py-3 dark:bg-night-card"
      >
        <div className="flex items-center justify-between pb-2 pl-1.5">
          <Wordmark />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="press flex h-11 w-11 items-center justify-center rounded-full text-ink-600 dark:text-ink-300"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            onClose();
            onSearch();
          }}
          className="press mb-3 flex min-h-[44px] items-center gap-2 rounded-field px-2.5 text-meta text-ink-500 dark:text-ink-400"
          style={{ border: '1px solid var(--hairline)' }}
        >
          <MagnifyingGlass size={16} aria-hidden="true" />
          Search transactions
        </button>

        <div className="flex-1 overflow-y-auto">
          {TAB_GROUPS.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
              {group.title && (
                <p className="px-2.5 pb-1 text-micro font-medium uppercase tracking-[0.07em] text-ink-400 dark:text-ink-500">
                  {group.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((id) => {
                  const { label, Icon } = tabInfo(id);
                  const on = active === id;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(id);
                          onClose();
                        }}
                        aria-current={on ? 'page' : undefined}
                        className={`press flex min-h-[48px] w-full items-center gap-3 rounded-field px-2.5 text-left text-base ${
                          on
                            ? 'bg-ink-100 font-semibold text-brand dark:bg-night-raised dark:text-mint'
                            : 'font-normal text-ink-700 dark:text-ink-300'
                        }`}
                      >
                        <Icon size={20} weight={on ? 'fill' : 'regular'} aria-hidden="true" />
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {children}

        <div className="hairline-t mt-2 pt-3">
          {auth.session ? (
            <>
              <div className="flex items-center gap-2.5 px-1.5 pb-2">
                <Avatar name={state.name} email={auth.email} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-meta font-medium text-ink-900 dark:text-ink-50">
                    {state.name}
                  </span>
                  <span className="block truncate text-micro text-ink-500 dark:text-ink-400">
                    {auth.email}
                  </span>
                </span>
              </div>
              <div className="px-1.5 pb-2">
                <SyncBadge />
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="btn-quiet w-full justify-start"
              >
                <SignOut size={17} aria-hidden="true" />
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                onSignIn();
              }}
              className="btn-primary"
            >
              <SignIn size={17} aria-hidden="true" />
              Log in or sign up
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- floating add */

/** The one control that stays put on mobile, in the corner a thumb owns. */
export function FloatingAdd({ onAdd, pulse }: { onAdd: () => void; pulse?: boolean }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label="Add a transaction"
      className={`press fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-gutter z-30 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-brand text-white desk:hidden dark:bg-mint dark:text-brand ${
        pulse ? 'animate-pulse-once' : ''
      }`}
      style={{ boxShadow: '0 2px 10px rgb(14 58 47 / 0.28)' }}
    >
      <Plus size={26} weight="bold" aria-hidden="true" />
    </button>
  );
}
