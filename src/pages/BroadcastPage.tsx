import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { BroadcastSignaling, PhonePublisher } from '@/lib/liveConnection';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Video, VideoOff, Loader2, ShieldX } from 'lucide-react';

type PageState =
  | { phase: 'joining' }
  | { phase: 'error'; message: string }
  | { phase: 'live'; title: string }
  | { phase: 'ended' };

/**
 * Public phone-camera page. A teacher scans the QR link, this page redeems
 * the token (no account needed), turns on the camera and publishes the
 * stream into the meeting/event via WebRTC.
 */
const BroadcastPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ phase: 'joining' });
  const [peerCount, setPeerCount] = useState(0);
  const [cameraOn, setCameraOn] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const publisherRef = useRef<PhonePublisher | null>(null);
  const signalingRef = useRef<BroadcastSignaling | null>(null);
  const sourceRef = useRef<{ sourceId: string; token: string } | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const cleanup = () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      publisherRef.current?.destroy();
      signalingRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };

    (async () => {
      if (!token) {
        setState({ phase: 'error', message: 'This broadcast link is not valid.' });
        return;
      }
      // 1. Redeem the token (works signed out)
      const { data, error } = await (supabase as any).rpc('redeem_broadcast_token', {
        _token: token,
        _device_label: `${/Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Phone' : 'Device'}`,
        _user_agent: navigator.userAgent,
      });
      if (cancelled) return;
      if (error || !data?.ok) {
        setState({ phase: 'error', message: error?.message || 'This broadcast link is not valid.' });
        return;
      }
      sourceRef.current = { sourceId: data.source_id, token };

      // 2. Camera
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } catch {
        setState({
          phase: 'error',
          message: 'Camera access was denied. Allow camera and microphone, then reload this page.',
        });
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // 3. Publish over the shared live channel
      const signaling = new BroadcastSignaling(data.session_id, (m) => publisherRef.current?.handleSignal(m));
      signalingRef.current = signaling;
      signaling.connect();
      publisherRef.current = new PhonePublisher(signaling, stream, setPeerCount);

      // 4. Heartbeat keeps the device registered; server can end it any time
      heartbeatRef.current = setInterval(async () => {
        const src = sourceRef.current;
        if (!src) return;
        const { data: hb } = await (supabase as any).rpc('broadcast_source_heartbeat', {
          _source_id: src.sourceId,
          _token: src.token,
          _stop: false,
        });
        if (hb && hb.ok === false) {
          cleanup();
          setState({ phase: 'ended' });
        }
      }, 15000);

      setState({ phase: 'live', title: data.title || 'Broadcast' });
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [token]);

  const stop = async () => {
    const src = sourceRef.current;
    if (src) {
      await (supabase as any).rpc('broadcast_source_heartbeat', {
        _source_id: src.sourceId,
        _token: src.token,
        _stop: true,
      });
    }
    setState({ phase: 'ended' });
  };

  const toggleCamera = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !cameraOn;
    stream.getVideoTracks().forEach((t) => (t.enabled = next));
    setCameraOn(next);
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-5 space-y-4">
          {state.phase === 'joining' && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Connecting your camera…</p>
            </div>
          )}

          {state.phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <ShieldX className="h-10 w-10 text-destructive" />
              <h1 className="font-semibold">Cannot start broadcast</h1>
              <p className="text-sm text-muted-foreground">{state.message}</p>
            </div>
          )}

          {state.phase === 'ended' && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <VideoOff className="h-10 w-10 text-muted-foreground" />
              <h1 className="font-semibold">Broadcast ended</h1>
              <p className="text-sm text-muted-foreground">This phone is no longer streaming. You can close this page.</p>
            </div>
          )}

          {state.phase === 'live' && (
            <>
              <div className="flex items-center justify-between">
                <h1 className="font-semibold truncate">{state.title}</h1>
                <Badge variant="default" className="animate-pulse">LIVE</Badge>
              </div>
              <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg bg-black aspect-video object-cover" />
              <p className="text-xs text-muted-foreground text-center">
                Streaming to {peerCount} viewer{peerCount === 1 ? '' : 's'} — keep this page open.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={toggleCamera}>
                  {cameraOn ? <VideoOff className="h-4 w-4 mr-1" /> : <Video className="h-4 w-4 mr-1" />}
                  {cameraOn ? 'Pause camera' : 'Resume camera'}
                </Button>
                <Button variant="destructive" className="flex-1" onClick={stop}>Stop broadcast</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BroadcastPage;
