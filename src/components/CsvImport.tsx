import { useCallback, useMemo, useRef, useState } from 'react';
import { CheckCircle, FileArrowUp, Warning } from '@phosphor-icons/react';
import { useApp } from '../store/AppContext';
import {
  buildDrafts,
  draftsToTransactions,
  guessColumns,
  parseCsv,
  type ColumnMap,
  type DateOrder,
  type DraftRow,
} from '../lib/csv';
import { money } from '../lib/format';
import { tints } from '../lib/palette';
import { Sheet } from './primitives';

type Stage = 'pick' | 'map' | 'done';

/**
 * Bank CSV import.
 *
 * Three steps, and the middle one is the point: show the guess, let it be
 * corrected, and preview exactly what will be added before anything is. Rows
 * that already exist are found and unticked rather than silently merged, and
 * a row with no category is held back rather than dumped somewhere wrong.
 */
export function CsvImport({
  open,
  onClose,
  dark,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  dark: boolean;
  notify: (message: string, tone?: 'neutral' | 'warning') => void;
}) {
  const { state, dispatch } = useApp();
  const [stage, setStage] = useState<Stage>('pick');
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [rejected, setRejected] = useState<{ rowIndex: number; reason: string }[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStage('pick');
    setRows([]);
    setMap(null);
    setDrafts([]);
    setRejected([]);
    setFileName('');
    setError(null);
    setAdded(0);
  }, []);

  const rebuild = useCallback(
    (nextRows: string[][], nextMap: ColumnMap) => {
      const built = buildDrafts(nextRows, nextMap, state.categories, state.transactions);
      setDrafts(built.drafts);
      setRejected(built.rejected);
    },
    [state.categories, state.transactions],
  );

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCsv(String(reader.result));
        if (parsed.length < 2) {
          setError('That file has no rows in it that we could read.');
          return;
        }
        const guessed = guessColumns(parsed);
        setRows(parsed);
        setMap(guessed);
        rebuild(parsed, guessed);
        setStage('map');
      } catch {
        setError('That file could not be read as a CSV.');
      }
    };
    reader.onerror = () => setError('That file could not be read.');
    reader.readAsText(file);
  }

  function updateMap(patch: Partial<ColumnMap>) {
    if (!map) return;
    const next = { ...map, ...patch };
    setMap(next);
    rebuild(rows, next);
  }

  const headers = useMemo(() => {
    if (!rows.length) return [];
    return map?.hasHeader
      ? rows[0].map((h, i) => h.trim() || `Column ${i + 1}`)
      : rows[0].map((_, i) => `Column ${i + 1}`);
  }, [rows, map]);

  const ready = drafts.filter((d) => d.include && d.categoryId);
  const needsCategory = drafts.filter((d) => d.include && !d.categoryId);
  const duplicates = drafts.filter((d) => d.duplicateOf);
  const tintSet = tints(dark);

  function commit() {
    const txs = draftsToTransactions(drafts);
    if (txs.length === 0) {
      setError('Nothing is selected to import.');
      return;
    }
    dispatch({ type: 'tx/add-many', transactions: txs });
    setAdded(txs.length);
    setStage('done');
    notify(`Imported ${txs.length} ${txs.length === 1 ? 'transaction' : 'transactions'}`);
  }

  const setDraft = (i: number, patch: Partial<DraftRow>) =>
    setDrafts((d) => d.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={stage === 'done' ? 'Imported' : 'Import from your bank'}
      description={
        stage === 'pick'
          ? 'Export a CSV from your bank, then bring a whole month across at once.'
          : stage === 'map'
            ? 'Check the columns look right before anything is added.'
            : undefined
      }
      footer={
        stage === 'map' ? (
          <div className="flex gap-2.5">
            <button type="button" onClick={reset} className="btn-quiet flex-1">
              Start over
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={ready.length === 0}
              className="btn-primary flex-1"
            >
              Import {ready.length > 0 ? ready.length : ''}
            </button>
          </div>
        ) : stage === 'done' ? (
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="btn-primary"
          >
            Done
          </button>
        ) : undefined
      }
    >
      {/* Step 1: pick a file ------------------------------------------ */}
      {stage === 'pick' && (
        <div className="pb-6 pt-1">
          <button
            type="button"
            data-autofocus
            onClick={() => fileInput.current?.click()}
            className="press flex w-full flex-col items-center gap-2 rounded-card px-4 py-8 text-center"
            style={{ border: '1px dashed var(--hairline)' }}
          >
            <FileArrowUp size={28} className="text-ink-500 dark:text-ink-400" aria-hidden="true" />
            <span className="text-base font-medium text-ink-900 dark:text-ink-50">
              Choose a CSV file
            </span>
            <span className="text-meta text-ink-500 dark:text-ink-400">
              Most banks have an Export or Download button on the statements page.
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={onFile}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />

          <p className="mt-4 text-meta leading-snug text-ink-500 dark:text-ink-400">
            The file is read here in your browser and never uploaded anywhere. Dates and amounts
            are detected automatically, and anything already recorded is spotted and left out.
          </p>

          {error && (
            <p role="alert" className="mt-3 text-meta font-medium text-coral-text dark:text-[#F0B49B]">
              {error}
            </p>
          )}
        </div>
      )}

      {/* Step 2: map and preview -------------------------------------- */}
      {stage === 'map' && map && (
        <div className="pb-4 pt-1">
          <p className="mb-3 truncate text-meta text-ink-500 dark:text-ink-400">{fileName}</p>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <ColumnPicker
              id="csv-date"
              label="Date column"
              headers={headers}
              value={map.date}
              onChange={(v) => updateMap({ date: v })}
            />
            <ColumnPicker
              id="csv-desc"
              label="Description column"
              headers={headers}
              value={map.description}
              onChange={(v) => updateMap({ description: v })}
            />
            <ColumnPicker
              id="csv-amount"
              label="Amount column"
              headers={headers}
              value={map.amount}
              onChange={(v) => updateMap({ amount: v })}
              allowNone
              noneLabel="Separate in and out columns"
            />
            <div>
              <label htmlFor="csv-order" className="label">
                Date format
              </label>
              <select
                id="csv-order"
                value={map.dateOrder}
                onChange={(e) => updateMap({ dateOrder: e.target.value as DateOrder })}
                className="field"
              >
                <option value="auto">Detect automatically</option>
                <option value="dmy">Day first (31/12/2026)</option>
                <option value="mdy">Month first (12/31/2026)</option>
                <option value="ymd">Year first (2026-12-31)</option>
              </select>
            </div>

            {map.amount < 0 && (
              <>
                <ColumnPicker
                  id="csv-debit"
                  label="Money out column"
                  headers={headers}
                  value={map.debit}
                  onChange={(v) => updateMap({ debit: v })}
                  allowNone
                />
                <ColumnPicker
                  id="csv-credit"
                  label="Money in column"
                  headers={headers}
                  value={map.credit}
                  onChange={(v) => updateMap({ credit: v })}
                  allowNone
                />
              </>
            )}
          </div>

          {map.amount >= 0 && (
            <label className="mt-3 flex min-h-[44px] items-center gap-2.5 text-meta">
              <input
                type="checkbox"
                checked={map.positiveIsExpense}
                onChange={(e) => updateMap({ positiveIsExpense: e.target.checked })}
                className="h-5 w-5 accent-brand-mid"
              />
              <span className="text-ink-700 dark:text-ink-200">
                A positive number in this column means money going out
              </span>
            </label>
          )}

          <label className="mt-1 flex min-h-[44px] items-center gap-2.5 text-meta">
            <input
              type="checkbox"
              checked={map.hasHeader}
              onChange={(e) => updateMap({ hasHeader: e.target.checked })}
              className="h-5 w-5 accent-brand-mid"
            />
            <span className="text-ink-700 dark:text-ink-200">The first row is column names</span>
          </label>

          {/* Summary --------------------------------------------------- */}
          <div className="mt-4 grid gap-1.5">
            <Note tone="good">
              {ready.length} ready to import
              {duplicates.length > 0 ? `, ${duplicates.length} already recorded and unticked` : ''}
            </Note>
            {needsCategory.length > 0 && (
              <Note tone="warn">
                {needsCategory.length} could not be matched to a category. Pick one below, or
                untick them. Nothing is imported without a category.
              </Note>
            )}
            {rejected.length > 0 && (
              <Note tone="warn">
                {rejected.length} rows could not be read: {rejected[0].reason}
              </Note>
            )}
          </div>

          {/* Preview --------------------------------------------------- */}
          <h3 className="mb-1.5 mt-4 text-meta font-medium uppercase tracking-[0.07em] text-ink-500 dark:text-ink-400">
            Preview
          </h3>
          <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
            {drafts.slice(0, 60).map((d, i) => {
              const cat = d.categoryId ? state.categories.find((c) => c.id === d.categoryId) : null;
              return (
                <li key={i} className="flex items-start gap-2.5 py-2">
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={(e) => setDraft(i, { include: e.target.checked })}
                    aria-label={`Include ${d.description || 'row'}`}
                    className="mt-2.5 h-5 w-5 shrink-0 accent-brand-mid"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-meta font-medium text-ink-900 dark:text-ink-50">
                        {d.description || 'No description'}
                      </span>
                      <span
                        className={`tnum shrink-0 text-meta font-medium ${
                          d.type === 'income'
                            ? 'text-brand-mid dark:text-mint'
                            : 'text-ink-900 dark:text-ink-50'
                        }`}
                      >
                        {d.type === 'income' ? '+' : '-'}
                        {money(d.amount, state.currency)}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-micro text-ink-500 dark:text-ink-400">
                      <span className="tnum">{d.date.toLocaleDateString('en-US')}</span>
                      {d.duplicateOf && (
                        <span className="rounded-chip bg-amber-soft px-1.5 font-medium text-amber-text dark:bg-[#332810] dark:text-[#F0C176]">
                          Already recorded
                        </span>
                      )}
                    </p>
                    <select
                      value={d.categoryId ?? ''}
                      onChange={(e) => setDraft(i, { categoryId: e.target.value || null })}
                      aria-label={`Category for ${d.description || 'row'}`}
                      className="mt-1.5 w-full rounded-chip px-2 py-1.5 text-micro"
                      style={{
                        border: '1px solid var(--hairline)',
                        backgroundColor: cat ? tintSet[cat.colorKey].bg : 'transparent',
                        color: cat ? tintSet[cat.colorKey].fg : undefined,
                      }}
                    >
                      <option value="">Pick a category</option>
                      {state.categories
                        .filter((c) => c.kind === d.type)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
          {drafts.length > 60 && (
            <p className="pt-2 text-meta text-ink-500 dark:text-ink-400">
              Showing the first 60 of {drafts.length}. All of the ticked rows are imported.
            </p>
          )}

          {error && (
            <p role="alert" className="mt-3 text-meta font-medium text-coral-text dark:text-[#F0B49B]">
              {error}
            </p>
          )}
        </div>
      )}

      {/* Step 3: done -------------------------------------------------- */}
      {stage === 'done' && (
        <div className="pb-6 pt-2">
          <p className="flex h-12 w-12 items-center justify-center rounded-full bg-mint-soft text-brand dark:bg-brand-mid dark:text-white">
            <CheckCircle size={24} aria-hidden="true" />
          </p>
          <p className="mt-3 text-base leading-snug text-ink-800 dark:text-ink-100">
            {added} {added === 1 ? 'transaction' : 'transactions'} added. Your safe to spend
            number has been recalculated.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function ColumnPicker({
  id,
  label,
  headers,
  value,
  onChange,
  allowNone,
  noneLabel = 'Not in this file',
}: {
  id: string;
  label: string;
  headers: string[];
  value: number;
  onChange: (v: number) => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="field"
      >
        {allowNone && <option value={-1}>{noneLabel}</option>}
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}

function Note({ tone, children }: { tone: 'good' | 'warn'; children: React.ReactNode }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-field px-3 py-2 text-meta leading-snug ${
        tone === 'good'
          ? 'bg-mint-soft/40 text-brand dark:bg-[#15342A] dark:text-[#8EDCBC]'
          : 'bg-amber-soft text-amber-text dark:bg-[#332810] dark:text-[#F0C176]'
      }`}
    >
      {tone === 'good' ? (
        <CheckCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      ) : (
        <Warning size={15} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
      )}
      {children}
    </p>
  );
}
