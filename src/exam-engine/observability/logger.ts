/**
 * Structured logger with correlation-id tagging. Non-PII by design.
 * Wraps browser console + optional remote sink (audit_logs via supabase).
 */
import { logger as baseLogger } from '@/lib/observability';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  examId?: string;
  sessionId?: string;
  studentId?: string;
  phase?: string;
  correlationId?: string;
  [k: string]: unknown;
}

const globalTags: LogContext = {};

export function setLogContext(ctx: Partial<LogContext>) {
  Object.assign(globalTags, ctx);
}

export function clearLogContext() {
  for (const k of Object.keys(globalTags)) delete (globalTags as Record<string, unknown>)[k];
}

export function newCorrelationId(): string {
  return (crypto as Crypto).randomUUID();
}

function scrub(payload: unknown): unknown {
  if (payload == null) return payload;
  if (typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.map(scrub);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (/answer|password|token|secret|question|email|phone/i.test(k)) {
      out[k] = '[redacted]';
    } else {
      out[k] = scrub(v);
    }
  }
  return out;
}

function emit(level: LogLevel, message: string, data?: unknown) {
  const entry = {
    level,
    message,
    ts: new Date().toISOString(),
    ...globalTags,
    data: scrub(data),
  };
  if (level === 'error') baseLogger.error(message, entry);
  else if (level === 'warn') baseLogger.warn(message, entry);
  else baseLogger.info(message, entry);
}

export const logger = {
  debug: (m: string, d?: unknown) => emit('debug', m, d),
  info:  (m: string, d?: unknown) => emit('info',  m, d),
  warn:  (m: string, d?: unknown) => emit('warn',  m, d),
  error: (m: string, d?: unknown) => emit('error', m, d),
};

/** Increment a named counter (in-memory; surfaced via getTelemetrySnapshot). */
const counters = new Map<string, number>();
export function bumpCounter(name: string, by = 1) {
  counters.set(name, (counters.get(name) ?? 0) + by);
}
export function getTelemetrySnapshot(): Record<string, number> {
  return Object.fromEntries(counters);
}
