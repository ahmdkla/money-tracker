import { useRef, useState } from 'react';
import {
  Check,
  CircleNotch,
  FileArrowUp,
  Desktop,
  DownloadSimple,
  Globe,
  Lock,
  Moon,
  PencilSimple,
  Plus,
  Sun,
  Translate,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react';
import type { Category, ColorKey, ThemePref } from '../types';
import { useApp } from '../store/AppContext';
import { money } from '../lib/format';
import {
  CURRENCIES,
  RateUnavailableError,
  convertState,
  describeRate,
  fetchRate,
} from '../lib/currency';
import { LANGUAGES } from '../lib/i18n';
import { COLOR_KEY_LABELS, COLOR_KEYS, tints } from '../lib/palette';
import { exportState, validateState } from '../lib/storage';
import { CATEGORY_ICON_NAMES, iconFor } from '../components/icons';
import {
  CategoryTile,
  SectionHeader,
  Sheet,
  VisuallyHidden,
} from '../components/primitives';
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
  const { state, dispatch, safe, auth, t, lang, locale } = useApp();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Switching currency rewrites every stored amount at the live rate, so the
   * request has to succeed before anything changes. A failure leaves the
   * previous currency selected and says why, rather than half converting.
   */
  async function changeCurrency(to: string) {
    if (to === state.currency || converting) return;
    setConverting(to);
    try {
      const rate = await fetchRate(state.currency, to);
      dispatch({
        type: 'settings/currency-converted',
        state: convertState(state, rate, to),
      });
      notify(
        t('toast.currencyConverted', {
          code: to,
          rate: describeRate(state.currency, to, rate, locale),
        }),
      );
    } catch (err) {
      notify(
        err instanceof RateUnavailableError
          ? t('toast.currencyOffline')
          : t('toast.currencyOffline'),
        'warning',
      );
    } finally {
      setConverting(null);
    }
  }

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
        notify(t('toast.imported'));
      } catch {
        notify(t('toast.importFailed'), 'warning');
      }
    };
    reader.onerror = () => notify(t('toast.importUnreadable'), 'warning');
    reader.readAsText(file);
  }

  return (
    <div className="pb-24 desk:pb-8">
      <header className="px-gutter pb-3 pt-3 desk:pt-6">
        <h1 className="text-xl font-medium text-ink-900 dark:text-ink-50">
          {t('settings.title')}
        </h1>
      </header>

      <div className="desk:grid desk:grid-cols-2 desk:items-start desk:gap-5 desk:px-gutter">
      {/* Account --------------------------------------------------------- */}
      <section className="px-gutter desk:px-0">
        <SectionHeader title={t('settings.account')} />
        <AccountPanel onSignIn={onSignIn} />
      </section>

      {/* The money that drives the number ------------------------------ */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader title={t('settings.yourMonth')} />
        <div className="card grid gap-4">
          <NumberField
            id="set-income"
            label={t('settings.monthlyIncome')}
            help={t('settings.monthlyIncomeHint')}
            value={state.monthlyIncome}
            currency={state.currency}
            onCommit={(v) => dispatch({ type: 'settings/income', value: v })}
          />
          <NumberField
            id="set-savings"
            label={t('settings.savingsGoal')}
            help={t('settings.savingsGoalHint')}
            value={state.savingsGoalPerMonth}
            currency={state.currency}
            onCommit={(v) => dispatch({ type: 'settings/savings', value: v })}
          />
          <div>
            <label htmlFor="set-name" className="label">
              {t('settings.name')}
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
              {t('settings.spendingMoneySummary', {
                bills: money(safe.fixedBillsThisMonth, state.currency),
                savings: money(state.savingsGoalPerMonth, state.currency),
                spendable: money(safe.spendableThisMonth, state.currency),
              })}
            </p>
          </div>
        </div>
      </section>

      {/* Language ------------------------------------------------------ */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader
          title={t('settings.language')}
          icon={<Translate size={14} weight="bold" aria-hidden="true" />}
        />
        <div className="card">
          <fieldset>
            <legend className="label">{t('settings.language')}</legend>
            <div
              className="flex gap-1 rounded-field bg-ink-100 p-1 dark:bg-night-raised"
              role="radiogroup"
              aria-label={t('settings.language')}
            >
              {LANGUAGES.map((l) => {
                const selected = lang === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => dispatch({ type: 'settings/lang', value: l.id })}
                    className={`press flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-chip text-meta font-medium ${
                      selected
                        ? 'bg-white text-ink-900 dark:bg-night-card dark:text-ink-50'
                        : 'text-ink-600 dark:text-ink-400'
                    }`}
                    style={selected ? { border: '1px solid var(--hairline)' } : undefined}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-2 text-meta text-ink-500 dark:text-ink-400">
            {t('settings.languageHint')}
          </p>
        </div>
      </section>

      {/* Currency ------------------------------------------------------ */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader
          title={t('settings.currency')}
          icon={<Globe size={14} weight="bold" aria-hidden="true" />}
        />
        <div className="card">
          <fieldset disabled={converting !== null}>
            <legend className="label">{t('settings.displayCurrency')}</legend>
            <div
              className="grid gap-1.5"
              role="radiogroup"
              aria-label={t('settings.displayCurrency')}
              aria-busy={converting !== null}
            >
              {CURRENCIES.map((c) => {
                const selected = state.currency === c.code;
                const busy = converting === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => void changeCurrency(c.code)}
                    className={`press flex min-h-[52px] items-center gap-3 rounded-field px-3.5 text-left disabled:opacity-60 ${
                      selected
                        ? 'text-ink-900 dark:text-ink-50'
                        : 'text-ink-700 dark:text-ink-200'
                    }`}
                    style={{
                      border: `1px solid ${selected ? 'var(--chosen)' : 'var(--hairline)'}`,
                      backgroundColor: selected ? 'var(--chosen-bg)' : undefined,
                    }}
                  >
                    <span className="tnum w-11 shrink-0 text-meta font-semibold">{c.code}</span>
                    <span className="min-w-0 flex-1 truncate text-base">{c.label}</span>
                    {busy ? (
                      <>
                        <CircleNotch
                          size={17}
                          className="shrink-0 animate-spin text-brand-mid dark:text-mint"
                          aria-hidden="true"
                        />
                        <VisuallyHidden>{t('settings.converting')}</VisuallyHidden>
                      </>
                    ) : (
                      selected && (
                        <Check
                          size={17}
                          weight="bold"
                          className="shrink-0 text-brand-mid dark:text-mint"
                          aria-hidden="true"
                        />
                      )
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-2 text-meta leading-snug text-ink-500 dark:text-ink-400">
            {t('settings.currencyHint')}
          </p>
        </div>
      </section>

      {/* Appearance ---------------------------------------------------- */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader title={t('settings.appearance')} />
        <div className="card">
          <fieldset>
            <legend className="label">{t('settings.theme')}</legend>
            <div
              className="flex gap-1 rounded-field bg-ink-100 p-1 dark:bg-night-raised"
              role="radiogroup"
              aria-label={t('settings.theme')}
            >
              {(
                [
                  { id: 'system', label: t('settings.themeSystem'), Icon: Desktop },
                  { id: 'light', label: t('settings.themeLight'), Icon: Sun },
                  { id: 'dark', label: t('settings.themeDark'), Icon: Moon },
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
            {t('settings.themeHint')}
          </p>
        </div>
      </section>

      {/* Categories ---------------------------------------------------- */}
      <section className="px-gutter pt-5 desk:px-0 desk:pt-0">
        <SectionHeader title={t('settings.categories')} />
        <div className="card">
          <button
            type="button"
            onClick={() => setCategoriesOpen(true)}
            className="press flex w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block text-base font-medium text-ink-900 dark:text-ink-50">
                {t('settings.manageCategories')}
              </span>
              <span className="mt-0.5 block text-meta text-ink-500 dark:text-ink-400">
                {t('settings.categoriesCount', { count: state.categories.length })}
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
        <SectionHeader title={t('settings.yourData')} />
        <div className="card grid gap-2.5">
          <button
            type="button"
            onClick={() => {
              exportState(state);
              notify(t('toast.exported'));
            }}
            className="btn-quiet w-full justify-start"
          >
            <DownloadSimple size={18} aria-hidden="true" />
            {t('settings.exportJson')}
          </button>

          <button
            type="button"
            onClick={onImportCsv}
            className="btn-quiet w-full justify-start"
          >
            <FileArrowUp size={18} aria-hidden="true" />
            {t('settings.importCsv')}
          </button>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="btn-quiet w-full justify-start"
          >
            <UploadSimple size={18} aria-hidden="true" />
            {t('settings.restoreBackup')}
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
            {t('settings.startFresh')}
          </button>
          <p className="text-meta leading-snug text-ink-500 dark:text-ink-400">
            {state.demoSeeded ? t('settings.startFreshHintDemo') : t('settings.startFreshHint')}
          </p>
        </div>
      </section>

      {/* About --------------------------------------------------------- */}
      <section className="px-gutter pb-6 pt-5 desk:col-span-2 desk:px-0">
        <SectionHeader title={t('settings.about')} />
        <div className="card">
          <p className="font-display text-lg leading-snug text-ink-900 dark:text-ink-50">
            {t('app.tagline')}
          </p>
          <p className="mt-3 text-meta leading-relaxed text-ink-600 dark:text-ink-300">
            {t('settings.aboutBody')}
          </p>
          <p className="mt-3 text-meta leading-relaxed text-ink-600 dark:text-ink-300">
            {t('settings.aboutBody2')}
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
              <strong className="font-medium text-ink-900 dark:text-ink-50">
                {auth.session ? t('settings.privacyAccount') : t('settings.privacyLocal')}
              </strong>{' '}
              {auth.session ? t('settings.privacyAccountBody') : t('settings.privacyLocalBody')}
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
  const { t } = useApp();
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
        {help} {t('settings.currently', { amount: money(value, currency) })}
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
  const { state, dispatch, t } = useApp();
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
      title={draft ? t('settings.categoryTitle') : t('settings.manageCategories')}
      footer={
        draft ? (
          <div className="flex gap-2.5">
            <button type="button" onClick={() => setDraft(null)} className="btn-quiet flex-1">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={!draft.name.trim()}
              className="btn-primary flex-1"
            >
              <Check size={18} weight="bold" aria-hidden="true" />
              {t('common.save')}
            </button>
          </div>
        ) : (
          <button type="button" onClick={startNew} className="btn-primary">
            <Plus size={18} weight="bold" aria-hidden="true" />
            {t('settings.newCategory')}
          </button>
        )
      }
    >
      {draft ? (
        <div className="grid gap-4 pt-1">
          <div>
            <label htmlFor="cat-name" className="label">
              {t('settings.name')}
            </label>
            <input
              id="cat-name"
              data-autofocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t('settings.catNamePlaceholder')}
              className="field"
            />
          </div>

          <fieldset>
            <legend className="label">{t('settings.catKind')}</legend>
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
                  {t(k === 'income' ? 'common.income' : 'common.expense')}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label">{t('palette.colour')}</legend>
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
            <legend className="label">{t('settings.icon')}</legend>
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
                    {t(c.kind === 'income' ? 'common.moneyIn' : 'common.moneyOut')} ·{' '}
                    {used === 0 ? t('settings.unused') : t('settings.nRecorded', { count: used })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft(c)}
                  aria-label={t('settings.editCategory', { name: c.name })}
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
                      ? t('settings.cannotDelete', { name: c.name, count: used })
                      : t('settings.deleteCategory', { name: c.name })
                  }
                  title={used > 0 ? t('settings.nRecorded', { count: used }) : undefined}
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
