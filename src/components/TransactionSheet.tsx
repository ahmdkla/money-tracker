import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowsClockwise,
  CaretDown,
  Check,
  Tag,
  Trash,
} from '@phosphor-icons/react';
import type { Category, Transaction, TxType } from '../types';
import { useApp } from '../store/AppContext';
import { parseQuickAdd } from '../lib/parse';
import { currencyDecimals, currencySymbol, money, round2, separators } from '../lib/format';
import { relativeTime, toDateTimeLocal } from '../lib/date';
import { seriesKey, seriesLabel } from '../lib/recurringEngine';
import { defaultAccountId } from '../lib/accounts';
import { FALLBACK_EXPENSE_ID, FALLBACK_INCOME_ID } from '../lib/seed';
import { tints } from '../lib/palette';
import { iconFor } from './icons';
import { Sheet } from './primitives';

/* Amount field --------------------------------------------------------- */

/*
 * The value is held as a plain string with a full stop for a decimal point,
 * because that is what Number.parseFloat reads. Only the display is localised,
 * so Indonesian sees 43.000 and English sees 43,000 for the same stored "43000".
 */

/** Keeps what the user typed, but groups the thousands as they go. */
export function formatAmountInput(raw: string): string {
  const { group, decimal } = separators();
  const [whole, ...rest] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return rest.length ? `${grouped}${decimal}${rest[0]}` : grouped;
}

/**
 * Whatever came out of the keyboard, back to a plain number string.
 *
 * Grouping characters are dropped, the locale's decimal character becomes a
 * full stop, and a currency with no minor unit refuses a decimal point rather
 * than accepting one it is going to round away.
 */
export function sanitiseAmount(next: string, decimals = 2): string {
  const { group, decimal } = separators();

  let cleaned = next.split(group).join('');
  if (decimal !== '.') cleaned = cleaned.split(decimal).join('.');
  cleaned = cleaned.replace(/[^0-9.]/g, '');

  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }

  const [whole, fraction] = cleaned.split('.');
  const trimmedWhole = whole.replace(/^0+(?=\d)/, '').slice(0, 12);
  if (decimals === 0 || fraction === undefined) return trimmedWhole;
  return `${trimmedWhole}.${fraction.slice(0, decimals)}`;
}

/* Sheet ---------------------------------------------------------------- */

