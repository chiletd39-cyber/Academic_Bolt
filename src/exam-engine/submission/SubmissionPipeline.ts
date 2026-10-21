/**
 * Single-flight, idempotent exam submission.
 *
 *   - submit() may be called any number of times; only one RPC actually fires.
 *   - Concurrent callers receive the same in-flight promise.
 *   - After a successful submit, the pipeline is permanently sealed.
 *   - Late RPC responses arriving after seal are discarded.
 *   - Force submission and normal submission funnel through the same code path.
 */
import { supabase } from '@/integrations/supabase/client';
import { rpcCall } from '../network/RpcClient';
import { logger, bumpCounter } from '../observability/logger';
import { SubmissionError } from '../errors/ExamError';

export interface SubmitInput {
  taskId: string;
  studentId: string;
  answers: Record<string, string | number>;
  warnings: number;
  force?: boolean;
}

export interface SubmitResult {
  score: number;
  total: number;
  status: string;
}

export class SubmissionPipeline {
  private sealed = false;
  private inFlight: Promise<SubmitResult> | null = null;
  private lastResult: SubmitResult | null = null;
  private readonly correlationId = crypto.randomUUID();

  get isSealed() { return this.sealed; }
  get result(): SubmitResult | null { return this.lastResult; }

  async submit(input: SubmitInput): Promise<SubmitResult> {
    if (this.sealed && this.lastResult) {
      bumpCounter('submit.duplicate_blocked');
      logger.info('submit_dedup_after_seal', { correlationId: this.correlationId });
      return this.lastResult;
    }
    if (this.inFlight) {
      bumpCounter('submit.single_flight_hit');
      return this.inFlight;
    }
    this.inFlight = (async () => {
      const started = performance.now();
      try {
        logger.info('submit_begin', { taskId: input.taskId, force: !!input.force, correlationId: this.correlationId });
        const res = await rpcCall(
          () => supabase.rpc('submit_exam', {
            _task_id: input.taskId,
            _answers: input.answers as never,
            _warnings: input.warnings,
            _force: !!input.force,
          }),
          { key: `submit:${input.taskId}:${input.studentId}`, retries: 3, baseMs: 500, dedupe: true, timeoutMs: 30_000 },
        );
        const err = (res as { error?: { message?: string } })?.error;
        if (err) throw new SubmissionError(err.message ?? 'submission failed');
        const data = (res as { data?: SubmitResult }).data;
        const result: SubmitResult = {
          score: Number(data?.score ?? 0),
          total: Number(data?.total ?? 0),
          status: String(data?.status ?? (input.force ? 'force_submitted' : 'submitted')),
        };
        this.lastResult = result;
        this.sealed = true;
        bumpCounter('submit.success');
        logger.info('submit_done', { ms: Math.round(performance.now() - started), status: result.status, correlationId: this.correlationId });
        return result;
      } catch (e) {
        bumpCounter('submit.failed');
        logger.error('submit_failed', { error: (e as Error).message, correlationId: this.correlationId });
        throw e instanceof SubmissionError ? e : new SubmissionError((e as Error).message, e);
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }
}
