/**
 * Retry a supabase read/mutation with exponential backoff on transient network errors.
 * Retries only when the returned object has `error` and it looks like a network/timeout
 * issue, or when the promise rejects. Does not retry on 4xx / RLS errors.
 */
export async function withRetry<T extends { error?: unknown } | unknown>(
  fn: () => Promise<T>,
  { retries = 3, baseMs = 250, maxMs = 2000 }: { retries?: number; baseMs?: number; maxMs?: number } = {},
): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < retries) {
    try {
      const res = await fn();
      const err = (res as { error?: unknown })?.error;
      if (!err) return res;
      const msg = String((err as Error)?.message || err).toLowerCase();
      const transient = msg.includes('network') || msg.includes('fetch') || msg.includes('timeout') || msg.includes('temporarily') || msg.includes('failed to fetch');
      if (!transient) return res;
      lastErr = err;
    } catch (e) {
      lastErr = e;
    }
    const delay = Math.min(maxMs, baseMs * Math.pow(2, attempt));
    await new Promise((r) => setTimeout(r, delay + Math.random() * 100));
    attempt += 1;
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? 'Request failed'));
}
