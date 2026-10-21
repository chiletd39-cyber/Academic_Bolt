import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck, Loader2, KeyRound, SkipForward } from 'lucide-react';
import { trustCurrentDevice } from '@/lib/mfaDevice';

type Mode = 'loading' | 'enroll' | 'challenge';

/**
 * MFA is optional. Query params:
 *   ?setup=1     → force enroll flow (from profile settings or post-signup)
 *   ?optional=1  → show a "Skip for now" button (post-signup offer)
 */
export default function MfaPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, signOut } = useAuth() as any;
  const [params] = useSearchParams();
  const isOptional = params.get('optional') === '1';
  const forceSetup = params.get('setup') === '1';

  const [mode, setMode] = useState<Mode>('loading');
  const [qrSvg, setQrSvg] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [factorId, setFactorId] = useState<string>('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verified = factors?.totp?.find(f => f.status === 'verified');

        if (verified && !forceSetup) {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aal?.currentLevel === 'aal2') {
            navigate('/dashboard', { replace: true });
            return;
          }
          setFactorId(verified.id);
          setMode('challenge');
          return;
        }

        // Enrollment path. Clean up any unverified leftovers first.
        for (const f of factors?.totp ?? []) {
          if (f.status !== 'verified') {
            await supabase.auth.mfa.unenroll({ factorId: f.id });
          }
        }
        const enroll = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Academic System' });
        if (enroll.error) throw enroll.error;
        setFactorId(enroll.data.id);
        setQrSvg(enroll.data.totp.qr_code);
        setSecret(enroll.data.totp.secret);
        setMode('enroll');
      } catch (e: any) {
        toast({ title: 'MFA setup error', description: e.message, variant: 'destructive' });
      }
    })();
  }, [forceSetup, navigate, toast]);

  const finishSuccess = () => {
    if (profile?.user_id) trustCurrentDevice(profile.user_id);
    navigate('/dashboard', { replace: true });
  };

  const verifyEnrollment = async () => {
    setSubmitting(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId, challengeId: challenge.data.id, code: code.trim(),
      });
      if (verify.error) throw verify.error;
      toast({ title: 'Two-factor authentication enabled' });
      finishSuccess();
    } catch (e: any) {
      toast({ title: 'Invalid code', description: e.message, variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  const submitChallenge = async () => {
    setSubmitting(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId, challengeId: challenge.data.id, code: code.trim(),
      });
      if (verify.error) throw verify.error;
      finishSuccess();
    } catch (e: any) {
      toast({ title: 'Invalid code', description: e.message, variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  const skipForNow = async () => {
    // Skip enrollment: unenroll the pending factor so the user is not locked into a challenge.
    try {
      if (factorId) await supabase.auth.mfa.unenroll({ factorId });
    } catch { /* ignore */ }
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            {mode === 'challenge' ? 'Two-factor verification' : 'Set up two-factor authentication'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'loading' && (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          )}

          {mode === 'enroll' && (
            <>
              <p className="text-sm text-muted-foreground">
                {isOptional
                  ? 'Add an extra layer of security to your account. You can also skip this and enable it later from Profile → Security.'
                  : 'Scan this QR code with Google Authenticator, 1Password, or any TOTP app, then enter the 6-digit code.'}
              </p>
              <div className="flex justify-center bg-white p-3 rounded-md" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div className="text-xs text-muted-foreground break-all">
                Or enter this secret manually: <span className="font-mono">{secret}</span>
              </div>
              <div>
                <Label htmlFor="code">6-digit code</Label>
                <Input id="code" inputMode="numeric" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </div>
              <Button className="w-full" onClick={verifyEnrollment} disabled={code.length !== 6 || submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
                Enable two-factor
              </Button>
              {isOptional && (
                <Button variant="ghost" className="w-full" onClick={skipForNow} disabled={submitting}>
                  <SkipForward className="w-4 h-4 mr-2" /> Skip for now
                </Button>
              )}
            </>
          )}

          {mode === 'challenge' && (
            <>
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app. We'll remember this device for 30 days.
              </p>
              <div>
                <Label htmlFor="code">Authentication code</Label>
                <Input id="code" inputMode="numeric" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
              </div>
              <Button className="w-full" onClick={submitChallenge} disabled={code.length !== 6 || submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Verify
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => { signOut?.(); navigate('/', { replace: true }); }}>
                Cancel and sign out
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
