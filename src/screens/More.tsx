import { useRef, useState } from 'react';
import {
  Check,
  FileArrowUp,
  Desktop,
  DownloadSimple,
  Lock,
  Moon,
  PencilSimple,
  Plus,
  Sun,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react';
import type { Category, ColorKey, ThemePref } from '../types';
import { useApp } from '../store/AppContext';
import { CURRENCIES, money } from '../lib/format';
import { COLOR_KEY_LABELS, COLOR_KEYS, tints } from '../lib/palette';
import { exportState, validateState } from '../lib/storage';
import { CATEGORY_ICON_NAMES, iconFor } from '../components/icons';
import { CategoryTile, SectionHeader, Sheet } from '../components/primitives';
import { AccountPanel } from '../components/AccountBits';

export function More({
  dark,
  notify,
  onSignIn,
  onImportCsv,
  onStartFresh,
}: {
  dark: boolean;
  notify: (message: string, tone?: 'neutral' | 'warning') => void;
  onSignIn: () => void;
  onImportCsv: () => void;
  onStartFresh: () => void;
}) {
  const { state, dispatch, safe, auth } = useApp();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again after a failure
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = validateState(JSON.parse(String(reader.result)));
        if (!parsed) throw new Error('shape');
        dispatch({ type: 'data/replace', state: parsed });
        notify('Imported');
      } catch {
        notify('That file did not look right. Try exporting a fresh copy.', 'warning');
      }
    };
    reader.onerror = () =>
      notify('That file could not be read. Try exporting a fresh copy.', 'warning');
    reader.readAsText(file);
  }

  return (
    <div className="pb-24 desk:pb-8">
      <header className="px-gutter pb-3 pt-3 desk:pt-6">
        <h1 className="text-xl font-medium text-ink-900 dark:text-ink-50">Settings</h1>
      </header>

      <div className="desk:grid desk:grid-cols-2 desk:items-start desk:gap-5 desk:px-gutter">
      {/* Account --------------------------------------------------------- */}
      <section className="px-gutter desk:px-0">
        <SectionHeader title="Account" />
        <AccountPanel onSignIn={onSignIn} />
      </section>

      {/* The money that drives the number ------------------------------ */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader title="Your month" />
        <div className="card grid gap-4">
          <NumberField
            id="set-income"
            label="Monthly income"
            help="What you expect to come in this month."
            value={state.monthlyIncome}
            currency={state.currency}
            onCommit={(v) => dispatch({ type: 'settings/income', value: v })}
          />
          <NumberField
            id="set-savings"
            label="Monthly savings goal"
            help="Set aside first, before anything is called spendable."
            value={state.savingsGoalPerMonth}
            currency={state.currency}
            onCommit={(v) => dispatch({ type: 'settings/savings', value: v })}
          />
          <div>
            <label htmlFor="set-name" className="label">
              Name
            </label>
            <input
              id="set-name"
              defaultValue={state.name}
              onBlur={(e) => dispatch({ type: 'settings/name', value: e.target.value })}
              className="field"
              autoComplete="given-name"
            />
          </div>

          <div className="hairline-t pt-3">
            <p className="text-meta leading-snug text-ink-600 dark:text-ink-300">
              After {money(safe.fixedBillsThisMonth, state.currency)} of fixed bills and{' '}
              {money(state.savingsGoalPerMonth, state.currency)} of savings, this month has{' '}
              <strong className="tnum font-semibold text-ink-900 dark:text-ink-50">
                {money(safe.spendableThisMonth, state.currency)}
              </strong>{' '}
              of spending money in it.
            </p>
          </div>
        </div>
      </section>

      {/* Currency ------------------------------------------------------ */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader title="Currency" />
        <div className="card">
          <label htmlFor="set-currency" className="label">
            Display currency
          </label>
          <select
            id="set-currency"
            value={state.currency}
            onChange={(e) => dispatch({ type: 'settings/currency', value: e.target.value })}
            className="field"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-meta text-ink-500 dark:text-ink-400">
            This changes how amounts are shown. It does not convert anything.
          </p>
        </div>
      </section>

      {/* Appearance ---------------------------------------------------- */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader title="Appearance" />
        <div className="card">
          <fieldset>
            <legend className="label">Theme</legend>
            <div
              className="flex gap-1 rounded-field bg-ink-100 p-1 dark:bg-night-raised"
              role="radiogroup"
              aria-label="Theme"
            >
              {(
                [
                  { id: 'system', label: 'System', Icon: Desktop },
                  { id: 'light', label: 'Light', Icon: Sun },
                  { id: 'dark', label: 'Dark', Icon: Moon },
                ] as { id: ThemePref; label: string; Icon: typeof Sun }[]
              ).map(({ id, label, Icon }) => {
                const selected = state.darkMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => dispatch({ type: 'settings/theme', value: id })}
                    className={`press flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-chip text-meta font-medium ${
                      selected
                        ? 'bg-white text-ink-900 dark:bg-night-card dark:text-ink-50'
                        : 'text-ink-600 dark:text-ink-400'
                    }`}
                    style={selected ? { border: '1px solid var(--hairline)' } : undefined}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-2 text-meta text-ink-500 dark:text-ink-400">
            System follows your device, and changes with it while the app is open.
          </p>
        </div>
      </section>

      {/* Categories ---------------------------------------------------- */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader title="Categories" />
        <div className="card">
          <button
            type="button"
            onClick={() => setCategoriesOpen(true)}
            className="press flex w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block text-base font-medium text-ink-900 dark:text-ink-50">
                Manage categories
              </span>
              <span className="mt-0.5 block text-meta text-ink-500 dark:text-ink-400">
                {state.categories.length} in use. Add, rename, recolour or remove.
              </span>
            </span>
            <PencilSimple
              size={18}
              className="shrink-0 text-ink-500 dark:text-ink-400"
              aria-hidden="true"
            />
          </button>
        </div>
      </section>

      {/* Data ---------------------------------------------------------- */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader title="Your data" />
        <div className="card grid gap-2.5">
          <button
            type="button"
            onClick={() => {
              exportState(state);
              notify('Exported');
            }}
            className="btn-quiet w-full justify-start"
          >
            <DownloadSimple size={18} aria-hidden="true" />
            Export as JSON
          </button>

          <button
            type="button"
            onClick={onImportCsv}
            className="btn-quiet w-full justify-start"
          >
            <FileArrowUp size={18} aria-hidden="true" />
            Import a CSV from your bank
          </button>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="btn-quiet w-full justify-start"
          >
            <UploadSimple size={18} aria-hidden="true" />
            Restore a manimani backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={onImportFile}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={onStartFresh}
            className="press flex min-h-[52px] w-full items-center justify-start gap-2 rounded-field px-4 text-base font-medium text-coral-text dark:text-[#F0B49B]"
            style={{ border: '1px solid var(--hairline)' }}
          >
            <Trash size={18} aria-hidden="true" />
            Delete everything and start fresh
          </button>
          <p className="text-meta leading-snug text-ink-500 dark:text-ink-400">
            {state.demoSeeded
              ? 'Clears the sample month so you can begin on your own numbers.'
              : 'Clears every transaction, account, budget and goal. Categories, currency and theme stay.'}
          </p>
        </div>
      </section>

      {/* About --------------------------------------------------------- */}
      <section className="px-gutter pb-6 pt-5 desk:col-span-2 desk:px-0">
        <SectionHeader title="About manimani" />
        <div className="card">
          <p className="text-meta leading-relaxed text-ink-600 dark:text-ink-300">
            manimani exists to answer one question the moment you open it: are you okay to
            spend today? It takes your income, sets your savings aside, subtracts the bills
            you already know about, and divides what is genuinely left across the days that
            are genuinely left. That is the whole trick.
          </p>
          <p className="mt-3 text-meta leading-relaxed text-ink-600 dark:text-ink-300">
            It is not here to make you feel bad about a dinner out. A number that only ever
            scolds is a number people stop opening.
          </p>

          <div
            className="mt-4 flex items-start gap-2.5 rounded-field bg-ink-50 px-3 py-2.5 dark:bg-night-raised"
            style={{ border: '1px solid var(--hairline)' }}
          >
            <Lock
              size={16}
              className="mt-0.5 shrink-0 text-brand-mid dark:text-mint"
              aria-hidden="true"
            />
            <p className="text-meta leading-snug text-ink-600 dark:text-ink-300">
              {auth.session ? (
                <>
                  <strong className="font-medium text-ink-900 dark:text-ink-50">
                    Your data is yours alone.
                  </strong>{' '}
                  It is stored against your account and protected by row level security, so
                  the server will not return another account{'’'}s rows even if asked. There
                  is no analytics and no tracking. Export takes a copy whenever you want one.
                </>
              ) : (
                <>
                  <strong className="font-medium text-ink-900 dark:text-ink-50">
                    Nothing leaves this device.
                  </strong>{' '}
                  You are not signed in, so there is no server involved at all. Everything
                  lives in this browser{'’'}s local storage, which is why clearing site data
                  wipes it and why the export button exists.
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      </div>

      <CategorySheet open={categoriesOpen} onClose={() => setCategoriesOpen(false)} dark={dark} />
    </div>
  );
}

/* ------------------------------------------------------------- fields */

/**
 * Commits on blur rather than on every keystroke, so the hero number does not
 * lurch about while a figure is half typed.
 */
function NumberField({
  id,
  label,
  help,
  value,
  currency,
  onCommit,
}: {
  id: string;
  label: string;
  help: string;
  value: number;
  currency: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);

  // Follow the store when it changes from elsewhere, such as an import.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
        onBlur={() => {
          const parsed = Number.parseFloat(draft);
          const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : value;
          setDraft(String(next));
          onCommit(next);
        }}
        inputMode="decimal"
        className="field tnum"
      />
      <p className="mt-1.5 text-meta text-ink-500 dark:text-ink-400">
        {help} Currently {money(value, currency)}.
      </p>
    </div>
  );
}

/* --------------------------------------------------------- categories */

function CategorySheet({
  open,
  onClose,
  dark,
}: {
  open: boolean;
  onClose: () => void;
  dark: boolean;
}) {
  const { state, dispatch } = useApp();
  const [draft, setDraft] = useState<Category | null>(null);
  const tintSet = tints(dark);

  const usage = (id: string) => state.transactions.filter((t) => t.categoryId === id).length;

  function startNew() {
    setDraft({
      id: `cat_${Date.now().toString(36)}`,
      name: '',
      icon: 'Tag',
      colorKey: 'slate',
      kind: 'expense',
    });
  }

  function commit() {
    if (!draft || !draft.name.trim()) return;
    const clean = { ...draft, name: draft.name.trim() };
    const exists = state.categories.some((c) => c.id === clean.id);
    dispatch(
      exists ? { type: 'category/update', category: clean } : { type: 'category/add', category: clean },
    );
    setDraft(null);
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        setDraft(null);
        onClose();
      }}
      title={draft ? 'Category' : 'Manage categories'}
      footer={
        draft ? (
          <div className="flex gap-2.5">
            <button type="button" onClick={() => setDraft(null)} className="btn-quiet flex-1">
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={!draft.name.trim()}
              className="btn-primary flex-1"
            >
              <Check size={18} weight="bold" aria-hidden="true" />
              Save
            </button>
          </div>
        ) : (
          <button type="button" onClick={startNew} className="btn-primary">
            <Plus size={18} weight="bold" aria-hidden="true" />
            New category
          </button>
        )
      }
    >
      {draft ? (
        <div className="grid gap-4 pt-1">
          <div>
            <label htmlFor="cat-name" className="label">
              Name
            </label>
            <input
              id="cat-name"
              data-autofocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Books, childcare, anything"
              className="field"
            />
          </div>

          <fieldset>
            <legend className="label">Kind</legend>
            <div className="flex gap-1 rounded-field bg-ink-100 p-1 dark:bg-night-raised">
              {(['expense', 'income'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={draft.kind === k}
                  onClick={() => setDraft({ ...draft, kind: k })}
                  className={`press min-h-[44px] flex-1 rounded-chip text-meta font-medium capitalize ${
                    draft.kind === k
                      ? 'bg-white text-ink-900 dark:bg-night-card dark:text-ink-50'
                      : 'text-ink-600 dark:text-ink-400'
                  }`}
                  style={draft.kind === k ? { border: '1px solid var(--hairline)' } : undefined}
                >
                  {k}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {COLOR_KEYS.map((k: ColorKey) => {
                const selected = draft.colorKey === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={COLOR_KEY_LABELS[k]}
                    onClick={() => setDraft({ ...draft, colorKey: k })}
                    className="press flex h-11 w-11 items-center justify-center rounded-chip"
                    style={{
                      backgroundColor: tintSet[k].bg,
                      color: tintSet[k].fg,
                      outline: selected ? `2px solid ${tintSet[k].fg}` : 'none',
                      outlineOffset: '1px',
                    }}
                  >
                    {selected && <Check size={16} weight="bold" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label">Icon</legend>
            <div className="grid grid-cols-7 gap-1.5">
              {CATEGORY_ICON_NAMES.map((name) => {
                const Icon = iconFor(name);
                const selected = draft.icon === name;
                return (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={name}
                    onClick={() => setDraft({ ...draft, icon: name })}
                    className={`press flex h-11 items-center justify-center rounded-chip ${
                      selected
                        ? 'bg-brand text-white dark:bg-mint dark:text-brand'
                        : 'text-ink-600 dark:text-ink-300'
                    }`}
                    style={selected ? undefined : { border: '1px solid var(--hairline)' }}
                  >
                    <Icon size={19} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="h-2" />
        </div>
      ) : (
        <ul className="divide-y pt-1" style={{ borderColor: 'var(--hairline)' }}>
          {state.categories.map((c) => {
            const used = usage(c.id);
            return (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <CategoryTile category={c} dark={dark} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-ink-900 dark:text-ink-50">
                    {c.name}
                  </p>
                  <p className="text-meta text-ink-500 dark:text-ink-400">
                    {c.kind === 'income' ? 'Income' : 'Expense'} ·{' '}
                    {used === 0 ? 'unused' : `${used} recorded`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft(c)}
                  aria-label={`Edit ${c.name}`}
                  className="press flex h-11 w-11 items-center justify-center rounded-full text-ink-600 dark:text-ink-300"
                >
                  <PencilSimple size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'category/delete', id: c.id })}
                  disabled={used > 0}
                  aria-label={
                    used > 0
                      ? `${c.name} cannot be deleted, ${used} transactions use it`
                      : `Delete ${c.name}`
                  }
                  title={used > 0 ? `${used} transactions use this category` : undefined}
                  className="press flex h-11 w-11 items-center justify-center rounded-full text-coral-text disabled:opacity-30 dark:text-[#F0B49B]"
                >
                  <Trash size={17} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
