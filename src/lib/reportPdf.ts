import { A4, Pdf, rgb, truncate, type Colour } from './pdf';
import type { MonthlyReport, ReportTransactionRow } from './report';

/**
 * The monthly report, set on A4.
 *
 * Wording and number formatting come in from the caller, so this module knows
 * nothing about the current language and stays a pure function of its inputs.
 *
 * The layout follows the app: an evergreen band at the top, hairlines instead
 * of boxes, figures flush right, and no colour carrying meaning on its own.
 */

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface ReportStrings {
  t: Translate;
  /** Full amount, with the minor unit where the currency has one. */
  money: (amount: number) => string;
  /** Rounded, for tables where the pennies are noise. */
  moneyWhole: (amount: number) => string;
  monthLabel: (d: Date) => string;
  dayLabel: (d: Date) => string;
  timeLabel: (d: Date) => string;
  percent: (fraction: number) => string;
}

/* ------------------------------------------------------------- the palette */

const INK = rgb('#141817');
const MUTED = rgb('#565D5A');
const FAINT = rgb('#9AA29E');
const HAIRLINE = rgb('#DDE1DF');
const BRAND = rgb('#0E3A2F');
const BRAND_MID = rgb('#0F6E56');
const MINT = rgb('#5DCAA5');
const AMBER = rgb('#EF9F27');
const CORAL = rgb('#C4552B');
const PAPER = rgb('#FFFFFF');
const TRACK = rgb('#EDEFEE');

/* -------------------------------------------------------------- the layout */

const MARGIN = 46;
const CONTENT = A4.width - MARGIN * 2;
const BOTTOM = A4.height - 58;

const BAND = 96;
const TITLE = 19;
const HEADING = 9;
const BODY = 9.5;
const SMALL = 8;

class Sheet {
  readonly pdf = new Pdf(A4);
  y = 0;

  /** Starts a page and returns the y the content should begin at. */
  private fresh(): void {
    this.y = MARGIN + 6;
  }

  /** Makes sure `needed` points are left, starting a page if they are not. */
  room(needed: number): void {
    if (this.y + needed <= BOTTOM) return;
    this.pdf.newPage();
    this.fresh();
  }

  gap(points: number): void {
    this.y += points;
  }

  heading(text: string): void {
    this.room(38);
    this.pdf.text(text.toUpperCase(), MARGIN, this.y + 8, {
      size: HEADING,
      weight: 'bold',
      colour: MUTED,
    });
    this.y += 13;
    this.pdf.rule(MARGIN, this.y, CONTENT, HAIRLINE);
    this.y += 13;
  }

  /** One line of a table: a label on the left, figures on the right. */
  row(draw: () => void, height = 16): void {
    this.room(height);
    draw();
    this.y += height;
  }
}

/** A thin progress bar, with the track always drawn so zero still reads. */
function bar(sheet: Sheet, x: number, y: number, width: number, fraction: number, colour: Colour) {
  sheet.pdf.rect(x, y, width, 2.5, TRACK);
  const filled = Math.max(0, Math.min(1, fraction)) * width;
  if (filled > 0) sheet.pdf.rect(x, y, filled, 2.5, colour);
}

function toneFor(fraction: number): Colour {
  if (fraction > 1) return CORAL;
  if (fraction >= 0.8) return AMBER;
  return BRAND_MID;
}

/* ---------------------------------------------------------------- sections */

function cover(sheet: Sheet, report: MonthlyReport, s: ReportStrings): void {
  const { pdf } = sheet;

  pdf.rect(0, 0, A4.width, BAND, BRAND);
  pdf.text(s.t('app.name'), MARGIN, 34, { size: 11, weight: 'bold', colour: PAPER });
  pdf.text(s.t('app.slogan'), MARGIN, 47, { size: SMALL, colour: MINT });

  pdf.text(s.t('report.title'), MARGIN, 76, { size: TITLE, weight: 'bold', colour: PAPER });
  pdf.text(s.monthLabel(report.month), A4.width - MARGIN, 76, {
    size: TITLE,
    colour: MINT,
    align: 'right',
  });

  sheet.y = BAND + 26;

  if (report.partial) {
    pdf.text(s.t('report.partial'), MARGIN, sheet.y, { size: SMALL, colour: FAINT });
    sheet.y += 18;
  }
}

