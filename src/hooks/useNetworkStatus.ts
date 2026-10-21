import { useEffect, useState, useRef } from 'react';

const OFFLINE_GRACE_MS = 2 * 60 * 1000; // 2 minutes

export interface NetworkStatus {
  online: boolean;
  offlineSince: number | null;
  graceExpired: boolean;
}

export const useNetworkStatus = () => {
  const [status, setStatus] = useState<NetworkStatus>({
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    offlineSince: null,
    graceExpired: false,
  });
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    const handleOffline = () => {
      setStatus({ online: false, offlineSince: Date.now(), graceExpired: false });
    };
    const handleOnline = () => {
      setStatus(prev => {
        // If we were offline, trigger a soft reload to recover state.
        if (prev.offlineSince) {
          // Give React a tick to flash banner before reloading.
          window.setTimeout(() => {
            try {
              window.dispatchEvent(new CustomEvent('network:recovered'));
            } catch {}
            // Reload to re-fetch all data and rehydrate sessions
            window.location.reload();
          }, 600);
        }
        return { online: true, offlineSince: null, graceExpired: false };
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Track grace expiry tick
    tickRef.current = window.setInterval(() => {
      setStatus(prev => {
        if (!prev.online && prev.offlineSince && !prev.graceExpired) {
          if (Date.now() - prev.offlineSince > OFFLINE_GRACE_MS) {
            return { ...prev, graceExpired: true };
          }
        }
        return prev;
      });
    }, 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  return status;
};

/**
 * Persists arbitrary form state to localStorage with a 2-minute TTL so that
 * brief disconnects (or accidental refreshes) don't lose user input.
 */
export const useOfflineDraft = <T,>(key: string, value: T, enabled = true) => {
  useEffect(() => {
    if (!enabled) return;
    try {
      localStorage.setItem(
        `draft:${key}`,
        JSON.stringify({ v: value, t: Date.now() })
      );
    } catch {}
  }, [key, value, enabled]);
};

export const loadOfflineDraft = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(`draft:${key}`);
    if (!raw) return null;
    const { v, t } = JSON.parse(raw);
    if (Date.now() - t > OFFLINE_GRACE_MS) {
      localStorage.removeItem(`draft:${key}`);
      return null;
    }
    return v as T;
  } catch {
    return null;
  }
};

export const clearOfflineDraft = (key: string) => {
  try { localStorage.removeItem(`draft:${key}`); } catch {}
};
