import { useMemo, useState } from 'react';
import { CheckCircle, CircleNotch, DownloadSimple, FilePdf } from '@phosphor-icons/react';
import { useApp } from '../store/AppContext';
import { buildMonthlyReport, monthsWithRecords } from '../lib/report';
import { renderMonthlyReport, reportFileName } from '../lib/reportPdf';
import { money, moneyWhole, percent } from '../lib/format';
import { monthLabel } from '../lib/date';
import { Sheet, VisuallyHidden } from './primitives';

/**
 * Download a month as a PDF.
 *
 * One choice, the month, because everything else has a right answer. The list
 * of what is in it is not a set of switches: a report you have to configure is
 * a report you put off, and leaving a section out only makes it less useful
 * later when you are trying to remember what happened.
 */
export function ReportSheet({
  open,
  onClose,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  notify: (message: string, tone?: 'neutral' | 'warning') => void;
}) {
  const { state, today, t, locale } = useApp();
  const [busy, setBusy] = useState(false);

  const months = useMemo(() => monthsWithRecords(state, today), [state, today]);
  const [pickedKey, setPickedKey] = useState('');

  // Re-seed on each open, so it always offers the current month first.
  const openKey = `${open}-${months[0]?.getTime() ?? 0}`;
  const [lastOpenKey, setLastOpenKey] = useState('');
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    setPickedKey(String(months[0]?.getTime() ?? ''));
  }

  const picked = months.find((m) => String(m.getTime()) === pickedKey) ?? months[0];

  const preview = useMemo(
    () => (picked ? buildMonthlyReport(state, picked, today) : null),
    [state, picked, today],
  );

  async function download() {
    if (!picked || !preview || busy) return;
    setBusy(true);
    try {
      const pdf = renderMonthlyReport(preview, {
        t,
        money: (v) => money(v, state.currency),
        moneyWhole: (v) => moneyWhole(v, state.currency),
        monthLabel: (d) => monthLabel(d, locale),
        dayLabel: (d) =>
          d.toLocaleDateString(locale, { day: 'numeric', month: 'short', weekday: 'short' }),
        timeLabel: (d) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        percent,
      });

      const url = URL.createObjectURL(pdf.toBlob());
      const link = document.createElement('a');
      link.href = url;
      link.download = reportFileName(preview, t('report.fileWord'));
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked on the next turn of the loop: Safari needs the object to still
      // exist when the click is handled.
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);

      notify(t('report.done'));
      onClose();
    } catch {
      notify(t('report.failed'), 'warning');
    } finally {
      setBusy(false);
    }
  }

  const emptyMonth = preview !== null && preview.transactions.length === 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('report.sheetTitle')}
      description={t('report.sheetSubtitle')}
      footer={
        <button
          type="button"
          onClick={() => void download()}
          disabled={busy || !picked}
          className="btn-primary"
        >
          {busy ? (
            <>
              <CircleNotch size={18} className="animate-spin" aria-hidden="true" />
              {t('report.building')}
            </>
          ) : (
            <>
              <DownloadSimple size={18} aria-hidden="true" />
              {t('report.download')}
            </>
          )}
        </button>
      }
    >
      <div className="pb-4 pt-1">
        <label htmlFor="report-month" className="label">
          {t('report.month')}
        </label>
        <select
          id="report-month"
          data-autofocus
          value={pickedKey}
          onChange={(e) => setPickedKey(e.target.value)}
          className="field"
        >
          {months.map((m) => (
            <option key={m.getTime()} value={String(m.getTime())}>
              {monthLabel(m, locale)}
            </option>
          ))}
        </select>

        {preview && (
          <p className="mt-1.5 text-meta text-ink-500 dark:text-ink-400" aria-live="polite">
            {emptyMonth
              ? t('report.empty', { month: monthLabel(preview.month, locale) })
              : t('report.count', { count: preview.transactions.length })}
          </p>
        )}

        <div
          className="mt-4 flex items-start gap-3 rounded-card px-3.5 py-3"
          style={{ border: '1px solid var(--hairline)' }}
        >
          <FilePdf
            size={20}
            className="mt-0.5 shrink-0 text-brand-mid dark:text-mint"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-meta font-medium text-ink-900 dark:text-ink-50">
              {t('report.includes')}
            </p>
            <ul className="mt-1.5 grid gap-1">
              {[
                'report.includesSummary',
                'report.includesCategories',
                'report.includesAccounts',
                'report.includesTransactions',
              ].map((key) => (
                <li
                  key={key}
                  className="flex items-start gap-1.5 text-meta leading-snug text-ink-600 dark:text-ink-300"
                >
                  <CheckCircle
                    size={13}
                    className="mt-[3px] shrink-0 text-brand-mid dark:text-mint"
                    aria-hidden="true"
                  />
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {preview?.partial && (
          <p className="mt-3 text-meta leading-snug text-ink-500 dark:text-ink-400">
            {t('report.partial')}
          </p>
        )}
      </div>

      <VisuallyHidden>{t('report.sheetSubtitle')}</VisuallyHidden>
    </Sheet>
  );
}
