import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cards,
  ChartBar,
  ChartDonut,
  FileArrowUp,
  Gear,
  House,
  Moon,
  Plus,
  Receipt,
  SignIn,
  SignOut,
  Sun,
  Target,
  Trash,
  Wallet,
  type Icon,
} from '@phosphor-icons/react';
import type { Tab } from './Navigation';
import { useApp } from '../store/AppContext';
import { signOut } from '../store/auth';
import { relativeTime } from '../lib/date';
import { signedMoney } from '../lib/format';
import { filterTransactions, EMPTY_FILTER } from '../lib/filter';
import { CategoryTile } from './primitives';

/**
 * Command palette.
 *
 * Ctrl or Cmd K. Types anything: a screen name, an action, or a merchant, and
 * transactions are searched alongside the commands rather than behind a mode
 * switch. This is the single cheapest thing that makes a web app feel built
 * for a keyboard rather than ported from a phone.
 */

interface Command {
  id: string;
  label: string;
  hint?: string;
  Icon: Icon;
  keywords: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onAdd,
  onImport,
  onSignIn,
  onEdit,
  onStartFresh,
  dark,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (t: Tab) => void;
  onAdd: () => void;
  onImport: () => void;
  onSignIn: () => void;
  onEdit: (id: string) => void;
  onStartFresh: () => void;
  dark: boolean;
}) {
  const { state, dispatch, auth, today, categoryById } = useApp();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setCursor(0);
    const t = window.setTimeout(() => input.current?.focus(), 10);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
      restoreTo.current?.focus?.();
    };
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (t: Tab) => () => {
      onNavigate(t);
      onClose();
    };
    const list: Command[] = [
      { id: 'new', label: 'Add a transaction', hint: 'N', Icon: Plus, keywords: 'new add spend expense income record', run: () => { onAdd(); onClose(); } },
      { id: 'home', label: 'Go to Home', Icon: House, keywords: 'home safe to spend today dashboard', run: go('home') },
      { id: 'tx', label: 'Go to Transactions', Icon: Receipt, keywords: 'transactions list history search all', run: go('transactions') },
      { id: 'accounts', label: 'Go to Accounts', Icon: Cards, keywords: 'accounts wallet balance cash bank ewallet saldo total money', run: go('accounts') },
      { id: 'goals', label: 'Go to Savings goals', Icon: Target, keywords: 'goals savings target progress tabungan', run: go('goals') },
      { id: 'reports', label: 'Go to Reports', Icon: ChartBar, keywords: 'reports daily weekly monthly yearly income expense laporan', run: go('reports') },
      { id: 'insights', label: 'Go to Insights', Icon: ChartDonut, keywords: 'insights charts categories subscriptions net worth', run: go('insights') },
      { id: 'budgets', label: 'Go to Budgets', Icon: Wallet, keywords: 'budgets limits caps', run: go('budgets') },
      { id: 'settings', label: 'Go to Settings', Icon: Gear, keywords: 'settings more account income currency theme categories', run: go('settings') },
      { id: 'import', label: 'Import a CSV from your bank', Icon: FileArrowUp, keywords: 'import csv bank upload statement file', run: () => { onImport(); onClose(); } },
      { id: 'fresh', label: 'Delete everything and start fresh', Icon: Trash, keywords: 'reset delete clear sample demo data fresh start over wipe empty', run: () => { onStartFresh(); onClose(); } },
      {
        id: 'theme',
        label: dark ? 'Switch to light mode' : 'Switch to dark mode',
        Icon: dark ? Sun : Moon,
        keywords: 'theme dark light appearance mode',
        run: () => {
          dispatch({ type: 'settings/theme', value: dark ? 'light' : 'dark' });
          onClose();
        },
      },
    ];

    list.push(
      auth.session
        ? { id: 'signout', label: 'Sign out', Icon: SignOut, keywords: 'sign out log out leave account', run: () => { void signOut(); onClose(); } }
        : { id: 'signin', label: 'Log in or sign up', Icon: SignIn, keywords: 'sign in log in register account create', run: () => { onSignIn(); onClose(); } },
    );

    return list;
  }, [onNavigate, onClose, onAdd, onImport, onSignIn, onStartFresh, dispatch, dark, auth.session]);

  const q = query.trim().toLowerCase();

  const matchedCommands = useMemo(
    () =>
      q
        ? commands.filter(
            (c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q),
          )
        : commands,
    [commands, q],
  );

  const matchedTransactions = useMemo(() => {
    if (q.length < 2) return [];
    return filterTransactions(state.transactions, state.categories, {
      ...EMPTY_FILTER,
      text: q,
    }).slice(0, 6);
  }, [q, state.transactions, state.categories]);

  const total = matchedCommands.length + matchedTransactions.length;

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const runAt = (i: number) => {
    if (i < matchedCommands.length) {
      matchedCommands[i].run();
      return;
    }
    const tx = matchedTransactions[i - matchedCommands.length];
    if (tx) {
      onEdit(tx.id);
      onClose();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (total === 0 ? 0 : (c + 1) % total));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (total === 0 ? 0 : (c - 1 + total) % total));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(cursor);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-gutter pt-[12vh]">
      <div
        className="animate-scrim-in absolute inset-0 bg-ink-950/55"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="animate-pop-in relative flex max-h-[70vh] w-full max-w-[560px] flex-col overflow-hidden rounded-card bg-white dark:bg-night-card"
        style={{ border: '1px solid var(--hairline)' }}
      >
        <div className="hairline-b px-3 py-2">
          <label htmlFor="palette-input" className="sr-only">
            Search commands and transactions
          </label>
          <input
            id="palette-input"
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a screen, run a command, or find a transaction"
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={total ? `palette-opt-${cursor}` : undefined}
            className="w-full bg-transparent px-1 py-2 text-base outline-none placeholder:text-ink-400 dark:placeholder:text-ink-500"
          />
        </div>

        <ul id="palette-list" ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {total === 0 && (
            <li className="px-3 py-6 text-center text-meta text-ink-500 dark:text-ink-400">
              Nothing matches {'"'}
              {query}
              {'"'}.
            </li>
          )}

          {matchedCommands.map((c, i) => (
            <li key={c.id} id={`palette-opt-${i}`} role="option" aria-selected={cursor === i}>
              <button
                type="button"
                data-active={cursor === i}
                onMouseEnter={() => setCursor(i)}
                onClick={() => runAt(i)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-field px-2.5 text-left text-base ${
                  cursor === i
                    ? 'bg-ink-100 dark:bg-night-raised'
                    : 'bg-transparent'
                }`}
              >
                <c.Icon size={18} className="shrink-0 text-ink-500 dark:text-ink-400" aria-hidden="true" />
                <span className="flex-1 truncate text-ink-900 dark:text-ink-50">{c.label}</span>
                {c.hint && (
                  <kbd className="rounded bg-ink-100 px-1.5 py-0.5 text-micro text-ink-500 dark:bg-night-page dark:text-ink-400">
                    {c.hint}
                  </kbd>
                )}
              </button>
            </li>
          ))}

          {matchedTransactions.length > 0 && (
            <li className="px-2.5 pb-1 pt-3 text-micro font-medium uppercase tracking-[0.07em] text-ink-500 dark:text-ink-400">
              Transactions
            </li>
          )}

          {matchedTransactions.map((tx, j) => {
            const i = matchedCommands.length + j;
            const cat = categoryById(tx.categoryId);
            return (
              <li key={tx.id} id={`palette-opt-${i}`} role="option" aria-selected={cursor === i}>
                <button
                  type="button"
                  data-active={cursor === i}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => runAt(i)}
                  className={`flex min-h-[48px] w-full items-center gap-3 rounded-field px-2.5 text-left ${
                    cursor === i ? 'bg-ink-100 dark:bg-night-raised' : ''
                  }`}
                >
                  <CategoryTile category={cat} dark={dark} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base text-ink-900 dark:text-ink-50">
                      {tx.note || cat?.name || 'Transaction'}
                    </span>
                    <span className="block truncate text-meta text-ink-500 dark:text-ink-400">
                      {cat?.name} · {relativeTime(tx.date, today)}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-meta font-medium text-ink-900 dark:text-ink-50">
                    {signedMoney(tx.amount, tx.type, state.currency)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="hairline-t flex items-center gap-3 px-3 py-2 text-micro text-ink-500 dark:text-ink-400">
          <span>
            <kbd className="rounded bg-ink-100 px-1 dark:bg-night-raised">up</kbd>{' '}
            <kbd className="rounded bg-ink-100 px-1 dark:bg-night-raised">down</kbd> to move
          </span>
          <span>
            <kbd className="rounded bg-ink-100 px-1 dark:bg-night-raised">enter</kbd> to run
          </span>
          <span>
            <kbd className="rounded bg-ink-100 px-1 dark:bg-night-raised">esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
