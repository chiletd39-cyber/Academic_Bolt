import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { isDeviceTrusted } from '@/lib/mfaDevice';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * MFA policy:
 * - MFA is OPTIONAL. It is offered during account creation and can be enabled
 *   later from Profile → Security.
 * - If the user has enrolled a verified TOTP factor, they must clear it (aal2)
 *   on any device that has not been marked as "trusted" in the last 30 days.
 * - No enrolled factor OR trusted device => bypass /mfa entirely.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const location = useLocation();
  const [mfaCheck, setMfaCheck] = useState<'pending' | 'ok' | 'required' | 'unavailable'>('pending');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile) { setMfaCheck('ok'); return; }
      setMfaCheck('pending');

      // Retry transient failures a few times before making a decision.
      const listFactors = async () => {
        let lastErr: unknown = null;
        for (let i = 0; i < 3; i++) {
          try {
            const { data, error } = await supabase.auth.mfa.listFactors();
            if (error) throw error;
            return data;
          } catch (e) {
            lastErr = e;
            await new Promise(r => setTimeout(r, 400 * (i + 1)));
          }
        }
        throw lastErr;
      };

      let factors;
      try {
        factors = await listFactors();
      } catch {
        // Enrollment status unknown — never grant protected access on an unresolved check.
        if (!cancelled) setMfaCheck('unavailable');
        return;
      }
      if (cancelled) return;

      const hasVerified = !!factors?.totp?.some(f => f.status === 'verified');
      if (!hasVerified) { setMfaCheck('ok'); return; }

      try {
        const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) throw error;
        if (cancelled) return;
        if (aal?.currentLevel === 'aal2') { setMfaCheck('ok'); return; }
      } catch {
        // Assurance level unknown for an MFA-enrolled user — require verification.
        if (!cancelled) setMfaCheck('required');
        return;
      }

      if (isDeviceTrusted(profile.user_id)) { setMfaCheck('ok'); return; }
      setMfaCheck('required');
    })();
    return () => { cancelled = true; };
  }, [profile?.user_id, attempt]);

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;

  if (!profile) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="text-muted-foreground text-sm">Loading your profile...</p>
      </div>
    );
  }

  if (mfaCheck === 'pending') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (mfaCheck === 'unavailable') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground max-w-sm">
          We couldn’t confirm your account’s security settings. Please check your connection and try again.
        </p>
        <button
          onClick={() => setAttempt(a => a + 1)}
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent active:scale-[0.97] transition"
        >
          Try again
        </button>
      </div>
    );
  }

  if (mfaCheck === 'required' && location.pathname !== '/mfa') {
    return <Navigate to="/mfa" replace />;
  }

  return <>{children}</>;
};
