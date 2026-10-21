/**
 * Single-flight publishing of task scores. Concurrent callers for the same
 * task share one promise, so a double-click can never fire two updates.
 */
import { supabase } from '@/integrations/supabase/client';
import { rpcCall } from '@/exam-engine/network/RpcClient';
import { toGradingError, toUserFacing } from '../errors/GradingError';

const inFlight = new Map<string, Promise<PublishResult>>();

export interface PublishResult {
  ok: boolean;
  published: boolean;
  message: string;
}

export function isPublishing(taskId: string): boolean {
  return inFlight.has(taskId);
}

export async function setScoresPublished(taskId: string, published: boolean): Promise<PublishResult> {
  const existing = inFlight.get(taskId);
  if (existing) return existing;

  const run = (async (): Promise<PublishResult> => {
    try {
      const res = await rpcCall(
        () => supabase.from('tasks').update({ scores_published: published }).eq('id', taskId).select('id').single(),
        { key: `publish:${taskId}:${published}`, retries: 2, timeoutMs: 15_000 },
      );
      if (res.error) throw res.error;
      return {
        ok: true,
        published,
        message: published ? 'Scores published to students' : 'Scores hidden from students',
      };
    } catch (err) {
      return { ok: false, published: !published, message: toUserFacing(toGradingError(err)) };
    }
  })().finally(() => inFlight.delete(taskId));

  inFlight.set(taskId, run);
  return run;
}
