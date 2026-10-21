/**
 * Per-cell save queue.
 *  - single-flight per cell, with the newest queued value applied afterwards
 *  - exponential backoff with jitter on transient failures
 *  - offline aware: edits are held and flushed automatically on reconnect
 *  - idempotent by construction (the writer performs an upsert on the cell's
 *    natural key), so retries can never create a duplicate row
 */
import type { SaveState } from '../types';
import { isTransientError, toGradingError, toUserFacing } from '../errors/GradingError';

export type Writer = (key: string, value: number | null) => Promise<void>;

export interface SaveQueueOptions {
  debounceMs?: number;
  maxRetries?: number;
  baseMs?: number;
  maxMs?: number;
  onState: (key: string, state: SaveState, error?: string) => void;
  onPendingChange?: (count: number) => void;
}

interface Entry {
  value: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  attempts: number;
}

const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

export class SaveQueue {
  private entries = new Map<string, Entry>();
  private disposed = false;
  private readonly debounceMs: number;
  private readonly maxRetries: number;
  private readonly baseMs: number;
  private readonly maxMs: number;
  private readonly onlineHandler = () => this.flush();

  constructor(private readonly writer: Writer, private readonly opts: SaveQueueOptions) {
    this.debounceMs = opts.debounceMs ?? 800;
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseMs = opts.baseMs ?? 400;
    this.maxMs = opts.maxMs ?? 5_000;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('network:recovered', this.onlineHandler);
    }
  }

  get pendingCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.timer || e.inFlight || !isOnline()) n++;
    return n;
  }

  /** Schedule a save for a cell. The newest value always wins. */
  enqueue(key: string, value: number | null): void {
    if (this.disposed) return;
    const existing = this.entries.get(key);
    if (existing?.timer) clearTimeout(existing.timer);
    const entry: Entry = existing ?? { value, timer: null, inFlight: false, attempts: 0 };
    entry.value = value;
    entry.attempts = 0;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.run(key);
    }, this.debounceMs);
    this.entries.set(key, entry);
    this.opts.onState(key, isOnline() ? 'pending' : 'offline');
    this.notifyPending();
  }

  /** Send everything that is waiting, immediately. */
  flush(): void {
    if (this.disposed) return;
    for (const [key, entry] of this.entries) {
      if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
      if (!entry.inFlight) void this.run(key);
    }
  }

  private notifyPending() {
    this.opts.onPendingChange?.(this.pendingCount);
  }

  private async run(key: string): Promise<void> {
    if (this.disposed) return;
    const entry = this.entries.get(key);
    if (!entry || entry.inFlight) return;

    if (!isOnline()) {
      this.opts.onState(key, 'offline');
      this.notifyPending();
      return; // held until 'online' / 'network:recovered'
    }

    entry.inFlight = true;
    const attempted = entry.value;
    this.opts.onState(key, entry.attempts > 0 ? 'retrying' : 'saving');

    try {
      await this.writer(key, attempted);
      entry.inFlight = false;
      entry.attempts = 0;
      if (entry.value === attempted && !entry.timer) {
        this.entries.delete(key);
        this.opts.onState(key, 'saved');
      } else {
        // A newer value arrived while saving — save it next.
        void this.run(key);
      }
    } catch (err) {
      entry.inFlight = false;
      const transient = isTransientError(err) || !isOnline();
      if (transient && entry.attempts < this.maxRetries) {
        entry.attempts += 1;
        const backoff = Math.min(this.maxMs, this.baseMs * 2 ** (entry.attempts - 1)) + Math.random() * 200;
        this.opts.onState(key, 'retrying');
        entry.timer = setTimeout(() => { entry.timer = null; void this.run(key); }, backoff);
      } else {
        this.entries.delete(key);
        this.opts.onState(key, 'error', toUserFacing(toGradingError(err)));
      }
    } finally {
      this.notifyPending();
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const e of this.entries.values()) if (e.timer) clearTimeout(e.timer);
    this.entries.clear();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineHandler);
      window.removeEventListener('network:recovered', this.onlineHandler);
    }
  }
}
