import { useMemo, useState } from 'react';
import { ArrowRight, ArrowsLeftRight, Plus, Trash } from '@phosphor-icons/react';
import type { Account, AccountKind } from '../types';
import { useApp } from '../store/AppContext';
import {
  ACCOUNT_KINDS,
  ACCOUNT_KIND_KEY,
  accountBalances,
  totalBalance,
  validateTransfer,
} from '../lib/accounts';
import { money, moneyWhole } from '../lib/format';
import { relativeTime } from '../lib/date';
import { COLOR_KEYS, tints } from '../lib/palette';
import { iconFor } from '../components/icons';
import { SectionHeader, Sheet } from '../components/primitives';

/**
 * Where the money actually is.
 *
 * Categories answer what money was for; this answers how much there is, which
 * is the question people open a money app to settle. A transfer between two of
 * these is not spending, so it never reaches the safe-to-spend figure, the
 * budgets or the category charts.
 */
export function Accounts({ dark }: { dark: boolean }) {
  const { state, dispatch, today, t, relWords, locale } = useApp();
  const [editing, setEditing] = useState<Account | null>(null);
  const [accountSheet, setAccountSheet] = useState(false);
  const [transferSheet, setTransferSheet] = useState(false);

  const balances = useMemo(() => accountBalances(state, today), [state, today]);
  const total = useMemo(() => totalBalance(state, today), [state, today]);
  const live = balances.filter((b) => !b.account.archived);
  const archived = balances.filter((b) => b.account.archived);
  const tintSet = tints(dark);

  const recentTransfers = useMemo(() => state.transfers.slice(0, 6), [state.transfers]);

  return (
    <div className="pb-24 desk:pb-8">
      <header className="flex flex-wrap items-center gap-3 px-gutter pb-3 pt-3 desk:pt-6">
        <h1 className="text-xl font-medium text-ink-900 dark:text-ink-50">
          {t('accounts.title')}
        </h1>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setTransferSheet(true)}
          disabled={live.length < 2}
          className="btn-quiet min-h-[44px] px-3 text-meta disabled:opacity-40"
        >
          <ArrowsLeftRight size={17} aria-hidden="true" />
          {t('accounts.transfer')}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setAccountSheet(true);
          }}
          className="btn-quiet min-h-[44px] px-3 text-meta"
        >
          <Plus size={17} weight="bold" aria-hidden="true" />
          {t('accounts.addAccount')}
        </button>
      </header>

      <div className="desk:grid desk:grid-cols-3 desk:gap-5 desk:px-gutter">
        {/* Total ---------------------------------------------------------- */}
        <section className="px-gutter desk:col-span-1 desk:px-0">
          <div className="rounded-hero bg-brand px-5 py-5 text-white">
            <p className="text-meta font-medium uppercase tracking-[0.09em] text-mint-soft">
              {t('accounts.totalBalance')}
            </p>
            <p className="tnum mt-1.5 font-display text-hero-sm">
              {moneyWhole(total, state.currency)}
            </p>
            <p className="mt-1 text-meta text-mint-soft">
              {t('accounts.totalHint', { count: live.length })}
            </p>
          </div>
        </section>

        {/* Accounts ------------------------------------------------------- */}
        <section className="px-gutter pt-5 desk:col-span-2 desk:px-0 desk:pt-0">
          <SectionHeader title={t('accounts.yours')} />
          {live.length === 0 ? (
            <div className="card">
              <p className="text-base font-medium text-ink-900 dark:text-ink-50">
                {t('accounts.emptyTitle')}
              </p>
              <p className="mt-1.5 text-meta leading-snug text-ink-600 dark:text-ink-300">
                {t('accounts.emptyBody')}
              </p>
            </div>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {live.map((b) => {
                const tint = tintSet[b.account.colorKey];
                const Icon = iconFor(b.account.icon);
                return (
                  <li key={b.account.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(b.account);
                        setAccountSheet(true);
                      }}
                      className="press card w-full text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]"
                          style={{ backgroundColor: tint.bg, color: tint.fg }}
                          aria-hidden="true"
                        >
                          <Icon size={22} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-medium text-ink-900 dark:text-ink-50">
                            {b.account.name}
                          </span>
                          <span className="block text-meta text-ink-500 dark:text-ink-400">
                            {t(ACCOUNT_KIND_KEY[b.account.kind])}
                          </span>
                        </span>
                      </div>
                      <p
                        className={`tnum mt-3 font-display text-2xl ${
                          b.balance < 0
                            ? 'text-coral-text dark:text-[#F0B49B]'
                            : 'text-ink-900 dark:text-ink-50'
                        }`}
                      >
                        {money(b.balance, state.currency)}
                      </p>
                      <p className="mt-1 text-meta text-ink-500 dark:text-ink-400">
                        {b.activity === 0
                          ? t('accounts.nothingHere')
                          : t('accounts.inOut', {
                              moneyIn: money(b.moneyIn + b.transferredIn, state.currency),
                              moneyOut: money(b.moneyOut + b.transferredOut, state.currency),
                            })}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {archived.length > 0 && (
            <>
              <SectionHeader title={t('accounts.closed')} />
              <ul className="card divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {archived.map((b) => (
                  <li key={b.account.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-meta text-ink-500 dark:text-ink-400">
                      {b.account.name}
                    </span>
                    <span className="tnum text-meta text-ink-500 dark:text-ink-400">
                      {money(b.balance, state.currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'account/update',
                          account: { ...b.account, archived: false },
                        })
                      }
                      className="press min-h-[44px] rounded-chip px-2 text-meta font-medium text-brand-mid dark:text-mint"
                    >
                      {t('accounts.reopen')}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Transfers ------------------------------------------------------ */}
        <section className="px-gutter pt-5 desk:col-span-3 desk:px-0">
          <SectionHeader
            title={t('accounts.recentTransfers')}
            icon={<ArrowsLeftRight size={13} weight="bold" aria-hidden="true" />}
          />
          <div className="card">
            {recentTransfers.length === 0 ? (
              <p className="py-1 text-meta leading-snug text-ink-500 dark:text-ink-400">
                {t('accounts.noTransfers')}
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {recentTransfers.map((tr) => {
                  const from = state.accounts.find((a) => a.id === tr.fromAccountId);
                  const to = state.accounts.find((a) => a.id === tr.toAccountId);
                  return (
                    <li key={tr.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-base text-ink-900 dark:text-ink-50">
                          <span className="truncate font-medium">
                            {from?.name ?? t('nav.account')}
                          </span>
                          <ArrowRight
                            size={14}
                            className="shrink-0 text-ink-400 dark:text-ink-500"
                            aria-hidden="true"
                          />
                          <span className="truncate font-medium">
                            {to?.name ?? t('nav.account')}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate text-meta text-ink-500 dark:text-ink-400">
                          {tr.note ? `${tr.note} · ` : ''}
                          {relativeTime(tr.date, today, relWords, locale)}
                        </p>
                      </div>
                      <span className="tnum shrink-0 text-base font-medium text-ink-900 dark:text-ink-50">
                        {money(tr.amount, state.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'transfer/delete', id: tr.id })}
                        aria-label={t('accounts.deleteTransferAria', {
                          amount: money(tr.amount, state.currency),
                        })}
                        className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-400 dark:text-ink-500"
                      >
                        <Trash size={16} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <AccountSheet
        open={accountSheet}
        onClose={() => setAccountSheet(false)}
        editing={editing}
        dark={dark}
      />
      <TransferSheet open={transferSheet} onClose={() => setTransferSheet(false)} />
    </div>
  );
}

/* ---------------------------------------------------------- account form */

function AccountSheet({
  open,
  onClose,
  editing,
  dark,
}: {
  open: boolean;
  onClose: () => void;
  editing: Account | null;
  dark: boolean;
}) {
  const { state, dispatch, t } = useApp();
  const [draft, setDraft] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState('');

  const key = `${open}-${editing?.id ?? 'new'}`;
  if (key !== lastKey) {
    setLastKey(key);
    setError(null);
    setDraft(
      editing ?? {
        id: `acc_${Date.now().toString(36)}`,
        name: '',
        kind: 'cash',
        icon: 'Wallet',
        colorKey: 'slate',
        openingBalance: 0,
      },
    );
  }

  if (!draft) return null;
  const tintSet = tints(dark);

  const inUse =
    editing &&
    (state.transactions.some((t) => t.accountId === editing.id) ||
      state.transfers.some((t) => t.fromAccountId === editing.id || t.toAccountId === editing.id));

  function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError(t('accounts.errName'));
      return;
    }
    const clean = { ...draft, name: draft.name.trim() };
    dispatch(
      editing ? { type: 'account/update', account: clean } : { type: 'account/add', account: clean },
    );
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(editing ? 'accounts.editTitle' : 'accounts.addTitle')}
      footer={
        <div className="flex gap-2.5">
          {editing && (
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'account/delete', id: editing.id });
                onClose();
              }}
              className="press flex min-h-[52px] items-center justify-center gap-2 rounded-field px-4 text-base font-medium text-coral-text dark:text-[#F0B49B]"
              style={{ border: '1px solid var(--hairline)' }}
            >
              <Trash size={18} aria-hidden="true" />
              {t(inUse ? 'accounts.close' : 'common.delete')}
            </button>
          )}
          <button type="button" onClick={save} className="btn-primary flex-1">
            {t('common.save')}
          </button>
        </div>
      }
    >
      <div className="grid gap-4 pb-4 pt-1">
        <div>
          <label htmlFor="acc-name" className="label">
            {t('accounts.name')}
          </label>
          <input
            id="acc-name"
            data-autofocus
            value={draft.name}
            onChange={(e) => {
              setDraft({ ...draft, name: e.target.value });
              setError(null);
            }}
            placeholder={t('accounts.namePlaceholder')}
            className="field"
          />
        </div>

        <fieldset>
          <legend className="label">{t('accounts.kind')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {ACCOUNT_KINDS.map((k) => {
              const on = draft.kind === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() =>
                    setDraft({ ...draft, kind: k.id as AccountKind, icon: k.icon })
                  }
                  className={`press min-h-[44px] rounded-chip px-3 text-meta font-medium ${
                    on
                      ? 'bg-brand text-white dark:bg-mint dark:text-brand'
                      : 'text-ink-700 dark:text-ink-200'
                  }`}
                  style={on ? undefined : { border: '1px solid var(--hairline)' }}
                >
                  {t(k.key)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="acc-opening" className="label">
            {t('accounts.openingBalance')}
          </label>
          <input
            id="acc-opening"
            value={String(draft.openingBalance)}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9.-]/g, '');
              setDraft({ ...draft, openingBalance: Number.parseFloat(raw) || 0 });
            }}
            inputMode="decimal"
            className="field tnum"
          />
          <p className="mt-1.5 text-meta leading-snug text-ink-500 dark:text-ink-400">
            {t('accounts.openingHint')}
          </p>
        </div>

        <fieldset>
          <legend className="label">{t('palette.colour')}</legend>
          <div className="flex flex-wrap gap-2">
            {COLOR_KEYS.map((k) => {
              const on = draft.colorKey === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={k}
                  onClick={() => setDraft({ ...draft, colorKey: k })}
                  className="press h-11 w-11 rounded-chip"
                  style={{
                    backgroundColor: tintSet[k].bg,
                    outline: on ? `2px solid ${tintSet[k].fg}` : 'none',
                    outlineOffset: '1px',
                  }}
                />
              );
            })}
          </div>
        </fieldset>

        {inUse && (
          <p className="text-meta leading-snug text-ink-500 dark:text-ink-400">
            {t('accounts.inUseHint')}
          </p>
        )}

        {error && (
          <p role="alert" className="text-meta font-medium text-coral-text dark:text-[#F0B49B]">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------- transfer form */

function TransferSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch, t } = useApp();
  const live = state.accounts.filter((a) => !a.archived);

  const [from, setFrom] = useState(live[0]?.id ?? '');
  const [to, setTo] = useState(live[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastOpen, setLastOpen] = useState(false);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setFrom(live[0]?.id ?? '');
      setTo(live[1]?.id ?? '');
      setAmount('');
      setNote('');
      setError(null);
    }
  }

  function submit() {
    const value = Number.parseFloat(amount);
    const problem = validateTransfer(state, from, to, value);
    if (problem) {
      setError(t(problem));
      return;
    }
    dispatch({
      type: 'transfer/add',
      transfer: {
        id: `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        amount: value,
        fromAccountId: from,
        toAccountId: to,
        note: note.trim() || undefined,
        date: new Date().toISOString(),
      },
    });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('accounts.moveTitle')}
      description={t('accounts.moveSubtitle')}
      footer={
        <button type="button" onClick={submit} className="btn-primary">
          {t('accounts.moveIt')}
        </button>
      }
    >
      <div className="grid gap-4 pb-4 pt-1">
        <div>
          <label htmlFor="tr-amount" className="label">
            {t('common.amount')}
          </label>
          <input
            id="tr-amount"
            data-autofocus
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^0-9.]/g, ''));
              setError(null);
            }}
            inputMode="decimal"
            placeholder="0"
            className="field tnum"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tr-from" className="label">
              {t('accounts.outOf')}
            </label>
            <select
              id="tr-from"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setError(null);
              }}
              className="field"
            >
              {live.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tr-to" className="label">
              {t('accounts.into')}
            </label>
            <select
              id="tr-to"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setError(null);
              }}
              className="field"
            >
              {live.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="tr-note" className="label">
            {t('common.note')}{' '}
            <span className="font-normal text-ink-400">{t('common.optional')}</span>
          </label>
          <input
            id="tr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('accounts.notePlaceholder')}
            className="field"
          />
        </div>

        {error && (
          <p role="alert" className="text-meta font-medium text-coral-text dark:text-[#F0B49B]">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
