import { useMemo, useState } from 'react';
import { Plus, Trash } from '@phosphor-icons/react';
import { useApp } from '../store/AppContext';
import { transactionsInMonth } from '../lib/insights';
import { money, round2 } from '../lib/format';
import { monthLabel } from '../lib/date';
import { CategoryTile, ProgressBar, Sheet } from '../components/primitives';

/**
 * Budgets are a mirror, not a scoreboard.
 *
 * A bar turns amber near the limit and coral past it, but the words never
 * blame anyone. Running over a budget is information about the month, and the
 * useful response is to move a number, not to feel bad.
 */

const CALM = '#0F6E56';
const NEAR = '#EF9F27';
const OVER = '#F0997B';

function toneFor(fraction: number): { colour: string; state: string } {
  if (fraction > 1) return { colour: OVER, state: 'over the limit' };
  if (fraction >= 0.8) return { colour: NEAR, state: 'close to the limit' };
  return { colour: CALM, state: 'comfortably within the limit' };
}

export function Budgets({ dark, onAddTransaction }: { dark: boolean; onAddTransaction: () => void }) {
  const { state, today, categoryById, dispatch } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const currency = state.currency;

  const spentByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of transactionsInMonth(state.transactions, today)) {
      if (t.type !== 'expense') continue;
      totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount);
    }
    return totals;
  }, [state.transactions, today]);

  const rows = useMemo(
    () =>
      state.budgets
        .map((b) => {
          const spent = round2(spentByCategory.get(b.categoryId) ?? 0);
          const fraction = b.monthlyLimit > 0 ? spent / b.monthlyLimit : 0;
          return { ...b, spent, fraction, category: categoryById(b.categoryId) };
        })
        .sort((a, b) => b.fraction - a.fraction),
    [state.budgets, spentByCategory, categoryById],
  );

  const unbudgeted = state.categories.filter(
    (c) => c.kind === 'expense' && !state.budgets.some((b) => b.categoryId === c.id),
  );

  return (
    <div className="pb-24 desk:pb-8">
      <header className="px-gutter pb-3 pt-3 desk:pt-6">
        <h1 className="text-lg font-medium text-ink-900 dark:text-ink-50">Budgets</h1>
        <p className="mt-0.5 text-meta text-ink-500 dark:text-ink-400">{monthLabel(today)}</p>
      </header>

      <section className="px-gutter">
        {rows.length === 0 ? (
          <div className="card">
            <h2 className="text-base font-medium text-ink-900 dark:text-ink-50">
              No limits set yet
            </h2>
            <p className="mt-1.5 text-meta leading-snug text-ink-600 dark:text-ink-300">
              A budget is just a number you would rather not pass. Set one on a category you
              want to keep an eye on, and this page will show you where it stands.
            </p>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
              className="btn-primary mt-4"
              disabled={unbudgeted.length === 0}
            >
              <Plus size={18} weight="bold" aria-hidden="true" />
              Set your first budget
            </button>
            {state.transactions.length === 0 && (
              <button
                type="button"
                onClick={onAddTransaction}
                className="btn-quiet mt-2.5 w-full"
              >
                Add a transaction first
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2.5 desk:grid desk:grid-cols-2 desk:gap-3 desk:space-y-0">
            {rows.map((r) => {
              const tone = toneFor(r.fraction);
              const left = round2(r.monthlyLimit - r.spent);
              return (
                <li key={r.categoryId} className="card">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(r.categoryId);
                      setSheetOpen(true);
                    }}
                    className="press w-full text-left"
                    aria-label={`Edit the ${r.category?.name ?? 'category'} budget, ${money(
                      r.spent,
                      currency,
                    )} of ${money(r.monthlyLimit, currency)}, ${tone.state}`}
                  >
                    <div className="flex items-center gap-3">
                      <CategoryTile category={r.category} dark={dark} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-base font-medium text-ink-900 dark:text-ink-50">
                        {r.category?.name ?? 'Uncategorised'}
                      </span>
                      <span className="tnum shrink-0 text-meta text-ink-600 dark:text-ink-300">
                        {money(r.spent, currency)} of {money(r.monthlyLimit, currency)}
                      </span>
                    </div>

                    <div className="mt-2.5">
                      <ProgressBar
                        fraction={r.fraction}
                        tone={tone.colour}
                        label={`${r.category?.name ?? 'Category'}, ${Math.round(
                          r.fraction * 100,
                        )} percent of the limit used`}
                        height={7}
                      />
                    </div>

                    <p className="mt-2 text-meta leading-snug text-ink-600 dark:text-ink-300">
                      {r.fraction > 1 ? (
                        <>
                          This category ran high, {money(Math.abs(left), currency)} past the
                          limit. Want to rebalance?
                        </>
                      ) : r.fraction >= 0.8 ? (
                        <>
                          {money(left, currency)} left. Getting close, and there is still time
                          to steer.
                        </>
                      ) : (
                        <>{money(left, currency)} left this month.</>
                      )}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {rows.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setSheetOpen(true);
            }}
            disabled={unbudgeted.length === 0}
            className="btn-quiet mt-3 w-full desk:max-w-[280px]"
          >
            <Plus size={18} weight="bold" aria-hidden="true" />
            {unbudgeted.length === 0 ? 'Every category has a budget' : 'Add budget'}
          </button>
        )}
      </section>

      <BudgetSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editingCategoryId={editing}
        onRemove={(categoryId) => {
          dispatch({ type: 'budget/remove', categoryId });
          setSheetOpen(false);
        }}
      />
    </div>
  );
}

function BudgetSheet({
  open,
  onClose,
  editingCategoryId,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  editingCategoryId: string | null;
  onRemove: (categoryId: string) => void;
}) {
  const { state, dispatch, categoryById } = useApp();
  const existing = editingCategoryId
    ? state.budgets.find((b) => b.categoryId === editingCategoryId)
    : undefined;

  const available = state.categories.filter(
    (c) =>
      c.kind === 'expense' &&
      (c.id === editingCategoryId || !state.budgets.some((b) => b.categoryId === c.id)),
  );

  const [categoryId, setCategoryId] = useState(editingCategoryId ?? available[0]?.id ?? '');
  const [limit, setLimit] = useState(existing ? String(existing.monthlyLimit) : '');
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  // Re-seed the fields each time the sheet opens on a different budget.
  const openKey = `${open}-${editingCategoryId}`;
  const [lastKey, setLastKey] = useState(openKey);
  if (openKey !== lastKey) {
    setLastKey(openKey);
    setCategoryId(editingCategoryId ?? available[0]?.id ?? '');
    setLimit(existing ? String(existing.monthlyLimit) : '');
    setError(null);
    setKey((k) => k + 1);
  }

  function save() {
    const value = Number.parseFloat(limit);
    if (!categoryId) {
      setError('Pick a category.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a limit above zero.');
      return;
    }
    dispatch({ type: 'budget/set', budget: { categoryId, monthlyLimit: value } });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit budget' : 'Add budget'}
      footer={
        <div className="flex gap-2.5">
          {existing && (
            <button
              type="button"
              onClick={() => onRemove(existing.categoryId)}
              className="press flex min-h-[52px] items-center justify-center gap-2 rounded-field px-4 text-base font-medium text-coral-text dark:text-[#F0B49B]"
              style={{ border: '1px solid var(--hairline)' }}
            >
              <Trash size={18} aria-hidden="true" />
              Remove
            </button>
          )}
          <button type="button" onClick={save} className="btn-primary flex-1">
            {existing ? 'Save' : 'Set budget'}
          </button>
        </div>
      }
    >
      <div key={key} className="grid gap-4 pt-1">
        <div>
          <label htmlFor="budget-category" className="label">
            Category
          </label>
          <select
            id="budget-category"
            data-autofocus
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setError(null);
            }}
            disabled={Boolean(existing)}
            className="field disabled:opacity-60"
          >
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {existing && (
            <p className="mt-1.5 text-meta text-ink-500 dark:text-ink-400">
              Remove this budget to move the limit to a different category.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="budget-limit" className="label">
            Monthly limit
          </label>
          <input
            id="budget-limit"
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value.replace(/[^0-9.]/g, ''));
              setError(null);
            }}
            inputMode="decimal"
            placeholder="0"
            className="field tnum"
          />
          <p className="mt-1.5 text-meta text-ink-500 dark:text-ink-400">
            {categoryById(categoryId)?.name ?? 'This category'} will show a calm bar until you
            reach eighty percent of this.
          </p>
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