/**
 * Add or edit a transaction.
 *
 * Ordered by what the person already knows: which way the money went, how
 * much, out of which account, what it was, and only then which category it
 * belongs to. Category comes last because it is the one field the app can
 * often work out on its own, and the one that must never stand between
 * somebody and a saved record.
 *
 * Three rules hold this screen together:
 *
 *  - Nothing scrolls sideways. A row of chips running off the edge hides
 *    options and drags the whole sheet with it on a phone.
 *  - Every target clears 46px. The direction control is a full width pair,
 *    not two slivers tucked into the corner of the amount box.
 *  - Category is optional. Typing a merchant picks one; typing nothing lands
 *    the record in the catch-all, which takes a second to correct later.
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
  const { state, dispatch, today, categoryById, t, relWords, locale } = useApp();
  const isEdit = editing !== null;

  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  /**
   * Whether the category on screen was chosen by hand. Once it has been, the
   * matcher stops touching it: overriding somebody's explicit choice is worse
   * than not guessing at all.
   */
  const [categoryPickedByHand, setCategoryPickedByHand] = useState(false);
  const [autoPicked, setAutoPicked] = useState(false);
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

    setAutoPicked(false);

    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amount));
      setCategoryId(editing.categoryId);
      setCategoryPickedByHand(true);
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
      setCategoryPickedByHand(false);
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

  /**
   * The note is usually the merchant, and the merchant usually implies the
   * category, so typing "Gojek" selects Transportasi without anyone being
   * asked. It only ever fills a blank, and it clears itself again if the text
   * that produced it is deleted.
   */
  useEffect(() => {
    if (categoryPickedByHand) return;

    const text = note.trim();
    if (!text) {
      setCategoryId((current) => (autoPicked ? null : current));
      setAutoPicked(false);
      return;
    }

    const guess = parseQuickAdd(text, stateRef.current.categories);
    if (guess.categoryId && guess.type === type) {
      setCategoryId(guess.categoryId);
      setAutoPicked(true);
      setError(null);
    } else {
      setCategoryId((current) => (autoPicked ? null : current));
      setAutoPicked(false);
    }
  }, [note, type, categoryPickedByHand, autoPicked]);

  /** The catch-all for this direction. Guaranteed to exist by validateState. */
  const fallbackCategoryId = type === 'income' ? FALLBACK_INCOME_ID : FALLBACK_EXPENSE_ID;

  const chooseCategory = (id: string) => {
    // Tapping the chosen one clears it, which is how somebody undoes a guess
    // they disagree with without hunting for a "none" chip.
    const next = categoryId === id ? null : id;
    setCategoryId(next);
    setCategoryPickedByHand(next !== null);
    setAutoPicked(false);
    setError(null);
  };

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
      setError(t('tx.errAmount'));
      amountRef.current?.focus();
      return;
    }
    // No category is not an error. It lands in the catch-all, which is a
    // record that exists and can be corrected, rather than a form that
    // refuses to close over a question the user did not want to answer.
    const landsIn =
      categoryId && pool.some((c) => c.id === categoryId) ? categoryId : fallbackCategoryId;

    // Unticked means now, read when Add is pressed rather than when the sheet
    // opened, so a slowly filled form is not stamped several minutes ago.
    const date = customDate ? new Date(when).toISOString() : new Date().toISOString();

    const tx: Transaction = {
      id: editing?.id ?? `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      amount: round2(value),
      type,
      categoryId: landsIn,
      note: note.trim() || undefined,
      date,
      ...(accountId ? { accountId } : {}),
      ...(recurring ? { recurring: true } : {}),
    };

    dispatch(isEdit ? { type: 'tx/update', tx } : { type: 'tx/add', tx });
    onSaved(t(isEdit ? 'toast.saved' : 'toast.added'));
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
      onSaved(t('toast.billStopped'));
    } else {
      dispatch({ type: 'tx/delete', id: editing.id });
      onDeleted();
    }
    onClose();
  }

  const symbol = currencySymbol(state.currency);
  const tintSet = tints(dark);
  const fallbackName =
    state.categories.find((c) => c.id === fallbackCategoryId)?.name ?? t('common.uncategorised');
  const whenLabel = customDate
    ? relativeTime(new Date(when).toISOString(), today, relWords, locale)
    : t('common.now');

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={t(isEdit ? 'tx.editTitle' : 'tx.addTitle')}
        description={isEdit ? undefined : t('tx.addSubtitle')}
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
                {t(confirmDelete === 'one' ? 'common.tapAgain' : 'common.delete')}
              </button>
            )}
            <button type="button" onClick={submit} className="btn-primary flex-1">
              {t(isEdit ? 'tx.saveChanges' : 'common.add')}
            </button>
          </div>
        }
      >
        {/* Direction, on its own row and full width -------------------- */}
        <fieldset className="pt-1">
          <legend className="sr-only">{t('tx.direction')}</legend>
          <div
            className="grid grid-cols-2 gap-1 rounded-field bg-ink-100 p-1 dark:bg-night-raised"
            role="radiogroup"
            aria-label={t('tx.direction')}
          >
            {(
              [
                ['expense', 'common.moneyOut', ArrowUpRight],
                ['income', 'common.moneyIn', ArrowDownLeft],
              ] as const
            ).map(([kind, key, Glyph]) => {
              const on = type === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setType(kind)}
                  className={`press flex min-h-[52px] items-center justify-center gap-2 rounded-chip text-base font-medium ${
                    on
                      ? 'bg-white text-ink-900 dark:bg-night-card dark:text-ink-50'
                      : 'text-ink-500 dark:text-ink-400'
                  }`}
                  style={on ? { border: '1px solid var(--hairline)' } : undefined}
                >
                  <Glyph
                    size={18}
                    weight="bold"
                    className={
                      on
                        ? kind === 'income'
                          ? 'text-brand-mid dark:text-mint'
                          : 'text-coral-text dark:text-[#F0B49B]'
                        : undefined
                    }
                    aria-hidden="true"
                  />
                  {t(key)}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Amount ------------------------------------------------------- */}
        <div className="mt-3.5">
          <label htmlFor="tx-amount" className="label">
            {t('common.amount')}
          </label>
          <div
            className="flex items-center gap-2 rounded-card bg-white px-3.5 py-3 dark:bg-night-raised"
            style={{ border: '1px solid var(--hairline)' }}
          >
            <span
              className="shrink-0 font-display text-3xl text-ink-400 dark:text-ink-500"
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
                setAmount(sanitiseAmount(e.target.value, currencyDecimals(state.currency)));
                setError(null);
              }}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              className="tnum w-full min-w-0 bg-transparent font-display text-4xl outline-none placeholder:text-ink-300 dark:placeholder:text-ink-600"
            />
          </div>
        </div>

        {/* Quick add -------------------------------------------------- */}
        <div className="mt-3.5">
          <label htmlFor="tx-quick" className="label">
            {t('tx.orTypeIt')}
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
            placeholder={t('tx.quickPlaceholder')}
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
                  {preview.amount !== null
                    ? money(preview.amount, state.currency)
                    : t('tx.noAmount')}
                  {previewCategory
                    ? ` · ${previewCategory.name}`
                    : ` · ${t('tx.pickCategory')}`}
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
                {t('tx.quickHint')}
              </p>
            )}
          </div>
        </div>

        {/* Where the money came from or went. Above the category
            because it is what the user knows without thinking, and the one
            thing the app cannot work out for them. ---------------------- */}
        {state.accounts.filter((a) => !a.archived).length > 0 && (
          <div className="mt-3.5">
            <label htmlFor="tx-account" className="label">
              {t(type === 'expense' ? 'tx.paidFrom' : 'tx.paidInto')}
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

        {/* Note. Also what the category is guessed from ----------------- */}
        <div className="mt-3.5">
          <label htmlFor="tx-note" className="label">
            {t('common.note')}{' '}
            <span className="font-normal text-ink-400">{t('common.optional')}</span>
          </label>
          <input
            id="tx-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('tx.notePlaceholder')}
            autoComplete="off"
            className="field"
          />
        </div>

        {/* Categories. Wrapped, never scrolled sideways ----------------- */}
        <fieldset className="mt-3.5">
          <legend className="label flex flex-wrap items-center gap-x-1.5">
            <span>
              {t('common.category')}{' '}
              <span className="font-normal text-ink-400">{t('common.optional')}</span>
            </span>
            {autoPicked && (
              <span className="rounded-chip bg-mint-soft px-1.5 py-0.5 text-micro font-medium normal-case text-brand dark:bg-[#15342A] dark:text-[#8EDCBC]">
                {t('tx.autoPicked')}
              </span>
            )}
          </legend>
          <div
            className="flex flex-wrap gap-1.5"
            role="radiogroup"
            aria-label={t('common.category')}
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
                  onClick={() => chooseCategory(c.id)}
                  className="press flex min-h-[46px] max-w-full items-center gap-1.5 rounded-chip px-2.5 text-meta font-medium"
                  style={{
                    backgroundColor: tint.bg,
                    color: tint.fg,
                    outline: selected ? `2px solid ${tint.fg}` : '1px solid transparent',
                    outlineOffset: selected ? '1px' : '0',
                  }}
                >
                  <Icon size={16} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{c.name}</span>
                  {selected && (
                    <Check size={13} weight="bold" className="shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-meta leading-snug text-ink-500 dark:text-ink-400">
            {t('tx.categoryHint', { name: fallbackName })}
          </p>
        </fieldset>

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
                  {t('tx.differentDate')}
                </span>
                <span className="block truncate text-ink-500 dark:text-ink-400">
                  {t('tx.currently', { when: whenLabel })}
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
                    {t('tx.dateAndTime')}
                  </label>
                  <input
                    id="tx-when"
                    ref={dateRef}
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    tabIndex={customDate ? undefined : -1}
                    className="field tnum block w-full min-w-0 max-w-full appearance-none"
                  />
                  <div className="mt-2 flex gap-2">
                    {(
                      [
                        [0, 'common.today'],
                        [-1, 'common.yesterday'],
                        [-2, 'common.twoDaysAgo'],
                      ] as const
                    ).map(([offset, key]) => (
                      <button
                        key={key}
                        type="button"
                        tabIndex={customDate ? undefined : -1}
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() + offset);
                          setWhen(toDateTimeLocal(d.toISOString()));
                        }}
                        className="press min-h-[44px] flex-1 rounded-chip px-2 text-meta font-medium text-ink-700 dark:text-ink-200"
                        style={{ border: '1px solid var(--hairline)' }}
                      >
                        {t(key)}
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
                {t('tx.fixedBill')}
              </span>
              <span className="block text-ink-500 dark:text-ink-400">
                {t('tx.fixedBillHint')}
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
                ? t('tx.stopConfirm')
                : t('tx.stopRepeating', {
                    name: seriesLabel(editing, categoryById(editing.categoryId)?.name),
                  })}
            </button>
            <p className="mt-1.5 text-meta leading-snug text-ink-500 dark:text-ink-400">
              {t('tx.stopHint')}
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
