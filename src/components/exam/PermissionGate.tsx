import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Camera, Mic, Monitor, ShieldCheck, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PermissionGateProps {
  needsCamera: boolean;
  needsMic: boolean;
  needsScreen: boolean;
  onAllGranted: () => void;
}

type Status = 'idle' | 'requesting' | 'granted' | 'denied';

export const PermissionGate: React.FC<PermissionGateProps> = ({
  needsCamera,
  needsMic,
  needsScreen,
  onAllGranted,
}) => {
  const [camStatus, setCamStatus] = useState<Status>('idle');
  const [micStatus, setMicStatus] = useState<Status>('idle');
  const [screenStatus, setScreenStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const camDone = !needsCamera || camStatus === 'granted';
  const micDone = !needsMic || micStatus === 'granted';
  const screenDone = !needsScreen || screenStatus === 'granted';
  const allDone = camDone && micDone && screenDone;

  const requestAV = useCallback(async () => {
    setError(null);
    if (needsCamera) setCamStatus('requesting');
    if (needsMic) setMicStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: needsCamera,
        audio: needsMic,
      });
      stream.getTracks().forEach(t => t.stop());
      if (needsCamera) setCamStatus('granted');
      if (needsMic) setMicStatus('granted');
    } catch (e) {
      if (needsCamera) setCamStatus('denied');
      if (needsMic) setMicStatus('denied');
      setError('Camera/microphone access is required to start the exam.');
    }
  }, [needsCamera, needsMic]);

  const requestScreen = useCallback(async () => {
    setError(null);
    setScreenStatus('requesting');
    try {
      const ms: any = navigator.mediaDevices as any;
      if (!ms.getDisplayMedia) {
        setScreenStatus('denied');
        setError('Your browser does not support screen sharing required for this exam.');
        return;
      }
      const stream: MediaStream = await ms.getDisplayMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      setScreenStatus('granted');
    } catch (e) {
      setScreenStatus('denied');
      setError('Screen sharing access is required to start the exam.');
    }
  }, []);

  const Row = ({ icon: Icon, label, status, sub }: any) => (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-lg border',
      status === 'granted' ? 'border-success/40 bg-success/5' :
      status === 'denied' ? 'border-destructive/40 bg-destructive/5' :
      'border-border bg-card'
    )}>
      <div className={cn(
        'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
        status === 'granted' ? 'bg-success/15 text-success' :
        status === 'denied' ? 'bg-destructive/15 text-destructive' :
        'bg-primary/10 text-primary'
      )}>
        {status === 'requesting' ? <Loader2 className="w-5 h-5 animate-spin" /> :
         status === 'granted' ? <CheckCircle2 className="w-5 h-5" /> :
         <Icon className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <span className={cn(
        'text-xs font-semibold px-2 py-1 rounded-full',
        status === 'granted' ? 'bg-success/20 text-success' :
        status === 'denied' ? 'bg-destructive/20 text-destructive' :
        'bg-muted text-muted-foreground'
      )}>
        {status === 'granted' ? 'Granted' : status === 'denied' ? 'Denied' : status === 'requesting' ? 'Asking…' : 'Required'}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
      <Card className="max-w-lg w-full shadow-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>Grant Exam Permissions</CardTitle>
              <CardDescription>You cannot start until all required access is granted.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {needsCamera && <Row icon={Camera} label="Camera" status={camStatus} sub="Live webcam monitoring during the exam" />}
          {needsMic && <Row icon={Mic} label="Microphone" status={micStatus} sub="Detect suspicious sounds and conversations" />}
          {needsScreen && <Row icon={Monitor} label="Screen Sharing" status={screenStatus} sub="Detect external displays and screen capture" />}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            {(needsCamera || needsMic) && !(camDone && micDone) && (
              <Button onClick={requestAV} variant="outline" className="w-full">
                <Camera className="w-4 h-4 mr-2" />
                Allow Camera & Microphone
              </Button>
            )}
            {needsScreen && !screenDone && (
              <Button onClick={requestScreen} variant="outline" className="w-full">
                <Monitor className="w-4 h-4 mr-2" />
                Share Your Screen
              </Button>
            )}
            <Button
              onClick={onAllGranted}
              disabled={!allDone}
              className="w-full"
              size="lg"
            >
              {allDone ? 'Start Secure Exam' : 'Grant All Permissions to Continue'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
