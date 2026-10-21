/**
 * The single React entry point into the exam engine. Owns the lifecycle,
 * state machine, autosave, submission, recovery, network controller,
 * heartbeat, security bus, and resource registry.
 *
 * All existing UI components (SecuritySidebar, ExamCountdown, PermissionGate,
 * BroadcastListener, CursorDangerZone, ObjectDetectionOverlay) keep working:
 * they consume snapshots and callbacks exposed here instead of running
 * their own scattered network / lifecycle logic.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ExamMachine, type ExamState } from '../state/examMachine';
import { AutosaveEngine, clearDraft, type AnswerMap } from '../autosave/AutosaveEngine';
import { SubmissionPipeline, type SubmitResult } from '../submission/SubmissionPipeline';
import { recover, startExamSession, type RecoveryOutcome } from '../recovery/RecoveryEngine';
import { NetworkController, type NetStatus } from '../network/NetworkController';
import { HeartbeatEngine } from '../session/HeartbeatEngine';
import { SecurityBus, type SecurityEvent, type SecurityEventType, type Severity } from '../security/SecurityBus';
import { ResourceRegistry } from '../lifecycle/ResourceRegistry';
import { logger, newCorrelationId, setLogContext } from '../observability/logger';
import { toUserFacing, type UserFacingError } from '../errors/ExamError';
import { supabase } from '@/integrations/supabase/client';

export interface UseExamEngineOptions {
  studentId: string;
  taskId: string;
  durationSec: number;
  autosaveEnabled: boolean;
}

export interface ExamEngineSnapshot {
  state: ExamState;
  answers: AnswerMap;
  answeredCount: number;
  remainingSec: number;
  network: NetStatus;
  submitting: boolean;
  submitResult: SubmitResult | null;
  lastError: UserFacingError | null;
  recovery: RecoveryOutcome | null;
  events: SecurityEvent[];
}

interface EngineInternal {
  machine: ExamMachine;
  autosave: AutosaveEngine;
  submission: SubmissionPipeline;
  network: NetworkController;
  heartbeat: HeartbeatEngine;
  security: SecurityBus;
  registry: ResourceRegistry;
  correlationId: string;
  startedAt: number | null;
  durationSec: number;
}

export function useExamEngine(opts: UseExamEngineOptions) {
  const engineRef = useRef<EngineInternal | null>(null);
  const [snapshot, setSnapshot] = useState<ExamEngineSnapshot>({
    state: 'preparing',
    answers: {},
    answeredCount: 0,
    remainingSec: opts.durationSec,
    network: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online',
    submitting: false,
    submitResult: null,
    lastError: null,
    recovery: null,
    events: [],
  });

  // Initialize engine once per student+task.
  useEffect(() => {
    if (engineRef.current) return;
    const correlationId = newCorrelationId();
    setLogContext({ examId: opts.taskId, studentId: opts.studentId, correlationId, phase: 'exam' });

    const registry = new ResourceRegistry();
    const machine = new ExamMachine();
    const network = new NetworkController();
    const submission = new SubmissionPipeline();
    const security = new SecurityBus(opts.studentId, opts.taskId, correlationId);
    const autosave = new AutosaveEngine({
      studentId: opts.studentId,
      taskId: opts.taskId,
      isTerminal: () => machine.isTerminal,
      onStart: () => machine.send({ type: 'AUTOSAVE_START' }),
      onDone: () => machine.send({ type: 'AUTOSAVE_DONE' }),
    });
    const heartbeat = new HeartbeatEngine({
      taskId: opts.taskId,
      isTerminal: () => machine.isTerminal,
      isOnline: () => network.status === 'online',
    });

    engineRef.current = { machine, autosave, submission, network, heartbeat, security, registry, correlationId, startedAt: null, durationSec: opts.durationSec };

    // Register lifecycle disposers.
    registry.onDispose(() => { autosave.dispose(); heartbeat.dispose(); security.dispose(); network.dispose(); });

    // Wire subscribers → React state.
    const events: SecurityEvent[] = [];
    const unsubSec = security.subscribe(e => { events.push(e); if (events.length > 500) events.shift(); setSnapshot(s => ({ ...s, events: [...events] })); });
    const unsubNet = network.subscribe(status => {
      setSnapshot(s => ({ ...s, network: status }));
      if (status === 'offline') { machine.send({ type: 'NETWORK_LOST' }); security.emit('network_lost', 'Connection lost', 'warning'); }
      if (status === 'online')  { machine.send({ type: 'NETWORK_RESTORED' }); security.emit('reconnect', 'Connection restored', 'info'); security.flushOnReconnect(); void autosave.flush(); }
    });
    const unsubMachine = machine.subscribe(state => setSnapshot(s => ({ ...s, state })));

    registry.onDispose(() => { unsubSec(); unsubNet(); unsubMachine(); });

    // Kick off recovery. The server decides whether this attempt may continue.
    (async () => {
      try {
        const outcome = await recover(opts.studentId, opts.taskId);
        setSnapshot(s => ({ ...s, recovery: outcome, answers: outcome.answers, answeredCount: Object.keys(outcome.answers).length }));
        if (outcome.alreadySubmitted) {
          machine.send({ type: 'SUBMIT_SUCCESS', force: outcome.status === 'force_submitted' });
          return;
        }
        if (outcome.blocked) {
          // Expired / closed: lock into a terminal state so nothing is editable or saved.
          machine.send({ type: 'FATAL', error: `exam_${outcome.blocked}` });
          return;
        }
        autosave.hydrate({ answers: outcome.answers, version: outcome.version, warnings: outcome.warnings });
        if (outcome.serverStartedAt !== null && engineRef.current) {
          engineRef.current.startedAt = outcome.serverStartedAt;
          if (outcome.serverRemainingSec !== null) {
            const elapsed = Math.floor((Date.now() - outcome.serverStartedAt) / 1000);
            engineRef.current.durationSec = elapsed + outcome.serverRemainingSec;
          }
        }
      } catch (e) {
        logger.error('recovery_error', { err: (e as Error).message });
        // Fail closed: without a server verdict the exam must not become editable.
        machine.send({ type: 'FATAL', error: 'recovery_failed' });
        setSnapshot(s => ({ ...s, lastError: toUserFacing(e) }));
        return;
      }
      machine.send({ type: 'PERMISSIONS_REQUIRED' });
    })();

    return () => {
      // Best-effort mark session inactive when leaving.
      supabase.from('exam_sessions')
        .update({ is_active: false })
        .eq('student_id', opts.studentId)
        .eq('task_id', opts.taskId)
        .then(() => { /* fire and forget */ });
      registry.teardown();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.studentId, opts.taskId]);

  // Countdown-driven timer once running.
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (snapshot.state !== 'running' && snapshot.state !== 'autosaving' && snapshot.state !== 'reconnecting') return;
    if (eng.startedAt === null) return;
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - (eng.startedAt as number)) / 1000);
      const remaining = Math.max(0, eng.durationSec - elapsed);
      setSnapshot(s => (s.remainingSec === remaining ? s : { ...s, remainingSec: remaining }));
      if (remaining === 0 && !eng.machine.isTerminal) {
        window.clearInterval(id);
        eng.machine.send({ type: 'TIME_EXPIRED' });
        void performSubmit(true, 'time_expired');
      }
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.state]);

  const permissionsGranted = useCallback(() => {
    engineRef.current?.machine.send({ type: 'PERMISSIONS_GRANTED' });
  }, []);

  const beginExam = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng || eng.machine.isTerminal) return null;
    // Server opens (or resumes) the attempt; client timers never decide.
    const res = await startExamSession(opts.taskId);
    if (!res.ok && !res.preview) {
      clearDraft(opts.studentId, opts.taskId);
      setSnapshot(s => ({ ...s, recovery: { ...(s.recovery ?? { alreadySubmitted: false, answers: {}, version: 0, warnings: 0, serverStartedAt: null, serverRemainingSec: null, status: null }), blocked: res.reason ?? 'closed', alreadySubmitted: res.reason === 'finalized' } }));
      eng.machine.send({ type: 'FATAL', error: `exam_${res.reason ?? 'closed'}` });
      return null;
    }
    if (res.started_at) {
      eng.startedAt = new Date(res.started_at).getTime();
      if (typeof res.remaining_seconds === 'number') {
        eng.durationSec = Math.floor((Date.now() - eng.startedAt) / 1000) + res.remaining_seconds;
      }
    } else {
      eng.startedAt = eng.startedAt ?? Date.now();
    }
    eng.machine.send({ type: 'COUNTDOWN_START' });
    eng.machine.send({ type: 'COUNTDOWN_DONE' });
    eng.heartbeat.start();
    return Math.max(0, eng.durationSec - Math.floor((Date.now() - eng.startedAt) / 1000));
  }, [opts.studentId, opts.taskId]);

  const setAnswer = useCallback((qid: string, value: string | number) => {
    const eng = engineRef.current;
    if (!eng || eng.machine.isTerminal) return;
    eng.autosave.setAnswer(qid, value);
    setSnapshot(s => {
      const answers = { ...s.answers, [qid]: value };
      return { ...s, answers, answeredCount: Object.keys(answers).length };
    });
  }, []);

  const setWarnings = useCallback((n: number) => {
    engineRef.current?.autosave.setWarnings(n);
  }, []);

  const emitSecurity = useCallback((type: SecurityEventType, message: string, severity: Severity = 'warning', details?: Record<string, unknown>) => {
    engineRef.current?.security.emit(type, message, severity, details);
  }, []);

  const performSubmit = useCallback(async (force: boolean, reason: string): Promise<SubmitResult | null> => {
    const eng = engineRef.current;
    if (!eng) return null;
    if (eng.submission.isSealed) return eng.submission.result;
    if (!eng.machine.send({ type: 'SUBMIT_REQUESTED', force })) return eng.submission.result;
    setSnapshot(s => ({ ...s, submitting: true, lastError: null }));
    try {
      // Flush any pending autosave first so latest answers are on the server.
      await eng.autosave.flush().catch(() => { /* server has our submit_exam payload anyway */ });
      const answers = eng.autosave.currentAnswers;
      const result = await eng.submission.submit({
        taskId: opts.taskId,
        studentId: opts.studentId,
        answers,
        warnings: snapshot.events.length,
        force,
      });
      eng.machine.send({ type: 'SUBMIT_SUCCESS', force });
      setSnapshot(s => ({ ...s, submitting: false, submitResult: result }));
      // Exit fullscreen — best-effort.
      if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* ignore */ } }
      logger.info('submit_committed', { force, reason });
      return result;
    } catch (e) {
      eng.machine.send({ type: 'SUBMIT_FAILED', error: (e as Error).message });
      setSnapshot(s => ({ ...s, submitting: false, lastError: toUserFacing(e) }));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.studentId, opts.taskId, snapshot.events.length]);

  const submit = useCallback(() => performSubmit(false, 'user_action'), [performSubmit]);
  const forceSubmit = useCallback((reason = 'security') => performSubmit(true, reason), [performSubmit]);

  const controls = useMemo(() => ({ permissionsGranted, beginExam, setAnswer, setWarnings, emitSecurity, submit, forceSubmit }), [permissionsGranted, beginExam, setAnswer, setWarnings, emitSecurity, submit, forceSubmit]);

  return { snapshot, controls } as const;
}
