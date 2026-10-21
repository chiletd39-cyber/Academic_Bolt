/**
 * Client-side login-attempt tracker.
 *
 * We keep a per-(role, email, field) counter in localStorage so the sign-in
 * page can tell the user *which* input was wrong and how many tries remain
 * before the server-side rate limit will lock them out.
 *
 * Server-side rate limits remain the source of truth for actual blocking
 * (Supabase Auth for passwords, `check_rate_limit('admin_code', …)` for the
 * admin security code). This counter only drives UX messaging and resets to
 * zero on a successful sign-in.
 */

export type AttemptField = 'password' | 'admin_code';

const MAX_ATTEMPTS = 6;
const KEY_PREFIX = 'login_attempts:v1:';

const storageKey = (role: string, email: string, field: AttemptField) =>
  `${KEY_PREFIX}${role}:${email.trim().toLowerCase()}:${field}`;

const safeGet = (k: string): number => {
  try {
    const raw = localStorage.getItem(k);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
};

const safeSet = (k: string, v: number) => {
  try {
    if (v <= 0) localStorage.removeItem(k);
    else localStorage.setItem(k, String(v));
  } catch { /* storage disabled */ }
};

export const MAX_LOGIN_ATTEMPTS = MAX_ATTEMPTS;

/** Number of tries already used for this field. */
export const attemptsUsed = (role: string, email: string, field: AttemptField) =>
  safeGet(storageKey(role, email, field));

/** Number of tries remaining before the user hits the ceiling. */
export const attemptsLeft = (role: string, email: string, field: AttemptField) =>
  Math.max(0, MAX_ATTEMPTS - attemptsUsed(role, email, field));

/**
 * Register a failed attempt and return the updated "tries left" count.
 * When the count reaches zero the caller should surface the lockout copy.
 */
export const registerFailure = (
  role: string,
  email: string,
  field: AttemptField,
): number => {
  const k = storageKey(role, email, field);
  const next = safeGet(k) + 1;
  safeSet(k, next);
  return Math.max(0, MAX_ATTEMPTS - next);
};

/** Clear counters for this identity after a successful sign-in. */
export const clearAttempts = (role: string, email: string) => {
  (['password', 'admin_code'] as AttemptField[]).forEach((f) =>
    safeSet(storageKey(role, email, f), 0),
  );
};

/**
 * Build a human message describing what was wrong and how many tries are left.
 * Returns a lockout-worded string when `left <= 0`.
 */
export const attemptMessage = (
  field: AttemptField,
  left: number,
): string => {
  const label = field === 'password' ? 'password' : 'security code';
  if (left <= 0) {
    return `Too many wrong ${label} attempts. Please wait 15 minutes before trying again.`;
  }
  const tries = left === 1 ? '1 try' : `${left} tries`;
  return `Incorrect ${label}. ${tries} left before this account is temporarily locked.`;
};
