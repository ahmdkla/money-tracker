import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Category } from '../types';
import { tints } from '../lib/palette';
import { iconFor } from './icons';
import { useReducedMotion } from '../store/theme';

/* ------------------------------------------------------------------ tiles */

/**
 * The rounded, tinted tile a category wears everywhere it appears. Size is a
 * token rather than a free number so tiles stay on the same rhythm.
 */
export function CategoryTile({
  category,
  dark,
  size = 'md',
}: {
  category: Category | undefined;
  dark: boolean;
  size?: 'sm' | 'md';
}) {
  const tint = tints(dark)[category?.colorKey ?? 'slate'];
  const Icon = iconFor(category?.icon ?? 'Tag');
  const box = size === 'sm' ? 'h-8 w-8 rounded-chip' : 'h-11 w-11 rounded-[12px]';
  const px = size === 'sm' ? 17 : 22;

  return (
    <span
      className={`${box} flex shrink-0 items-center justify-center`}
      style={{ backgroundColor: tint.bg, color: tint.fg }}
      aria-hidden="true"
    >
      <Icon size={px} weight="regular" />
    </span>
  );
}

/* ------------------------------------------------------------- count-up */

/**
 * Counts from the previous value to the next one. The hero number is the only
 * thing in the app that animates its content, and it holds its own width so
 * the panel below it never shifts. Reduced motion skips straight to the value.
 */
export function useCountUp(value: number, duration = 620): number {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const frame = useRef(0);

  useEffect(() => {
    if (reduced) {
      from.current = value;
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    if (delta === 0) return;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out: fast at first, settles gently. Entering motion, so out.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(origin + delta * eased);
      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        from.current = value;
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration, reduced]);

  return display;
}

/* --------------------------------------------------------------- toasts */

export interface Toast {
  id: number;
  message: string;
  tone: 'neutral' | 'warning';
}

/**
 * Announced politely, never focused, gone in a few seconds. A toast that
 * stole focus would interrupt the very flow it is confirming.
 */
export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-50 flex justify-center px-gutter"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex w-full max-w-app flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in rounded-field px-4 py-2.5 text-meta font-medium ${
              t.tone === 'warning'
                ? 'bg-coral-soft text-coral-text'
                : 'bg-ink-900 text-ink-50 dark:bg-ink-100 dark:text-ink-900'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- sheet */

/**
 * Bottom sheet. Focus moves in on open and returns to whatever opened it on
 * close, Escape dismisses, Tab is trapped, and the scrim is opaque enough to
 * settle the background rather than let it compete.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;

    const el = panel.current;
    const focusables = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((n) => n.offsetParent !== null);

    const first = focusables()[0];
    // Prefer the field the user came here to fill.
    const preferred = el?.querySelector<HTMLElement>('[data-autofocus]');
    (preferred ?? first)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center desk:items-center desk:p-6">
      <div
        className="animate-scrim-in absolute inset-0 bg-ink-950/55"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={description ? 'sheet-desc' : undefined}
        className="animate-sheet-in relative flex max-h-[92dvh] w-full max-w-app flex-col rounded-t-hero bg-ink-50 desk:max-h-[88dvh] desk:max-w-[560px] desk:animate-pop-in desk:rounded-card dark:bg-night-card"
      >
        <div className="flex items-start justify-between gap-3 px-gutter pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="text-lg font-medium text-ink-900 dark:text-ink-50">{title}</h2>
            {description && (
              <p id="sheet-desc" className="mt-0.5 text-meta text-ink-600 dark:text-ink-400">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            className="press -mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-600 dark:text-ink-300"
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-gutter pb-2">{children}</div>

        {footer && (
          <div className="hairline-t px-gutter pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function CloseGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5 5l10 10M15 5L5 15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------- progress */

export function ProgressBar({
  fraction,
  tone,
  label,
  height = 6,
}: {
  fraction: number;
  tone: string;
  label: string;
  height?: number;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="w-full overflow-hidden rounded-full bg-ink-200 dark:bg-night-raised"
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, backgroundColor: tone }}
      />
    </div>
  );
}

/* ------------------------------------------------------------- sections */

export function SectionHeader({
  title,
  icon,
  action,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-meta font-medium uppercase tracking-[0.07em] text-ink-500 dark:text-ink-400">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Text only a screen reader reads. Charts use it to say what they show. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
