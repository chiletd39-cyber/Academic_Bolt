// Lightweight per-device "trusted device" flag for MFA.
// A trusted device does not need to enter the 6-digit code on subsequent logins.
// Trust is stored in localStorage (per browser+profile) and expires after 30 days.

const TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const key = (userId: string) => `mfa_trusted_device:${userId}`;

export function trustCurrentDevice(userId: string) {
  try {
    localStorage.setItem(key(userId), String(Date.now()));
  } catch { /* ignore */ }
}

export function isDeviceTrusted(userId: string): boolean {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    if (Date.now() - ts > TRUST_TTL_MS) {
      localStorage.removeItem(key(userId));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function revokeDeviceTrust(userId: string) {
  try { localStorage.removeItem(key(userId)); } catch { /* ignore */ }
}