/** The six figures the month comes down to, in two columns. */
function summary(sheet: Sheet, report: MonthlyReport, s: ReportStrings): void {
  sheet.heading(s.t('report.summary'));

  const figures: [string, string, Colour][] = [
    [s.t('common.moneyIn'), s.money(report.income), BRAND_MID],
    [s.t('common.moneyOut'), s.money(report.expense), INK],
    [s.t('report.fixedBills'), s.money(report.fixedBills), INK],
    [s.t('report.setAside'), s.money(report.savingsSetAside), INK],
    [s.t('report.spendable'), s.money(report.spendable), INK],
    [s.t('report.spentOfIt'), s.money(report.spent), INK],
  ];

  const column = CONTENT / 2;
  for (let i = 0; i < figures.length; i += 2) {
    sheet.room(30);
    for (const side of [0, 1]) {
      const figure = figures[i + side];
      if (!figure) continue;
      const [label, value, colour] = figure;
      const x = MARGIN + side * column;
      sheet.pdf.text(label, x, sheet.y, { size: SMALL, colour: MUTED });
      sheet.pdf.text(value, x + column - 14, sheet.y, {
        size: 12,
        weight: 'bold',
        colour,
        align: 'right',
      });
    }
    sheet.y += 24;
  }

  // The one line somebody actually reads first.
  sheet.room(46);
  sheet.pdf.rect(MARGIN, sheet.y - 2, CONTENT, 34, TRACK);
  sheet.pdf.text(
    report.net >= 0 ? s.t('report.leftOverLabel') : s.t('report.shortfallLabel'),
    MARGIN + 12,
    sheet.y + 20,
    { size: BODY, weight: 'bold', colour: INK },
  );
  sheet.pdf.text(s.money(Math.abs(report.net)), A4.width - MARGIN - 12, sheet.y + 20, {
    size: 14,
    weight: 'bold',
    colour: report.net >= 0 ? BRAND_MID : CORAL,
    align: 'right',
  });
  sheet.y += 44;
}

function categories(sheet: Sheet, report: MonthlyReport, s: ReportStrings): void {
  if (report.categories.length === 0) return;
  sheet.heading(s.t('insights.spendingByCategory'));

  const amountX = A4.width - MARGIN;
  const shareX = amountX - 108;
  const barX = MARGIN + 150;
  const barW = shareX - barX - 34;

  for (const row of report.categories) {
    sheet.row(() => {
      sheet.pdf.text(truncate(row.name, 140, BODY), MARGIN, sheet.y + 8, {
        size: BODY,
        colour: INK,
      });
      bar(sheet, barX, sheet.y + 5, barW, row.share, BRAND_MID);
      sheet.pdf.text(s.percent(row.share), shareX, sheet.y + 8, {
        size: SMALL,
        colour: MUTED,
        align: 'right',
      });
      sheet.pdf.text(s.moneyWhole(row.total), amountX, sheet.y + 8, {
        size: BODY,
        weight: 'bold',
        colour: INK,
        align: 'right',
      });
    });
  }
  sheet.gap(10);
}

function budgets(sheet: Sheet, report: MonthlyReport, s: ReportStrings): void {
  if (report.budgets.length === 0) return;
  sheet.heading(s.t('budgets.title'));

  const amountX = A4.width - MARGIN;
  const barX = MARGIN + 150;
  const barW = amountX - barX - 150;

  for (const row of report.budgets) {
    sheet.row(() => {
      sheet.pdf.text(truncate(row.name, 140, BODY), MARGIN, sheet.y + 8, {
        size: BODY,
        colour: INK,
      });
      bar(sheet, barX, sheet.y + 5, barW, row.fraction, toneFor(row.fraction));
      sheet.pdf.text(
        s.t('budgets.ofLimit', {
          spent: s.moneyWhole(row.spent),
          limit: s.moneyWhole(row.limit),
        }),
        amountX,
        sheet.y + 8,
        { size: SMALL, colour: row.over ? CORAL : MUTED, align: 'right' },
      );
    });
  }
  sheet.gap(10);
}

