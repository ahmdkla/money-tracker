/**
 * A very small PDF writer.
 *
 * Enough of the format to typeset a financial report: text in two weights,
 * filled rectangles, and rules. It exists instead of a dependency because a
 * money app should not pull three hundred kilobytes and a supply chain into
 * the browser to draw a few hundred lines of text, and because the layout code
 * reads better when it can ask for exactly what this report needs.
 *
 * The two fonts are from the fourteen every PDF reader is required to carry,
 * so nothing is embedded and a full month comes to a few kilobytes.
 *
 * Coordinates here are top-left origin, because that is how the layout code
 * thinks. PDF itself measures from the bottom-left, and the conversion happens
 * once, on the way out.
 */

/* --------------------------------------------------------------- metrics */

/*
 * Glyph widths in thousandths of the font size, for codes 32 to 126. Straight
 * from the Adobe font metrics for the two faces. They are needed so a column
 * of money can be set flush right, which is the whole reason a report is
 * readable at a glance.
 */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** The handful of Latin-1 characters this app actually produces. */
const WIDE_CHARS: Record<number, number> = {
  160: 278, // no-break space, which Intl puts after "Rp"
  183: 278, // the middle dot used as a separator
  176: 400, // degree, in case a note carries one
};

export type Weight = 'regular' | 'bold';

/**
 * Typographic quotes and dashes, folded to characters the base encoding has.
 * The alternative is a question mark in the middle of somebody's note.
 */
const FOLD: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  ' ': ' ',
  '•': '-',
};

/** Anything the single byte encoding cannot carry, made safe. */
function toLatin1(text: string): string {
  let out = '';
  for (const ch of text) {
    const folded = FOLD[ch];
    if (folded !== undefined) {
      out += folded;
      continue;
    }
    const code = ch.codePointAt(0)!;
    // 127 to 159 are control codes in this encoding, so they are dropped too.
    out += code >= 32 && code <= 126 ? ch : code >= 160 && code <= 255 ? ch : '?';
  }
  return out;
}

/** How wide a string sets, in points, at a given size. */
export function measure(text: string, size: number, weight: Weight = 'regular'): number {
  const table = weight === 'bold' ? HELVETICA_BOLD : HELVETICA;
  let mille = 0;
  for (const ch of toLatin1(text)) {
    const code = ch.charCodeAt(0);
    mille += code >= 32 && code <= 126 ? table[code - 32] : (WIDE_CHARS[code] ?? 556);
  }
  return (mille * size) / 1000;
}

/** Cuts a string to fit a column, with a trailing ellipsis if it had to. */
export function truncate(text: string, max: number, size: number, weight: Weight = 'regular'): string {
  if (measure(text, size, weight) <= max) return text;
  const dots = measure('...', size, weight);
  let cut = text;
  while (cut.length > 1 && measure(cut, size, weight) + dots > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}...`;
}

/* ---------------------------------------------------------------- writing */

/** Text inside a PDF string literal, with the three characters that bite. */
function escape(text: string): string {
  return toLatin1(text).replace(/([\\()])/g, '\\$1');
}

/** Numbers, short. PDF has no use for seventeen significant figures. */
const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};

export interface Colour {
  r: number;
  g: number;
  b: number;
}

/** "#0E3A2F" to the 0 to 1 triple PDF wants. */
export function rgb(hex: string): Colour {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

export interface PageSize {
  width: number;
  height: number;
}

/** A4, in points, which is what the rest of the world prints on. */
export const A4: PageSize = { width: 595.28, height: 841.89 };

export interface TextOptions {
  size?: number;
  weight?: Weight;
  colour?: Colour;
  /** Where x refers to: the start of the text, or the end of it. */
  align?: 'left' | 'right';
}

export class Pdf {
  private pages: string[][] = [];
  private current: string[] = [];
  readonly size: PageSize;

  constructor(size: PageSize = A4) {
    this.size = size;
    this.pages.push(this.current);
  }

  get pageCount(): number {
    return this.pages.length;
  }

  newPage(): void {
    this.current = [];
    this.pages.push(this.current);
  }

  /** y is the text baseline, measured down from the top of the page. */
  text(value: string, x: number, y: number, opts: TextOptions = {}): void {
    const { size = 10, weight = 'regular', colour, align = 'left' } = opts;
    if (!value) return;

    const left = align === 'right' ? x - measure(value, size, weight) : x;
    const font = weight === 'bold' ? '/F2' : '/F1';
    const fill = colour ? `${n(colour.r)} ${n(colour.g)} ${n(colour.b)} rg\n` : '';

    this.current.push(
      `${fill}BT ${font} ${n(size)} Tf 1 0 0 1 ${n(left)} ${n(this.size.height - y)} Tm (${escape(value)}) Tj ET`,
    );
  }

  rect(x: number, y: number, width: number, height: number, colour: Colour): void {
    if (width <= 0 || height <= 0) return;
    this.current.push(
      `${n(colour.r)} ${n(colour.g)} ${n(colour.b)} rg ${n(x)} ${n(this.size.height - y - height)} ${n(width)} ${n(height)} re f`,
    );
  }

  /** A horizontal rule. The only kind this report has any use for. */
  rule(x: number, y: number, width: number, colour: Colour, thickness = 0.5): void {
    const top = this.size.height - y;
    this.current.push(
      `${n(colour.r)} ${n(colour.g)} ${n(colour.b)} RG ${n(thickness)} w ${n(x)} ${n(top)} m ${n(x + width)} ${n(top)} l S`,
    );
  }

  /**
   * Adds something to every page once they are all built. Page numbers need
   * the total, which is only known at the end.
   */
  eachPage(draw: (page: number, total: number) => void): void {
    const finished = this.pages;
    const total = finished.length;
    for (let i = 0; i < total; i++) {
      this.current = finished[i];
      draw(i + 1, total);
    }
    this.current = finished[finished.length - 1];
  }

  /* ------------------------------------------------------------ serialise */

  private build(): string {
    const objects: string[] = [];
    const add = (body: string) => {
      objects.push(body);
      return objects.length; // object numbers are one based
    };

    // Reserved so pages can name their parent before it is written.
    const catalogId = 1;
    const pagesId = 2;
    objects.push('', '');

    const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const boldId = add(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    );

    const pageIds: number[] = [];
    for (const page of this.pages) {
      const stream = page.join('\n');
      const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      pageIds.push(
        add(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(this.size.width)} ${n(this.size.height)}] ` +
            `/Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
        ),
      );
    }

    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] =
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    // The cross reference table needs a byte offset per object, so the file is
    // assembled in order and measured as it goes.
    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      out += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    return out;
  }

  /**
   * The finished file. Every character is a single byte by construction, so
   * the offsets recorded above are byte offsets, which is what a reader will
   * look for.
   */
  toBytes(): Uint8Array<ArrayBuffer> {
    const text = this.build();
    const bytes = new Uint8Array(new ArrayBuffer(text.length));
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    return bytes;
  }

  toBlob(): Blob {
    return new Blob([this.toBytes()], { type: 'application/pdf' });
  }
}
