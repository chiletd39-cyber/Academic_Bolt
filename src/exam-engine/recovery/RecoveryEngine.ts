/**
 * Restores exam state from server + local draft after refresh, crash,
 * sleep/wake, or reconnect. The server is authoritative:
 *  - a finalized submission is returned read-only and the local draft is discarded;
 *  - an existing attempt is only resumed when `start_exam_session` confirms it
 *    is still open (not expired, not closed, not finalized);
 *  - a local draft is merged only into a server-validated, still-open attempt.
 */
import { supabase } from '@/integrations/supabase/client';
import { rpcCall } from '../network/RpcClient';
import { logger } from '../observability/logger';
import { loadDraft, clearDraft, type AnswerMap } from '../autosave/AutosaveEngine';

export type RecoveryBlock = 'finalized' | 'expired' | 'closed' | 'not_started' | 'unauthorized';

export interface RecoveryOutcome {
  alreadySubmitted: boolean;
  /** Set when the server refuses to (re)open this attempt. Answers are read-only. */
  blocked: RecoveryBlock | null;
  answers: AnswerMap;
  version: number;
  warnings: number;
  serverStartedAt: number | null;
  /** Server-computed seconds remaining for a resumed attempt. */
  serverRemainingSec: number | null;
  status: string | null;
}

export interface StartSessionResult {
  ok: boolean;
  preview?: boolean;
  reason?: RecoveryBlock;
  started_at?: string;
  remaining_seconds?: number;
  warnings?: number;
  status?: string;
}

const FINAL = new Set(['submitted', 'force_submitted', 'closed', 'graded']);

export async function startExamSession(taskId: string): Promise<StartSessionResult> {
  const { data, error } = await supabase.rpc('start_exam_session' as never, { _task_id: taskId } as never);
  if (error) {
    const msg = (error.message || '').toLowerCase();
    return { ok: false, reason: msg.includes('authorized') ? 'unauthorized' : msg.includes('submitted') || msg.includes('finalized') ? 'finalized' : msg.includes('deadline') ? 'expired' : 'closed' };
  }
  return (data ?? { ok: false, reason: 'closed' }) as StartSessionResult;
}

export async function recover(studentId: string, taskId: string): Promise<RecoveryOutcome> {
  const [subRes, sessionRes] = await Promise.all([
    rpcCall(
      () => supabase.from('task_submissions')
        .select('answers, warnings, status, submitted_at, created_at')
        .eq('student_id', studentId).eq('task_id', taskId).maybeSingle(),
      { key: `recover:submission:${taskId}`, retries: 2, dedupe: true },
    ),
    rpcCall(
      () => supabase.from('exam_sessions')
        .select('started_at, warnings, is_active')
        .eq('student_id', studentId).eq('task_id', taskId)
        .order('started_at', { ascending: true }).limit(1).maybeSingle(),
      { key: `recover:session:${taskId}`, retries: 2, dedupe: true },
    ),
  ]);

  const sub = (subRes as { data?: { answers: AnswerMap; warnings: number; status: string; submitted_at: string | null; created_at: string } }).data;
  const session = (sessionRes as { data?: { started_at: string; warnings: number; is_active: boolean } }).data;

  // 1) Finalized on the server → read-only, local draft can never override it.
  if (sub && FINAL.has(sub.status)) {
    clearDraft(studentId, taskId);
    logger.info('recovery_already_submitted', { status: sub.status });
    return {
      alreadySubmitted: true, blocked: 'finalized', answers: sub.answers ?? {}, version: 0,
      warnings: sub.warnings ?? 0, serverStartedAt: session?.started_at ? new Date(session.started_at).getTime() : null,
      serverRemainingSec: null, status: sub.status,
    };
  }

  const serverAnswers: AnswerMap = sub?.answers ?? {};

  // 2) An attempt already exists → ask the server whether it may continue.
  let serverStartedAt: number | null = null;
  let serverRemainingSec: number | null = null;
  if (session?.started_at) {
    const res = await startExamSession(taskId);
    if (!res.ok) {
      clearDraft(studentId, taskId);
      logger.warn('recovery_blocked', { reason: res.reason });
      return {
        alreadySubmitted: res.reason === 'finalized', blocked: res.reason ?? 'closed',
        answers: serverAnswers, version: 0, warnings: sub?.warnings ?? session.warnings ?? 0,
        serverStartedAt: new Date(session.started_at).getTime(), serverRemainingSec: 0, status: res.status ?? sub?.status ?? null,
      };
    }
    serverStartedAt = res.started_at ? new Date(res.started_at).getTime() : new Date(session.started_at).getTime();
    serverRemainingSec = typeof res.remaining_seconds === 'number' ? res.remaining_seconds : null;
  }

  // 3) Valid open attempt (or not started yet) → merge local draft.
  const draft = loadDraft(studentId, taskId);
  let answers: AnswerMap = serverAnswers;
  let version = 0;
  let warnings = sub?.warnings ?? session?.warnings ?? 0;
  if (draft) {
    answers = { ...serverAnswers, ...draft.answers };
    version = draft.version;
    if (draft.warnings > warnings) warnings = draft.warnings;
  }

  logger.info('recovery_complete', {
    serverKeys: Object.keys(serverAnswers).length,
    draftKeys: draft ? Object.keys(draft.answers).length : 0,
    resumed: serverStartedAt !== null, warnings, version,
  });

  return { alreadySubmitted: false, blocked: null, answers, version, warnings, serverStartedAt, serverRemainingSec, status: sub?.status ?? null };
}
