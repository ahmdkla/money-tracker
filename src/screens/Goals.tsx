import { useMemo, useState } from 'react';
import { Coins, Plus, Target, Trash, Trophy } from '@phosphor-icons/react';
import type { SavingsGoal } from '../types';
import { useApp } from '../store/AppContext';
import { allGoalProgress, totalSaved, totalTargeted } from '../lib/goals';
import { money, moneyWhole, percent } from '../lib/format';
import { COLOR_KEYS, tints } from '../lib/palette';
import { CATEGORY_ICON_NAMES, iconFor } from '../components/icons';
import { ProgressBar, SectionHeader, Sheet } from '../components/primitives';

/**
 * Savings goals.
 *
 * Distinct from the monthly set-aside, which is a pacing figure that decides
 * how much of this month is spendable. A goal is a named target with a running
 * total, and it answers "how far off am I" rather than "can I spend today".
 * Folding the two together would make the hero number lurch every time someone
 * added an ambition.
 */
export function Goals({ dark }: { dark: boolean }) {
  const { state, dispatch, today } = useApp();
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [contributing, setContributing] = useState<SavingsGoal | null>(null);

  const progress = useMemo(() => allGoalProgress(state, today), [state, today]);
  const saved = totalSaved(state);
  const targeted = totalTargeted(state);
  const tintSet = tints(dark);

  return (
    <div className="pb-24 desk:pb-8">
      <header className="flex flex-wrap items-center gap-3 px-gutter pb-3 pt-3 desk:pt-6">
        <h1 className="text-xl font-medium text-ink-900 dark:text-ink-50">Savings goals</h1>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
          className="btn-quiet min-h-[44px] px-3 text-meta"
        >
          <Plus size={17} weight="bold" aria-hidden="true" />
          Add goal
        </button>
      </header>

      {progress.length === 0 ? (
        <section className="px-gutter">
          <div className="card">
            <p className="text-base font-medium text-ink-900 dark:text-ink-50">
              Nothing being saved for yet
            </p>
            <p className="mt-1.5 text-meta leading-snug text-ink-600 dark:text-ink-300">
              A goal is a name, a number and a running total. It sits alongside your monthly
              set-aside rather than replacing it, so adding one never changes what you are safe
              to spend today.
            </p>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
              className="btn-primary mt-4"
            >
              <Target size={18} aria-hidden="true" />
              Set your first goal
            </button>
          </div>
        </section>
      ) : (
        <div className="desk:grid desk:grid-cols-3 desk:gap-5 desk:px-gutter">
          <section className="px-gutter desk:col-span-1 desk:px-0">
            <div className="rounded-hero bg-brand px-5 py-5 text-white">
              <p className="text-meta font-medium uppercase tracking-[0.09em] text-mint-soft">
                Put aside so far
              </p>
              <p className="tnum mt-1.5 font-display text-hero-sm">
                {moneyWhole(saved, state.currency)}
              </p>
              <p className="mt-1 text-meta text-mint-soft">
                of {moneyWhole(targeted, state.currency)} across{' '}
                {progress.length === 1 ? 'one goal' : `${progress.length} goals`}
              </p>
              <div className="mt-4 [&>div]:bg-brand-deep">
                <ProgressBar
                  fraction={targeted > 0 ? saved / targeted : 0}
                  tone="#5DCAA5"
                  label={`${percent(targeted > 0 ? saved / targeted : 0)} of everything saved for`}
                  height={5}
                />
              </div>
            </div>
          </section>

          <section className="px-gutter pt-5 desk:col-span-2 desk:px-0 desk:pt-0">
            <SectionHeader title="Goals" />
            <ul className="grid gap-2.5 sm:grid-cols-2 desk:grid-cols-2">
              {progress.map((p) => {
                const tint = tintSet[p.goal.colorKey];
                const Icon = iconFor(p.goal.icon);
                const tone = p.reached ? '#0F6E56' : p.behind ? '#EF9F27' : '#0F6E56';
                return (
                  <li key={p.goal.id} className="card">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]"
                        style={{ backgroundColor: tint.bg, color: tint.fg }}
                        aria-hidden="true"
                      >
                        {p.reached ? <Trophy size={22} /> : <Icon size={22} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-medium text-ink-900 dark:text-ink-50">
                          {p.goal.name}
                        </span>
                        <span className="tnum block text-meta text-ink-500 dark:text-ink-400">
                          {money(p.goal.saved, state.currency)} of{' '}
                          {money(p.goal.target, state.currency)}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-meta font-medium text-ink-700 dark:text-ink-200">
                        {percent(p.fraction)}
                      </span>
                    </div>

                    <div className="mt-3">
                      <ProgressBar
                        fraction={p.fraction}
                        tone={tone}
                        label={`${p.goal.name}, ${percent(p.fraction)} funded`}
                        height={7}
                      />
                    </div>

                    <p className="mt-2 text-meta leading-snug text-ink-600 dark:text-ink-300">
                      {p.reached ? (
                        <>Fully funded. Worth deciding what it is for now.</>
                      ) : p.perMonth !== null && p.monthsLeft !== null ? (
                        <>
                          {money(p.remaining, state.currency)} to go.{' '}
                          {p.monthsLeft === 0
                            ? 'The deadline is this month.'
                            : `${money(p.perMonth, state.currency)} a month across ${p.monthsLeft} ${
                                p.monthsLeft === 1 ? 'month' : 'months'
                              } gets there.`}
                        </>
                      ) : (
                        <>{money(p.remaining, state.currency)} to go.</>
                      )}
                    </p>

                    {p.behind && (
                      <p className="mt-1.5 rounded-chip bg-amber-soft px-2 py-1 text-micro font-medium text-amber-text dark:bg-[#332810] dark:text-[#F0C176]">
                        More than the {money(state.savingsGoalPerMonth, state.currency)} currently
                        set aside each month.
                      </p>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setContributing(p.goal)}
                        className="btn-quiet min-h-[44px] flex-1 px-3 text-meta"
                      >
                        <Coins size={16} aria-hidden="true" />
                        Add money
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(p.goal);
                          setSheetOpen(true);
                        }}
                        className="btn-quiet min-h-[44px] px-3 text-meta"
                      >
                        Edit
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}

      <GoalSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={editing}
        dark={dark}
      />

      <ContributeSheet
        goal={contributing}
        onClose={() => setContributing(null)}
        onAdd={(id, amount) => {
          dispatch({ type: 'goal/contribute', id, amount });
          setContributing(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------- goal form */

function GoalSheet({
  open,
  onClose,
  editing,
  dark,
}: {
  open: boolean;
  onClose: () => void;
  editing: SavingsGoal | null;
  dark: boolean;
}) {
  const { dispatch } = useApp();
  const [draft, setDraft] = useState<SavingsGoal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState('');

  const key = `${open}-${editing?.id ?? 'new'}`;
  if (key !== lastKey) {
    setLastKey(key);
    setError(null);
    setDraft(
      editing ?? {
        id: `goal_${Date.now().toString(36)}`,
        name: '',
        target: 0,
        saved: 0,
        icon: 'PiggyBank',
        colorKey: 'evergreen',
      },
    );
  }

  if (!draft) return null;
  const tintSet = tints(dark);

  function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError('Give the goal a name.');
      return;
    }
    if (!(draft.target > 0)) {
      setError('Set a target above zero.');
      return;
    }
    const clean = { ...draft, name: draft.name.trim() };
    dispatch(editing ? { type: 'goal/update', goal: clean } : { type: 'goal/add', goal: clean });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit goal' : 'New goal'}
      footer={
        <div className="flex gap-2.5">
          {editing && (
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'goal/delete', id: editing.id });
                onClose();
              }}
              className="press flex min-h-[52px] items-center justify-center gap-2 rounded-field px-4 text-base font-medium text-coral-text dark:text-[#F0B49B]"
              style={{ border: '1px solid var(--hairline)' }}
            >
              <Trash size={18} aria-hidden="true" />
              Delete
            </button>
          )}
          <button type="button" onClick={save} className="btn-primary flex-1">
            Save
          </button>
        </div>
      }
    >
      <div className="grid gap-4 pb-4 pt-1">
        <div>
          <label htmlFor="goal-name" className="label">
            What for
          </label>
          <input
            id="goal-name"
            data-autofocus
            value={draft.name}
            onChange={(e) => {
              setDraft({ ...draft, name: e.target.value });
              setError(null);
            }}
            placeholder="Emergency fund, new laptop, a trip"
            className="field"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="goal-target" className="label">
              Target
            </label>
            <input
              id="goal-target"
              value={String(draft.target || '')}
              onChange={(e) => {
                setDraft({
                  ...draft,
                  target: Number.parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0,
                });
                setError(null);
              }}
              inputMode="decimal"
              placeholder="0"
              className="field tnum"
            />
          </div>
          <div>
            <label htmlFor="goal-saved" className="label">
              Already put aside
            </label>
            <input
              id="goal-saved"
              value={String(draft.saved || '')}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  saved: Number.parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0,
                })
              }
              inputMode="decimal"
              placeholder="0"
              className="field tnum"
            />
          </div>
        </div>

        <div>
          <label htmlFor="goal-deadline" className="label">
            By when <span className="font-normal text-ink-400">optional</span>
          </label>
          <input
            id="goal-deadline"
            type="date"
            value={draft.deadline ?? ''}
            onChange={(e) => setDraft({ ...draft, deadline: e.target.value || undefined })}
            className="field tnum"
          />
          <p className="mt-1.5 text-meta text-ink-500 dark:text-ink-400">
            With a date, the app works out what has to go in each month.
          </p>
        </div>

        <fieldset>
          <legend className="label">Colour</legend>
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

        <fieldset>
          <legend className="label">Icon</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {CATEGORY_ICON_NAMES.slice(0, 21).map((name) => {
              const Icon = iconFor(name);
              const on = draft.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={name}
                  onClick={() => setDraft({ ...draft, icon: name })}
                  className={`press flex h-11 items-center justify-center rounded-chip ${
                    on
                      ? 'bg-brand text-white dark:bg-mint dark:text-brand'
                      : 'text-ink-600 dark:text-ink-300'
                  }`}
                  style={on ? undefined : { border: '1px solid var(--hairline)' }}
                >
                  <Icon size={19} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-meta font-medium text-coral-text dark:text-[#F0B49B]">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------- contribution */

function ContributeSheet({
  goal,
  onClose,
  onAdd,
}: {
  goal: SavingsGoal | null;
  onClose: () => void;
  onAdd: (id: string, amount: number) => void;
}) {
  const { state } = useApp();
  const [amount, setAmount] = useState('');
  const [lastId, setLastId] = useState<string | null>(null);

  // Normalise both sides. Comparing `goal?.id` (undefined when closed) against
  // a null initial value is true forever, which sets state on every render and
  // trips React's re-render limit.
  const currentId = goal?.id ?? null;
  if (currentId !== lastId) {
    setLastId(currentId);
    setAmount('');
  }

  if (!goal) return null;
  const value = Number.parseFloat(amount) || 0;

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Add to ${goal.name}`}
      description="Records what you have put aside. It does not move money between accounts on its own."
      footer={
        <button
          type="button"
          onClick={() => onAdd(goal.id, value)}
          disabled={value <= 0}
          className="btn-primary"
        >
          Add {value > 0 ? money(value, state.currency) : ''}
        </button>
      }
    >
      <div className="pb-4 pt-1">
        <label htmlFor="goal-add" className="label">
          Amount
        </label>
        <input
          id="goal-add"
          data-autofocus
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          inputMode="decimal"
          placeholder="0"
          className="field tnum"
        />
        <p className="mt-2 text-meta text-ink-500 dark:text-ink-400">
          Currently {money(goal.saved, state.currency)} of {money(goal.target, state.currency)}.
        </p>
      </div>
    </Sheet>
  );
}
