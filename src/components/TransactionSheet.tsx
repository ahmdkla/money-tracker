import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwise, CaretDown, Check, Tag, Trash } from '@phosphor-icons/react';
import type { Category, Transaction, TxType } from '../types';
import { useApp } from '../store/AppContext';
import { parseQuickAdd } from '../lib/parse';
import { currencySymbol, money, round2 } from '../lib/format';
import { relativeTime, toDateTimeLocal } from '../lib/date';
import { seriesKey, seriesLabel } from '../lib/recurringEngine';
import { defaultAccountId } from '../lib/accounts';
import { tints } from '../lib/palette';
import { iconFor } from './icons';
import { Sheet } from './primitives';

/* Amount field --------------------------------------------------------- */

/** Keeps what the user typed, but groups the thousands as they go. */
function formatAmountInput(raw: string): string {
  const [whole, ...rest] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${grouped}.${rest[0]}` : grouped;
}

function sanitiseAmount(next: string): string {
  let cleaned = next.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  const [whole, fraction] = cleaned.split('.');
  const trimmedWhole = whole.replace(/^0+(?=\d)/, '').slice(0, 9);
  if (fraction === undefined) return trimmedWhole;
  return `${trimmedWhole}.${fraction.slice(0, 2)}`;
}

/* Sheet ---------------------------------------------------------------- */

/**
 * Add or edit a transaction.
 *
 * The form used to be long, and almost all of that length was options that
 * are already right. The date is now simply "now" unless somebody says
 * otherwise, and saying otherwise is a checkbox that opens a picker. Expense
 * and income moved into the amount row, because the sign belongs to the
 * number rather than to a separate question. What is left is the part that
 * always needs answering: how much, and what for.
 */
export function TransactionSheet({
  open,
  onClose,
  editing,
  dark,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  editing: Transaction | null;
  dark: boolean;
  onSaved: (message: string) => void;
  onDeleted: () => void;
}) {
  const { state, dispatch, today, categoryById } = useApp();
  const isEdit = editing !== null;

  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [when, setWhen] = useState(() => toDateTimeLocal(new Date().toISOString()));
  const [customDate, setCustomDate] = useState(false);
  const [quick, setQuick] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<null | 'one' | 'series'>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  // The reset effect needs the current store, but must not re-run every time
  // the store changes: that would wipe the form out from under whoever is
  // filling it in the moment anything else syncs.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(null);
    setQuick('');

    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amount));
      setCategoryId(editing.categoryId);
      setNote(editing.note ?? '');
      setWhen(toDateTimeLocal(editing.date));
      setRecurring(Boolean(editing.recurring));
      setAccountId(editing.accountId ?? defaultAccountId(stateRef.current));
      // An existing record always shows its real date rather than hiding it.
      setCustomDate(true);
    } else {
      setType('expense');
      setAmount('');
      setCategoryId(null);
      setNote('');
      setWhen(toDateTimeLocal(new Date().toISOString()));
      setRecurring(false);
      // Whatever was used last, which is almost always right.
      const current = stateRef.current;
      const lastUsed = current.transactions.find((t) => t.accountId)?.accountId;
      setAccountId(lastUsed ?? defaultAccountId(current));
      setCustomDate(false);
    }
  }, [open, editing]);

  const pool = useMemo(
    () => state.categories.filter((c) => c.kind === type),
    [state.categories, type],
  );

  /** Most recently used first, ignoring anything dated ahead. */
  const orderedCategories = useMemo(() => {
    const seen: string[] = [];
    const now = Date.now();
    for (const tx of state.transactions) {
      if (tx.type !== type) continue;
      if (+new Date(tx.date) > now) continue;
      if (!seen.includes(tx.categoryId)) seen.push(tx.categoryId);
      if (seen.length >= pool.length) break;
    }
    const ranked = seen
      .map((id) => pool.find((c) => c.id === id))
      .filter((c): c is Category => Boolean(c));
    return [...ranked, ...pool.filter((c) => !ranked.includes(c))];
  }, [state.transactions, pool, type]);

  useEffect(() => {
    if (categoryId && !pool.some((c) => c.id === categoryId)) setCategoryId(null);
  }, [pool, categoryId]);

  const preview = useMemo(
    () => (quick.trim() ? parseQuickAdd(quick, state.categories) : null),
    [quick, state.categories],
  );
  const previewCategory = preview?.categoryId
    ? state.categories.find((c) => c.id === preview.categoryId)
    : undefined;

  function applyPreview() {
    if (!preview) return;
    if (preview.amount !== null) setAmount(String(preview.amount));
    if (preview.categoryId) setCategoryId(preview.categoryId);
    setType(preview.type);
    if (preview.note) setNote(preview.note);
    setQuick('');
    setError(null);
  }

  function submit() {
    const value = Number.parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount above zero.');
      amountRef.current?.focus();
      return;
    }
    if (!categoryId) {
      setError('Pick a category so this lands in the right place.');
      return;
    }

    // Unticked means now, read when Add is pressed rather than when the sheet
    // opened, so a slowly filled form is not stamped several minutes ago.
    const date = customDate ? new Date(when).toISOString() : new Date().toISOString();

    const tx: Transaction = {
      id: editing?.id ?? `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      amount: round2(value),
      type,
      categoryId,
      note: note.trim() || undefined,
      date,
      ...(accountId ? { accountId } : {}),
      ...(recurring ? { recurring: true } : {}),
    };

    dispatch(isEdit ? { type: 'tx/update', tx } : { type: 'tx/add', tx });
    onSaved(isEdit ? 'Saved' : 'Added');
    onClose();
  }

  const editingIsBill = Boolean(editing?.recurring);

  function remove(scope: 'one' | 'series') {
    if (!editing) return;
    if (confirmDelete !== scope) {
      setConfirmDelete(scope);
      return;
    }
    if (scope === 'series') {
      dispatch({ type: 'series/end', key: seriesKey(editing) });
      onSaved('Bill stopped');
    } else {
      dispatch({ type: 'tx/delete', id: editing.id });
      onDeleted();
    }
    onClose();
  }

  const symbol = currencySymbol(state.currency);
  const tintSet = tints(dark);
  const whenLabel = customDate ? relativeTime(new Date(when).toISOString(), today) : 'Now';

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={isEdit ? 'Edit transaction' : 'Add transaction'}
        description={isEdit ? undefined : 'How much, and what for. The rest has sensible defaults.'}
        footer={
          <div className="flex gap-2.5">
            {isEdit && (
              <button
                type="button"
                onClick={() => remove('one')}
                className={`press flex min-h-[52px] items-center justify-center gap-2 rounded-field px-4 text-base font-medium ${
                  confirmDelete === 'one'
                    ? 'bg-coral-soft text-coral-text dark:bg-[#3A2620] dark:text-[#F0B49B]'
                    : 'text-coral-text dark:text-[#F0B49B]'
                }`}
                style={confirmDelete === 'one' ? undefined : { border: '1px solid var(--hairline)' }}
              >
                <Trash size={18} aria-hidden="true" />
                {confirmDelete === 'one' ? 'Tap again' : 'Delete'}
              </button>
            )}
            <button type="button" onClick={submit} className="btn-primary flex-1">
              {isEdit ? 'Save changes' : 'Add'}
            </button>
          </div>
        }
      >
        {/* Amount, with the direction attached to it ------------------- */}
        <div className="pt-1">
          <label htmlFor="tx-amount" className="label">
            Amount
          </label>
          <div
            className="flex items-center gap-2 rounded-card bg-white px-3.5 py-3 dark:bg-night-raised"
            style={{ border: '1px solid var(--hairline)' }}
          >
            <span
              className="font-display text-3xl text-ink-400 dark:text-ink-500"
              aria-hidden="true"
            >
              {symbol}
            </span>
            <input
              id="tx-amount"
              ref={amountRef}
              data-autofocus
              value={formatAmountInput(amount)}
              onChange={(e) => {
                setAmount(sanitiseAmount(e.target.value));
                setError(null);
              }}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              className="tnum w-full min-w-0 bg-transparent font-display text-4xl outline-none placeholder:text-ink-300 dark:placeholder:text-ink-600"
            />
            <div
              className="flex shrink-0 gap-0.5 rounded-field bg-ink-100 p-0.5 dark:bg-night-page"
              role="radiogroup"
              aria-label="Direction"
            >
              {(['expense', 'income'] as TxType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  aria-label={t === 'expense' ? 'Money out' : 'Money in'}
                  onClick={() => setType(t)}
                  className={`press min-h-[44px] rounded-chip px-2.5 text-meta font-medium ${
                    type === t
                      ? 'bg-white text-ink-900 dark:bg-night-card dark:text-ink-50'
                      : 'text-ink-500 dark:text-ink-400'
                  }`}
                  style={type === t ? { border: '1px solid var(--hairline)' } : undefined}
                >
                  {t === 'expense' ? 'Out' : 'In'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick add -------------------------------------------------- */}
        <div className="mt-3.5">
          <label htmlFor="tx-quick" className="label">
            Or type it
          </label>
          <input
            id="tx-quick"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && preview && preview.amount !== null) {
                e.preventDefault();
                applyPreview();
              }
            }}
            placeholder="coffee 4.50"
            autoComplete="off"
            aria-describedby="tx-quick-preview"
            className="field"
          />
          <div id="tx-quick-preview" aria-live="polite" className="mt-2">
            {preview && (preview.amount !== null || preview.categoryId) ? (
              <button
                type="button"
                onClick={applyPreview}
                className="press flex min-h-[44px] w-full items-center gap-2.5 rounded-field bg-white px-3 text-left dark:bg-night-raised"
                style={{ border: '1px solid var(--hairline)' }}
              >
                {previewCategory ? (
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-chip"
                    style={{
                      backgroundColor: tintSet[previewCategory.colorKey].bg,
                      color: tintSet[previewCategory.colorKey].fg,
                    }}
                    aria-hidden="true"
                  >
                    {(() => {
                      const Icon = iconFor(previewCategory.icon);
                      return <Icon size={17} />;
                    })()}
                  </span>
                ) : (
                  <Tag
                    size={18}
                    className="shrink-0 text-ink-400 dark:text-ink-500"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-meta font-medium text-ink-900 dark:text-ink-50">
                  {preview.amount !== null ? money(preview.amount, state.currency) : 'No amount'}
                  {previewCategory ? ` · ${previewCategory.name}` : ' · pick a category'}
                </span>
                <Check
                  size={17}
                  weight="bold"
                  className="shrink-0 text-brand-mid dark:text-mint"
                  aria-hidden="true"
                />
              </button>
            ) : (
              <p className="text-meta text-ink-500 dark:text-ink-400">
                Amount and keyword, either order.
              </p>
            )}
          </div>
        </div>

        {/* Categories -------------------------------------------------- */}
        <fieldset className="mt-3.5">
          <legend className="label">Category</legend>
          <div
            className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1 desk:mx-0 desk:flex-wrap desk:overflow-visible desk:px-0"
            role="radiogroup"
            aria-label="Category"
          >
            {orderedCategories.map((c) => {
              const selected = categoryId === c.id;
              const tint = tintSet[c.colorKey];
              const Icon = iconFor(c.icon);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setCategoryId(c.id);
                    setError(null);
                  }}
                  className="press flex min-h-[44px] shrink-0 items-center gap-2 rounded-chip px-3 text-meta font-medium"
                  style={{
                    backgroundColor: tint.bg,
                    color: tint.fg,
                    outline: selected ? `2px solid ${tint.fg}` : '1px solid transparent',
                    outlineOffset: selected ? '1px' : '0',
                  }}
                >
                  <Icon size={17} aria-hidden="true" />
                  {c.name}
                  {selected && <Check size={14} weight="bold" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Which account it moved through ------------------------------ */}
        {state.accounts.filter((a) => !a.archived).length > 0 && (
          <div className="mt-3.5">
            <label htmlFor="tx-account" className="label">
              {type === 'expense' ? 'Paid from' : 'Paid into'}
            </label>
            <select
              id="tx-account"
              value={accountId ?? ''}
              onChange={(e) => setAccountId(e.target.value || null)}
              className="field"
            >
              {state.accounts
                .filter((a) => !a.archived || a.id === accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* Note --------------------------------------------------------- */}
        <div className="mt-3.5">
          <label htmlFor="tx-note" className="label">
            Note <span className="font-normal text-ink-400">optional</span>
          </label>
          <input
            id="tx-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Where was it?"
            autoComplete="off"
            className="field"
          />
        </div>

        {/* The two things that are already right ----------------------- */}
        <div className="mt-3.5 grid gap-2">
          {/* A disclosure, not a dialog. Ticking the box slides the field open
              underneath it and pushes the rest of the form down, so the choice
              and its consequence stay in the same place. */}
          <div className="rounded-field" style={{ border: '1px solid var(--hairline)' }}>
            <div className="flex items-center gap-3 px-3 py-2">
              <input
                id="tx-custom-date"
                type="checkbox"
                checked={customDate}
                aria-expanded={customDate}
                aria-controls="tx-date-panel"
                onChange={(e) => {
                  const on = e.target.checked;
                  setCustomDate(on);
                  if (on) {
                    // Focus the field the disclosure just revealed, once it is
                    // actually in the layout.
                    window.requestAnimationFrame(() => dateRef.current?.focus());
                  } else {
                    setWhen(toDateTimeLocal(new Date().toISOString()));
                  }
                }}
                className="h-5 w-5 shrink-0 accent-brand-mid"
              />
              <label htmlFor="tx-custom-date" className="min-w-0 flex-1 cursor-pointer text-meta">
                <span className="block font-medium text-ink-900 dark:text-ink-50">
                  Different date or time
                </span>
                <span className="block truncate text-ink-500 dark:text-ink-400">
                  Currently {whenLabel}
                </span>
              </label>
              <CaretDown
                size={16}
                className={`shrink-0 text-ink-400 transition-transform duration-ui ease-out dark:text-ink-500 ${
                  customDate ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </div>

            {/* 0fr to 1fr animates a height the layout works out for itself,
                so nothing has to be measured or hard coded. */}
            <div
              id="tx-date-panel"
              className={`grid transition-[grid-template-rows] duration-ui ease-out ${
                customDate ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              {/* Clipping alone leaves the field focusable and still in the
                  accessibility tree. Visibility takes it out of both, delayed
                  on the way out so the height animation still reads. */}
              <div
                className={`overflow-hidden transition-[visibility] ${
                  customDate ? 'visible' : 'invisible delay-[200ms]'
                }`}
                aria-hidden={customDate ? undefined : true}
              >
                <div className="hairline-t mx-3 py-3">
                  <label htmlFor="tx-when" className="label">
                    Date and time
                  </label>
                  <input
                    id="tx-when"
                    ref={dateRef}
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    tabIndex={customDate ? undefined : -1}
                    className="field tnum"
                  />
                  <div className="mt-2 flex gap-2">
                    {[
                      [0, 'Today'],
                      [-1, 'Yesterday'],
                      [-2, '2 days ago'],
                    ].map(([offset, label]) => (
                      <button
                        key={label as string}
                        type="button"
                        tabIndex={customDate ? undefined : -1}
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() + (offset as number));
                          setWhen(toDateTimeLocal(d.toISOString()));
                        }}
                        className="press min-h-[44px] flex-1 rounded-chip px-2 text-meta font-medium text-ink-700 dark:text-ink-200"
                        style={{ border: '1px solid var(--hairline)' }}
                      >
                        {label as string}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <label
            className="flex items-center gap-3 rounded-field px-3 py-2"
            style={{ border: '1px solid var(--hairline)' }}
          >
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-brand-mid"
            />
            <span className="min-w-0 flex-1 text-meta">
              <span className="block font-medium text-ink-900 dark:text-ink-50">
                This is a fixed bill
              </span>
              <span className="block text-ink-500 dark:text-ink-400">
                Comes off the top, and repeats every month.
              </span>
            </span>
            <ArrowsClockwise
              size={17}
              className={`shrink-0 ${
                recurring ? 'text-brand-mid dark:text-mint' : 'text-ink-300 dark:text-ink-600'
              }`}
              aria-hidden="true"
            />
          </label>
        </div>

        {/* Stopping a bill --------------------------------------------- */}
        {isEdit && editingIsBill && editing && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => remove('series')}
              className={`press flex min-h-[44px] w-full items-center justify-center gap-2 rounded-field px-3 text-meta font-medium ${
                confirmDelete === 'series'
                  ? 'bg-coral-soft text-coral-text dark:bg-[#3A2620] dark:text-[#F0B49B]'
                  : 'text-ink-600 dark:text-ink-300'
              }`}
              style={
                confirmDelete === 'series' ? undefined : { border: '1px solid var(--hairline)' }
              }
            >
              {confirmDelete === 'series'
                ? 'Tap again to stop it repeating'
                : `Stop ${seriesLabel(editing, categoryById(editing.categoryId)?.name)} repeating`}
            </button>
            <p className="mt-1.5 text-meta leading-snug text-ink-500 dark:text-ink-400">
              Clears the instances that have not happened yet. Anything already paid stays,
              because that is history rather than a plan.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-meta font-medium text-coral-text dark:text-[#F0B49B]">
            {error}
          </p>
        )}

        <div className="h-2" />
      </Sheet>

    </>
  );
}
