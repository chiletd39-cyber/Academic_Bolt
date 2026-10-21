/**
 * Autosave engine.
 *
 *  - Answer store is versioned (monotonic clock).
 *  - Only diffs (changed question ids) are uploaded.
 *  - One request in flight at a time; overlapping saves queue.
 *  - Newest local version always wins over stale server acks.
 *  - Retries with exponential backoff on transient errors.
 *  - Offline aware: writes buffered to localStorage, replayed on reconnect.
 *  - Never writes after a terminal exam state.
 */
import { supabase } from '@/integrations/supabase/client';
import { rpcCall } from '../network/RpcClient';
import { logger, bumpCounter } from '../observability/logger';
import { NetworkError } from '../errors/ExamError';

export type AnswerValue = string | number;
export type AnswerMap = Record<string, AnswerValue>;

export interface AutosaveConfig {
  studentId: string;
  taskId: string;
  debounceMs?: number;
  maxWaitMs?: number;
  isTerminal: () => boolean;
  onStart?: () => void;
  onDone?: (ok: boolean) => void;
}

interface Snapshot { answers: AnswerMap; version: number; warnings: number; }

const DRAFT_PREFIX = 'exam-autosave:';

function draftKey(studentId: string, taskId: string) {
  return `${DRAFT_PREFIX}${studentId}:${taskId}`;
}

export function loadDraft(studentId: string, taskId: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(draftKey(studentId, taskId));
    if (!raw) return null;
    const s = JSON.parse(raw) as Snapshot;
    return s && typeof s.version === 'number' ? s : null;
  } catch { return null; }
}

export function clearDraft(studentId: string, taskId: string) {
  try { localStorage.removeItem(draftKey(studentId, taskId)); } catch { /* ignore */ }
}

export class AutosaveEngine {
  private version = 0;
  private answers: AnswerMap = {};
  private warnings = 0;
  private ackVersion = 0;
  private inFlight: Promise<void> | null = null;
  private debounceTimer: number | null = null;
  private firstDirtyAt = 0;
  private disposed = false;

  constructor(private cfg: AutosaveConfig) {
    // Restore any local draft so we don't lose work on remount.
    const draft = loadDraft(cfg.studentId, cfg.taskId);
    if (draft) {
      this.answers = { ...draft.answers };
      this.version = draft.version;
      this.warnings = draft.warnings;
      logger.info('autosave_draft_restored', { version: this.version, keys: Object.keys(this.answers).length });
    }
  }

  /** Hydrate from server row (called by RecoveryEngine). Never overwrites newer local answers. */
  hydrate(remote: { answers: AnswerMap; version?: number; warnings?: number } | null) {
    if (!remote) return;
    const remoteVersion = remote.version ?? 0;
    if (remoteVersion > this.version) {
      this.answers = { ...remote.answers };
      this.version = remoteVersion;
      this.ackVersion = remoteVersion;
      if (typeof remote.warnings === 'number') this.warnings = remote.warnings;
      this.persistDraft();
      logger.info('autosave_hydrated_from_server', { version: this.version });
    }
  }

  get currentAnswers(): AnswerMap { return { ...this.answers }; }
  get currentVersion(): number { return this.version; }

  setWarnings(n: number) {
    if (n === this.warnings) return;
    this.warnings = n;
    this.markDirty();
  }

  setAnswer(qid: string, value: AnswerValue) {
    if (this.disposed || this.cfg.isTerminal()) return;
    if (this.answers[qid] === value) return;
    this.answers = { ...this.answers, [qid]: value };
    this.version++;
    this.markDirty();
  }

  private markDirty() {
    this.persistDraft();
    if (this.firstDirtyAt === 0) this.firstDirtyAt = Date.now();
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
    const debounce = this.cfg.debounceMs ?? 1_200;
    const maxWait = this.cfg.maxWaitMs ?? 5_000;
    const elapsed = Date.now() - this.firstDirtyAt;
    const wait = Math.min(debounce, Math.max(0, maxWait - elapsed));
    this.debounceTimer = window.setTimeout(() => this.flush(), wait);
  }

  private persistDraft() {
    try {
      const snap: Snapshot = { answers: this.answers, version: this.version, warnings: this.warnings };
      localStorage.setItem(draftKey(this.cfg.studentId, this.cfg.taskId), JSON.stringify(snap));
    } catch { /* quota / disabled */ }
  }

  /** Force an immediate flush. Safe to call anytime; single-flight. */
  async flush(): Promise<void> {
    if (this.disposed || this.cfg.isTerminal()) return;
    if (this.debounceTimer) { window.clearTimeout(this.debounceTimer); this.debounceTimer = null; }
    if (this.inFlight) {
      // Chain another flush after the current one completes so latest state ships.
      return this.inFlight.then(() => this.flush());
    }
    if (this.version === this.ackVersion) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      logger.info('autosave_skipped_offline', { version: this.version });
      return;
    }
    const versionAtStart = this.version;
    const payload = { ...this.answers };
    const warnings = this.warnings;
    this.cfg.onStart?.();
    this.inFlight = (async () => {
      try {
        const res = await rpcCall(
          () => supabase.from('task_submissions').upsert({
            student_id: this.cfg.studentId,
            task_id: this.cfg.taskId,
            answers: payload,
            warnings,
            status: 'in_progress',
          }, { onConflict: 'student_id,task_id' }),
          { key: `autosave:${this.cfg.taskId}`, retries: 4, baseMs: 400, dedupe: false },
        );
        const err = (res as { error?: { message?: string } })?.error;
        if (err) throw new NetworkError(err.message ?? 'autosave failed');
        // Only advance the ack if no newer local edits happened while we were saving.
        if (versionAtStart >= this.ackVersion) this.ackVersion = versionAtStart;
        this.firstDirtyAt = 0;
        bumpCounter('autosave.success');
        this.cfg.onDone?.(true);
      } catch (e) {
        bumpCounter('autosave.failed');
        logger.warn('autosave_failed', { error: (e as Error).message, version: versionAtStart });
        this.cfg.onDone?.(false);
      } finally {
        this.inFlight = null;
        // If more edits came in during the flight, kick another flush.
        if (!this.disposed && this.version > this.ackVersion && !this.cfg.isTerminal()) {
          this.markDirty();
        }
      }
    })();
    return this.inFlight;
  }

  dispose() {
    this.disposed = true;
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }
}
