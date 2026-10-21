/**
 * Structured security-event bus. The browser does not enforce anything on
 * its own — it reports events; the engine decides how they affect state.
 *
 * Events are durable: emission is fire-and-forget with a local ring buffer.
 * If the network is unreachable, buffered events are drained on reconnect.
 */
import { supabase } from '@/integrations/supabase/client';
import { rpcCall } from '../network/RpcClient';
import { logger, bumpCounter } from '../observability/logger';

export type SecurityEventType =
  | 'fullscreen_exit'
  | 'tab_hidden'
  | 'window_blur'
  | 'devtools_open'
  | 'copy_attempt'
  | 'paste_attempt'
  | 'cut_attempt'
  | 'blocked_shortcut'
  | 'external_display'
  | 'screen_share'
  | 'pip_active'
  | 'multi_monitor'
  | 'camera_unavailable'
  | 'microphone_unavailable'
  | 'permission_revoked'
  | 'object_detected'
  | 'multiple_persons'
  | 'head_deviation'
  | 'eye_deviation'
  | 'sound_high'
  | 'reconnect'
  | 'network_lost';

export type Severity = 'info' | 'warning' | 'critical';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
  ts: number;
  examId: string;
  studentId: string;
  correlationId: string;
}

type Listener = (e: SecurityEvent) => void;

const BUFFER_LIMIT = 200;

export class SecurityBus {
  private listeners = new Set<Listener>();
  private buffer: SecurityEvent[] = [];
  private draining = false;
  private disposed = false;

  constructor(private studentId: string, private examId: string, private correlationId: string) {}

  subscribe(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  emit(type: SecurityEventType, message: string, severity: Severity = 'warning', details?: Record<string, unknown>) {
    if (this.disposed) return;
    const event: SecurityEvent = {
      id: crypto.randomUUID(), type, severity, message, details,
      ts: Date.now(), examId: this.examId, studentId: this.studentId, correlationId: this.correlationId,
    };
    bumpCounter(`security.${type}`);
    for (const l of this.listeners) { try { l(event); } catch (e) { logger.warn('security_listener_err', { err: (e as Error).message }); } }
    this.buffer.push(event);
    if (this.buffer.length > BUFFER_LIMIT) this.buffer.shift();
    void this.drain();
  }

  private async drain() {
    if (this.draining || this.buffer.length === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    this.draining = true;
    try {
      while (this.buffer.length > 0) {
        const batch = this.buffer.splice(0, 20);
        try {
          await rpcCall(
            () => supabase.from('exam_sessions').update({
              warnings: batch.length,
              warning_details: batch.map(e => ({ type: e.type, message: e.message, severity: e.severity, timestamp: new Date(e.ts).toISOString(), details: JSON.parse(JSON.stringify(e.details ?? {})) })) as never,
              last_heartbeat: new Date().toISOString(),
            }).eq('student_id', this.studentId).eq('task_id', this.examId).eq('is_active', true),
            { key: `sec-events:${this.examId}`, retries: 2, dedupe: false },
          );
        } catch (err) {
          this.buffer.unshift(...batch);
          logger.warn('security_drain_failed', { err: (err as Error).message, remaining: this.buffer.length });
          break;
        }
      }
    } finally {
      this.draining = false;
    }
  }

  flushOnReconnect() { void this.drain(); }

  dispose() { this.disposed = true; this.listeners.clear(); this.buffer = []; }
}
