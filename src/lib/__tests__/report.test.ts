import { describe, expect, it } from 'vitest';
import { createSeedState } from '../seed';
import { buildMonthlyReport, monthsWithRecords } from '../report';
import { renderMonthlyReport, reportFileName } from '../reportPdf';
import { A4, Pdf, measure, rgb, truncate } from '../pdf';
import { money, moneyWhole, percent, setFormatLocale } from '../format';
import { monthLabel } from '../date';
import { translate } from '../i18n';

const TODAY = new Date(2026, 7, 19, 10, 0, 0);
const THIS_MONTH = new Date(2026, 7, 1);
const LAST_MONTH = new Date(2026, 6, 1);

/* ------------------------------------------------------------ the writer -- */

describe('the pdf writer', () => {
  it('produces something a reader will recognise', () => {
    const pdf = new Pdf();
    pdf.text('Halo', 40, 40);
    const text = new TextDecoder('latin1').decode(pdf.toBytes());

    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Type /Pages');
    expect(text).toContain('/Type /Page');
    expect(text).toContain('/BaseFont /Helvetica');
    expect(text).toContain('(Halo) Tj');
  });

  it('records byte offsets a reader can actually seek to', () => {
    const pdf = new Pdf();
    pdf.text('x', 10, 10);
    pdf.newPage();
    pdf.text('y', 10, 10);

    const bytes = pdf.toBytes();
    const text = new TextDecoder('latin1').decode(bytes);

    // Every offset in the table must land on the object it claims to.
    const table = text.slice(text.indexOf('xref'));
    const offsets = [...table.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(4);

    offsets.forEach((offset, i) => {
      expect(text.slice(offset, offset + 20)).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });

    // And startxref must point at the table itself.
    const startxref = Number(text.slice(text.lastIndexOf('startxref') + 9).trim().split('\n')[0]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
  });

  it('counts every page it was given', () => {
    const pdf = new Pdf();
    pdf.newPage();
    pdf.newPage();
    expect(pdf.pageCount).toBe(3);
    const text = new TextDecoder('latin1').decode(pdf.toBytes());
    expect(text).toContain('/Count 3');
  });

  it('is one byte per character, so the offsets mean what they say', () => {
    const pdf = new Pdf();
    pdf.text('Rp 25.000 · Kopi', 20, 20);
    const bytes = pdf.toBytes();
    expect(bytes.every((b) => b <= 0xff)).toBe(true);
  });

  it('escapes the characters that would end a string early', () => {
    const pdf = new Pdf();
    pdf.text('Toko (lama) \\ baru', 10, 10);
    const text = new TextDecoder('latin1').decode(pdf.toBytes());
    expect(text).toContain('(Toko \\(lama\\) \\\\ baru) Tj');
  });

  it('folds typographic characters rather than dropping them', () => {
    const pdf = new Pdf();
    pdf.text('Ani’s — “kopi”', 10, 10);
    const text = new TextDecoder('latin1').decode(pdf.toBytes());
    expect(text).toContain("(Ani's - \"kopi\") Tj");
  });

  it('replaces what the encoding genuinely cannot carry', () => {
    const pdf = new Pdf();
    pdf.text('kopi 🙂', 10, 10);
    const text = new TextDecoder('latin1').decode(pdf.toBytes());
    expect(text).toContain('(kopi ?) Tj');
  });

  it('measures a string the way the font does', () => {
    // Helvetica sets a digit at 556 thousandths, so ten of them at 10pt is 55.6.
    expect(measure('0123456789', 10)).toBeCloseTo(55.6, 3);
    expect(measure('', 10)).toBe(0);
    // Bold is wider than regular for letters, and identical for digits.
    expect(measure('abc', 10, 'bold')).toBeGreaterThan(measure('abc', 10));
    expect(measure('123', 10, 'bold')).toBeCloseTo(measure('123', 10), 5);
  });

  it('truncates only what does not fit, and marks that it did', () => {
    const long = 'Warung dekat rumah sebelah pasar';
    expect(truncate(long, 1000, 9)).toBe(long);

    const cut = truncate(long, 60, 9);
    expect(cut.endsWith('...')).toBe(true);
    expect(measure(cut, 9)).toBeLessThanOrEqual(60);
  });

  it('reads a hex colour the way css does', () => {
    expect(rgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(rgb('#FFFFFF')).toEqual({ r: 1, g: 1, b: 1 });
    const brand = rgb('#0E3A2F');
    expect(brand.r).toBeCloseTo(14 / 255, 5);
  });

  it('right aligns by pulling the text back its own width', () => {
    const pdf = new Pdf();
    pdf.text('123', 100, 50, { size: 10, align: 'right' });
    const text = new TextDecoder('latin1').decode(pdf.toBytes());
    // 100 less the width of "123" at 10pt, which is 16.68.
    expect(text).toContain('1 0 0 1 83.32');
  });

  it('draws a rectangle measured from the top, like the layout code thinks', () => {
    const pdf = new Pdf();
    pdf.rect(10, 20, 100, 5, rgb('#000000'));
    const text = new TextDecoder('latin1').decode(pdf.toBytes());
    // y 20 from the top of an A4 page, 5 tall, is 841.89 - 25 from the bottom.
    expect(text).toContain(`10 ${String(Math.round((A4.height - 25) * 100) / 100)} 100 5 re f`);
  });

  it('ignores a rectangle with no area rather than emitting a broken one', () => {
    const pdf = new Pdf();
    pdf.rect(10, 10, 0, 5, rgb('#000000'));
    pdf.rect(10, 10, -4, 5, rgb('#000000'));
    const text = new TextDecoder('latin1').decode(pdf.toBytes());
    expect(text).not.toContain('re f');
  });
});

/* ------------------------------------------------------------ the numbers -- */

describe('the monthly report', () => {
  const state = createSeedState(TODAY);

  it('adds up the month it was asked for', () => {
    const r = buildMonthlyReport(state, THIS_MONTH, TODAY);
    expect(r.income).toBe(12_000_000);
    expect(r.expense).toBe(8_751_000);
    expect(r.net).toBe(3_249_000);
    expect(r.fixedBills).toBe(3_620_000);
  });

  it('knows the month in progress is not finished', () => {
    expect(buildMonthlyReport(state, THIS_MONTH, TODAY).partial).toBe(true);
    expect(buildMonthlyReport(state, LAST_MONTH, TODAY).partial).toBe(false);
  });

  it('agrees with the figure on the home screen', () => {
    const r = buildMonthlyReport(state, THIS_MONTH, TODAY);
    // The report must not invent its own arithmetic: same pot, same spend.
    expect(r.spendable).toBe(6_880_000);
    expect(r.spent).toBe(5_131_000);
    expect(r.remaining).toBe(1_749_000);
  });

  it('shares out the categories to a whole', () => {
    const r = buildMonthlyReport(state, THIS_MONTH, TODAY);
    const total = r.categories.reduce((s, c) => s + c.share, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(r.categories[0].name).toBe('Sewa');
  });

  it('sorts the budgets by how close they are to the line', () => {
    const r = buildMonthlyReport(state, THIS_MONTH, TODAY);
    for (let i = 1; i < r.budgets.length; i++) {
      expect(r.budgets[i - 1].fraction).toBeGreaterThanOrEqual(r.budgets[i].fraction);
    }
  });

  it('lists the transactions oldest first, the way a statement reads', () => {
    const r = buildMonthlyReport(state, THIS_MONTH, TODAY);
    expect(r.transactions.length).toBeGreaterThan(0);
    for (let i = 1; i < r.transactions.length; i++) {
      expect(+r.transactions[i].date).toBeGreaterThanOrEqual(+r.transactions[i - 1].date);
    }
  });

  it('leaves out a bill that has not happened yet, in a month still running', () => {
    const r = buildMonthlyReport(state, THIS_MONTH, TODAY);
    // Rent is dated the 22nd and today is the 19th.
    expect(r.transactions.some((t) => t.note === 'Sewa kos')).toBe(false);
    // But it is still counted as a fixed bill of the month, as it is elsewhere.
    expect(r.fixedBills).toBeGreaterThan(2_800_000);
  });

  it('includes everything in a month that has finished', () => {
    const r = buildMonthlyReport(state, LAST_MONTH, TODAY);
    expect(r.transactions.some((t) => t.note === 'Sewa kos')).toBe(true);
  });

  it('carries the accounts and the goals', () => {
    const r = buildMonthlyReport(state, THIS_MONTH, TODAY);
    expect(r.accounts.map((a) => a.name)).toContain('Rekening utama');
    expect(r.goals.map((g) => g.name)).toContain('Dana darurat');
  });

  it('reports an empty month as empty rather than failing', () => {
    const r = buildMonthlyReport(state, new Date(2019, 0, 1), TODAY);
    expect(r.transactions).toHaveLength(0);
    expect(r.income).toBe(0);
    expect(r.expense).toBe(0);
    expect(r.categories).toHaveLength(0);
  });

  it('offers the months there is something to say about, newest first', () => {
    const months = monthsWithRecords(state, TODAY);
    expect(months.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < months.length; i++) {
      expect(+months[i - 1]).toBeGreaterThan(+months[i]);
    }
    // The current month is always on the list, even before anything is in it.
    expect(months.some((m) => m.getFullYear() === 2026 && m.getMonth() === 7)).toBe(true);
  });

  it('never offers a month that has not happened yet', () => {
    // Bills are expanded ahead so the forecast has something to draw, which
    // puts real records in September and October. Neither is a month anyone
    // can report on from here.
    const withFuture = {
      ...state,
      transactions: [
        ...state.transactions,
        {
          id: 'tx_ahead',
          amount: 2_800_000,
          type: 'expense' as const,
          categoryId: 'cat_rent',
          note: 'Sewa kos',
          date: new Date(2026, 9, 22).toISOString(),
          recurring: true,
        },
      ],
    };
    const months = monthsWithRecords(withFuture, TODAY);
    expect(months.every((m) => +m <= +new Date(2026, 7, 1))).toBe(true);
    expect(months[0].getMonth()).toBe(7);
  });
});

/* ------------------------------------------------------------ the drawing -- */

describe('rendering the report', () => {
  setFormatLocale('id-ID');
  const state = createSeedState(TODAY);

  const strings = {
    t: (k: string, v?: Record<string, string | number>) => translate('id', k, v),
    money: (v: number) => money(v, 'IDR'),
    moneyWhole: (v: number) => moneyWhole(v, 'IDR'),
    monthLabel: (d: Date) => monthLabel(d, 'id-ID'),
    dayLabel: (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
    timeLabel: (d: Date) => d.toLocaleTimeString('id-ID'),
    percent,
  };

  it('runs to more than one page once a month of transactions is in it', () => {
    const r = buildMonthlyReport(state, LAST_MONTH, TODAY);
    const pdf = renderMonthlyReport(r, strings);
    expect(pdf.pageCount).toBeGreaterThan(1);
  });

  it('puts a footer on every page, numbered to the total', () => {
    const r = buildMonthlyReport(state, LAST_MONTH, TODAY);
    const pdf = renderMonthlyReport(r, strings);
    const text = new TextDecoder('latin1').decode(pdf.toBytes());
    for (let page = 1; page <= pdf.pageCount; page++) {
      expect(text).toContain(`(Halaman ${page} dari ${pdf.pageCount}) Tj`);
    }
  });

  it('writes the figures somebody would check first', () => {
    const r = buildMonthlyReport(state, THIS_MONTH, TODAY);
    const text = new TextDecoder('latin1').decode(renderMonthlyReport(r, strings).toBytes());
    expect(text).toContain('(Laporan bulanan) Tj');
    expect(text).toContain('(Agustus 2026) Tj');
    expect(text).toContain('(Sewa) Tj');
  });

  it('survives a month with nothing in it', () => {
    const r = buildMonthlyReport(state, new Date(2019, 0, 1), TODAY);
    const pdf = renderMonthlyReport(r, strings);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
    const text = new TextDecoder('latin1').decode(pdf.toBytes());
    expect(text).toContain('(Tidak ada catatan di bulan ini.) Tj');
  });

  it('names the file so a folder of them sorts by date', () => {
    const r = buildMonthlyReport(state, THIS_MONTH, TODAY);
    expect(reportFileName(r, 'laporan')).toBe('manimani-laporan-2026-08.pdf');
    expect(reportFileName(buildMonthlyReport(state, LAST_MONTH, TODAY), 'report')).toBe(
      'manimani-report-2026-07.pdf',
    );
  });
});
