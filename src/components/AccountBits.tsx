import {
  CloudArrowUp,
  CloudCheck,
  CloudSlash,
  SignIn,
  SignOut,
  UserCircle,
  WarningCircle,
} from '@phosphor-icons/react';
import { useApp } from '../store/AppContext';
import { signOut } from '../store/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { money } from '../lib/format';
import { Sheet } from './primitives';
import type { SyncStatus } from '../lib/sync';

/* --------------------------------------------------------- sync badge */

const SYNC_COPY: Record<SyncStatus, { label: string; Icon: typeof CloudCheck; tone: string }> = {
  idle: { label: 'Saved', Icon: CloudCheck, tone: 'text-brand-mid dark:text-mint' },
  syncing: { label: 'Saving', Icon: CloudArrowUp, tone: 'text-ink-500 dark:text-ink-400' },
  offline: { label: 'Offline, will save later', Icon: CloudSlash, tone: 'text-amber-text dark:text-[#F0C176]' },
  error: { label: 'Some changes did not save', Icon: WarningCircle, tone: 'text-coral-text dark:text-[#F0B49B]' },
};

/**
 * Where the data currently stands.
 *
 * Deliberately quiet: it only ever occupies one line, and "Saved" is the
 * resting state rather than something that flashes. A money app that looks
 * anxious makes its user anxious.
 */
export function SyncBadge() {
  const { auth, syncStatus } = useApp();
  if (!auth.session) return null;

  const { label, Icon, tone } = SYNC_COPY[syncStatus];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-micro ${tone}`}
      role="status"
      aria-live="polite"
    >
      <Icon size={13} weight="regular" aria-hidden="true" />
      {label}
    </span>
  );
}

/* ------------------------------------------------------ account panel */

export function AccountPanel({ onSignIn }: { onSignIn: () => void }) {
  const { auth, state, loadingAccount, accountError, retryAccountLoad } = useApp();

  if (auth.session) {
    return (
      <div className="card">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white dark:bg-brand-mid"
            aria-hidden="true"
          >
            <UserCircle size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium text-ink-900 dark:text-ink-50">
              {auth.email}
            </p>
            <p className="mt-0.5">
              <SyncBadge />
            </p>
          </div>
        </div>

        {accountError && (
          <div className="mt-3 rounded-field bg-coral-soft px-3 py-2.5 dark:bg-[#33221B]">
            <p className="text-meta leading-snug text-coral-text dark:text-[#F0B49B]">
              {accountError}
            </p>
            <button
              type="button"
              onClick={retryAccountLoad}
              className="press mt-2 min-h-[44px] text-meta font-semibold text-coral-text underline dark:text-[#F0B49B]"
            >
              Try loading again
            </button>
          </div>
        )}

        <p className="mt-3 text-meta leading-snug text-ink-500 dark:text-ink-400">
          {loadingAccount
            ? 'Loading your account.'
            : `${state.transactions.length} transactions synced to this account. Sign in on any device with the same address to pick up where you left off.`}
        </p>

        <button
          type="button"
          onClick={() => void signOut()}
          className="btn-quiet mt-3 w-full justify-start"
        >
          <SignOut size={18} aria-hidden="true" />
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-base font-medium text-ink-900 dark:text-ink-50">
        {isSupabaseConfigured ? 'Keep this across devices' : 'Running without an account'}
      </h2>
      <p className="mt-1.5 text-meta leading-snug text-ink-600 dark:text-ink-300">
        {isSupabaseConfigured
          ? 'Right now everything lives in this browser, and clearing site data would take it with it. An account keeps your months on the server and lets you open them on your phone as well as here.'
          : 'This deployment has no backend connected, so there is nothing to sign in to. Everything you record stays in this browser. Use Export to keep a copy.'}
      </p>
      <button type="button" onClick={onSignIn} className="btn-primary mt-4">
        <SignIn size={18} aria-hidden="true" />
        {isSupabaseConfigured ? 'Sign in or create an account' : 'Why is this off?'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------ import prompt */

/**
 * Shown once, when signing into an empty account while the anonymous copy
 * still holds real work. Declining is not destructive: the local copy stays
 * where it is and reappears on sign out.
 */
export function ImportPrompt() {
  const { pendingImport, resolvePendingImport, state } = useApp();
  if (!pendingImport) return null;

  const count = pendingImport.transactions.length;
  const spend = pendingImport.transactions
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  return (
    <Sheet
      open
      onClose={() => resolvePendingImport(false)}
      title="Bring your data across?"
      description="Your new account is empty, but this browser has records in it."
    >
      <div className="pb-6 pt-1">
        <div
          className="rounded-field bg-ink-50 px-3.5 py-3 dark:bg-night-raised"
          style={{ border: '1px solid var(--hairline)' }}
        >
          <p className="text-base font-medium text-ink-900 dark:text-ink-50">
            {count} transactions
          </p>
          <p className="mt-0.5 text-meta text-ink-500 dark:text-ink-400">
            {money(spend, state.currency)} of spending, plus your categories and budgets.
          </p>
        </div>

        <p className="mt-3 text-meta leading-snug text-ink-600 dark:text-ink-300">
          Copying this into your account replaces what is there, which is nothing at the
          moment. If some of it is demo data you would rather not keep, skip this and start
          clean. Nothing is deleted either way.
        </p>

        <div className="mt-4 grid gap-2.5">
          <button
            type="button"
            data-autofocus
            onClick={() => resolvePendingImport(true)}
            className="btn-primary"
          >
            Copy it into my account
          </button>
          <button
            type="button"
            onClick={() => resolvePendingImport(false)}
            className="btn-quiet w-full"
          >
            Start clean
          </button>
        </div>
      </div>
    </Sheet>
  );
}