function accountsAndGoals(sheet: Sheet, report: MonthlyReport, s: ReportStrings): void {
  const amountX = A4.width - MARGIN;

  if (report.accounts.length > 0) {
    sheet.heading(s.t('accounts.title'));
    let total = 0;
    for (const row of report.accounts) {
      total += row.balance;
      sheet.row(() => {
        sheet.pdf.text(truncate(row.name, 300, BODY), MARGIN, sheet.y + 8, {
          size: BODY,
          colour: INK,
        });
        sheet.pdf.text(s.moneyWhole(row.balance), amountX, sheet.y + 8, {
          size: BODY,
          colour: row.balance < 0 ? CORAL : INK,
          align: 'right',
        });
      });
    }
    sheet.room(22);
    sheet.pdf.rule(MARGIN, sheet.y, CONTENT, HAIRLINE);
    sheet.y += 4;
    sheet.row(() => {
      sheet.pdf.text(s.t('accounts.totalBalance'), MARGIN, sheet.y + 8, {
        size: BODY,
        weight: 'bold',
        colour: INK,
      });
      sheet.pdf.text(s.moneyWhole(total), amountX, sheet.y + 8, {
        size: BODY,
        weight: 'bold',
        colour: INK,
        align: 'right',
      });
    });
    sheet.gap(10);
  }

  if (report.goals.length > 0) {
    sheet.heading(s.t('goals.title'));
    const barX = MARGIN + 150;
    const barW = amountX - barX - 150;

    for (const row of report.goals) {
      sheet.row(() => {
        sheet.pdf.text(truncate(row.name, 140, BODY), MARGIN, sheet.y + 8, {
          size: BODY,
          colour: INK,
        });
        bar(sheet, barX, sheet.y + 5, barW, row.fraction, row.reached ? MINT : BRAND_MID);
        sheet.pdf.text(
          s.t('goals.savedOf', {
            saved: s.moneyWhole(row.saved),
            target: s.moneyWhole(row.target),
          }),
          amountX,
          sheet.y + 8,
          { size: SMALL, colour: MUTED, align: 'right' },
        );
      });
    }
    sheet.gap(10);
  }
}

