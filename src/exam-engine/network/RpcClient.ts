/**
 * Wraps supabase RPC/read/write with:
 *   - single-flight (concurrent identical calls collapse to one promise)
 *   - exponential backoff on transient errors (network/timeout/fetch)
 *   - circuit breaker (opens after N consecutive failures, 15s cool-off)
 *   - offline awareness (rejects immediately when navigator.onLine === false)
 */
import { logger, bumpCounter } from '../observability/logger';
import { NetworkError, isTransient } from '../errors/ExamError';

const inFlight = new Map<string, Promise<unknown>>();

interface Breaker { failures: number; openedAt: number; }
const breakers = new Map<string, Breaker>();
const FAILURE_THRESHOLD = 5;
const COOL_OFF_MS = 15_000;

function getBreaker(key: string): Breaker {
  let b = breakers.get(key);
  if (!b) { b = { failures: 0, openedAt: 0 }; breakers.set(key, b); }
  return b;
}

export interface RetryOpts {
  key: string;
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  dedupe?: boolean;
  timeoutMs?: number;
}

async function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new NetworkError(`timeout after ${ms}ms`)), ms);
    Promise.resolve(p).then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
  });
}

export async function rpcCall<T>(fn: () => PromiseLike<T>, opts: RetryOpts): Promise<T> {
  const { key, retries = 3, baseMs = 300, maxMs = 4_000, dedupe = true, timeoutMs = 20_000 } = opts;

  if (dedupe) {
    const existing = inFlight.get(key) as Promise<T> | undefined;
    if (existing) { bumpCounter('rpc.dedup_hits'); return existing; }
  }

  const breaker = getBreaker(key);
  if (breaker.openedAt && Date.now() - breaker.openedAt < COOL_OFF_MS) {
    bumpCounter('rpc.circuit_open_rejects');
    throw new NetworkError(`Service temporarily unavailable (${key}), retrying in ${Math.ceil((COOL_OFF_MS - (Date.now() - breaker.openedAt))/1000)}s`);
  }

  const execute = async (): Promise<T> => {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= retries) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new NetworkError('offline');
      }
      try {
        const res = await withTimeout(fn(), timeoutMs);
        // Supabase returns { data, error } — surface `error` as throw for retry logic.
        const err = (res as { error?: unknown })?.error;
        if (err) {
          if (!isTransient(err) || attempt === retries) {
            breaker.failures++;
            if (breaker.failures >= FAILURE_THRESHOLD) { breaker.openedAt = Date.now(); breaker.failures = 0; logger.warn('circuit_open', { key }); }
            return res; // Non-transient — return as-is so caller inspects `error`.
          }
          lastErr = err;
        } else {
          breaker.failures = 0; breaker.openedAt = 0;
          bumpCounter('rpc.success');
          return res;
        }
      } catch (e) {
        lastErr = e;
        if (!isTransient(e) || attempt === retries) {
          breaker.failures++;
          if (breaker.failures >= FAILURE_THRESHOLD) { breaker.openedAt = Date.now(); breaker.failures = 0; logger.warn('circuit_open', { key }); }
          throw e instanceof Error ? e : new NetworkError(String(e));
        }
      }
      const backoff = Math.min(maxMs, baseMs * Math.pow(2, attempt)) + Math.random() * 250;
      bumpCounter('rpc.retry');
      logger.info('rpc_retry', { key, attempt, delay: Math.round(backoff) });
      await delay(backoff);
      attempt++;
    }
    throw lastErr instanceof Error ? lastErr : new NetworkError(String(lastErr));
  };

  const promise = execute().finally(() => { if (dedupe) inFlight.delete(key); });
  if (dedupe) inFlight.set(key, promise);
  return promise;
}
