export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

/**
 * A one-at-a-time write queue.
 *
 * The app stays optimistic: the reducer runs, the hero number moves, and the
 * write happens behind it. That is only safe if writes cannot overtake each
 * other, so this runs them strictly in order. Adding a transaction and then
 * deleting it must not arrive the other way round.
 *
 * Failures retry with backoff rather than being dropped. A tunnel or a flaky
 * connection should cost a few seconds, not somebody's grocery shop. If the
 * browser reports itself offline the queue simply waits for it to come back.
 */

const MAX_ATTEMPTS = 5;
const BASE_DELAY = 600;

interface Job {
  run: () => Promise<unknown>;
  label: string;
  attempts: number;
}

export class SyncQueue {
  private jobs: Job[] = [];
  private running = false;
  private status: SyncStatus = 'idle';
  private listeners = new Set<(s: SyncStatus, pending: number) => void>();
  private stopped = false;

  subscribe(fn: (status: SyncStatus, pending: number) => void): () => void {
    this.listeners.add(fn);
    fn(this.status, this.jobs.length);
    return () => this.listeners.delete(fn);
  }

  private emit(status: SyncStatus) {
    this.status = status;
    for (const fn of this.listeners) fn(status, this.jobs.length);
  }

  push(label: string, run: () => Promise<unknown>): void {
    if (this.stopped) return;
    this.jobs.push({ run, label, attempts: 0 });
    this.emit('syncing');
    void this.drain();
  }

  /** Empties the queue without running it. Used on sign out. */
  stop(): void {
    this.stopped = true;
    this.jobs = [];
    this.listeners.clear();
  }

  private async drain(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;

    while (this.jobs.length > 0 && !this.stopped) {
      const job = this.jobs[0];

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.emit('offline');
        await waitForOnline();
        if (this.stopped) break;
        this.emit('syncing');
      }

      try {
        await job.run();
        this.jobs.shift();
        this.emit(this.jobs.length > 0 ? 'syncing' : 'idle');
      } catch (err) {
        job.attempts++;
        if (job.attempts >= MAX_ATTEMPTS) {
          // Give up on this one rather than blocking everything behind it.
          // The local copy is still correct; the next write of the same record
          // will carry the value across anyway.
          console.warn(`[sync] giving up on "${job.label}"`, err);
          this.jobs.shift();
          this.emit(this.jobs.length > 0 ? 'syncing' : 'error');
        } else {
          this.emit('syncing');
          await sleep(BASE_DELAY * 2 ** (job.attempts - 1));
        }
      }
    }

    this.running = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForOnline(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || navigator.onLine) return resolve();
    const on = () => {
      window.removeEventListener('online', on);
      resolve();
    };
    window.addEventListener('online', on);
  });
}