function transactions(sheet: Sheet, report: MonthlyReport, s: ReportStrings): void {
  // A heading, its column strip and a couple of rows, or none of it. Left to
  // the heading's own reservation this lands at the foot of a page with
  // nothing under it, which reads as a mistake.
  sheet.room(96);
  sheet.heading(s.t('transactions.title'));

  if (report.transactions.length === 0) {
    sheet.row(() => {
      sheet.pdf.text(s.t('report.noTransactions'), MARGIN, sheet.y + 8, {
        size: BODY,
        colour: MUTED,
      });
    });
    return;
  }

  // Widths chosen so an ordinary account name ("Rekening utama") sets in full
  // rather than being cut to three letters and a full stop.
  const amountX = A4.width - MARGIN;
  const amountRoom = 68;
  const noteX = MARGIN + 58;
  const categoryX = amountX - 258;
  const accountX = amountX - 152;

  // A column strip, repeated whenever the table breaks onto a new page.
  const columnHeads = () => {
    sheet.pdf.text(s.t('report.colDate'), MARGIN, sheet.y + 7, { size: SMALL, colour: FAINT });
    sheet.pdf.text(s.t('report.colDetail'), noteX, sheet.y + 7, { size: SMALL, colour: FAINT });
    sheet.pdf.text(s.t('common.category'), categoryX, sheet.y + 7, { size: SMALL, colour: FAINT });
    sheet.pdf.text(s.t('report.colAccount'), accountX, sheet.y + 7, { size: SMALL, colour: FAINT });
    sheet.pdf.text(s.t('common.amount'), amountX, sheet.y + 7, {
      size: SMALL,
      colour: FAINT,
      align: 'right',
    });
    sheet.y += 12;
    sheet.pdf.rule(MARGIN, sheet.y, CONTENT, HAIRLINE);
    sheet.y += 10;
  };

  sheet.room(30);
  columnHeads();

  let lastDay = '';
  for (const row of report.transactions) {
    const day = row.date.toDateString();
    const startsDay = day !== lastDay;

    // Never leave a date heading stranded at the foot of a page.
    const before = sheet.y;
    sheet.room(startsDay ? 30 : 16);
    if (sheet.y !== before) columnHeads();

    sheet.row(() => {
      if (startsDay) {
        sheet.pdf.text(s.dayLabel(row.date), MARGIN, sheet.y + 8, {
          size: SMALL,
          weight: 'bold',
          colour: MUTED,
        });
      }
      writeTransaction(sheet, row, s, { noteX, categoryX, accountX, amountX, amountRoom });
    });

    lastDay = day;
  }
}

function writeTransaction(
  sheet: Sheet,
  row: ReportTransactionRow,
  s: ReportStrings,
  x: {
    noteX: number;
    categoryX: number;
    accountX: number;
    amountX: number;
    amountRoom: number;
  },
): void {
  const label = row.note ?? row.categoryName;
  const detail = row.recurring ? `${label} (${s.t('common.recurring')})` : label;

  sheet.pdf.text(truncate(detail, x.categoryX - x.noteX - 10, BODY), x.noteX, sheet.y + 8, {
    size: BODY,
    colour: INK,
  });
  sheet.pdf.text(
    truncate(row.categoryName, x.accountX - x.categoryX - 10, SMALL),
    x.categoryX,
    sheet.y + 8,
    { size: SMALL, colour: MUTED },
  );
  sheet.pdf.text(
    truncate(row.accountName ?? '', x.amountRoom, SMALL),
    x.accountX,
    sheet.y + 8,
    { size: SMALL, colour: MUTED },
  );

  const signed = `${row.type === 'income' ? '+' : '-'}${s.moneyWhole(row.amount)}`;
  sheet.pdf.text(signed, x.amountX, sheet.y + 8, {
    size: BODY,
    colour: row.type === 'income' ? BRAND_MID : INK,
    align: 'right',
  });
}

/* ------------------------------------------------------------------ public */

export function renderMonthlyReport(report: MonthlyReport, s: ReportStrings): Pdf {
  const sheet = new Sheet();

  cover(sheet, report, s);
  summary(sheet, report, s);
  categories(sheet, report, s);
  budgets(sheet, report, s);
  accountsAndGoals(sheet, report, s);
  transactions(sheet, report, s);

  sheet.pdf.eachPage((page, total) => {
    const y = A4.height - 30;
    sheet.pdf.rule(MARGIN, y - 12, CONTENT, HAIRLINE);
    sheet.pdf.text(
      `${s.t('app.name')} · ${s.monthLabel(report.month)}`,
      MARGIN,
      y,
      { size: SMALL, colour: FAINT },
    );
    sheet.pdf.text(s.t('report.page', { page, total }), A4.width - MARGIN, y, {
      size: SMALL,
      colour: FAINT,
      align: 'right',
    });
  });

  return sheet.pdf;
}

/** `manimani-laporan-2026-08.pdf`, which sorts sensibly in a folder. */
export function reportFileName(report: MonthlyReport, word: string): string {
  const year = report.month.getFullYear();
  const month = String(report.month.getMonth() + 1).padStart(2, '0');
  const safe = word.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `manimani-${safe}-${year}-${month}.pdf`;
}
