import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, VideoPresets } from 'livekit-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mic, MicOff, Video, VideoOff, MonitorUp, Maximize, Users, MessageSquare, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { liveRoomAction, type RoomKind } from './liveRoomApi';
interface Props { kind: RoomKind; id: string; onLeave: () => void; }
export function LiveVideoRoom({ kind, id, onLeave }: Props) {
  const roomRef = useRef<Room | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const leaveRef = useRef(onLeave); leaveRef.current = onLeave;
  const [status, setStatus] = useState('Connecting');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [canPublish, setCanPublish] = useState(false);
  const [moderator, setModerator] = useState(false);
  const [mic, setMic] = useState(false); const [camera, setCamera] = useState(false); const [screen, setScreen] = useState(false);
  const [count, setCount] = useState(1); const [busy, setBusy] = useState(false);
  const [showChat, setShowChat] = useState(false); const [text, setText] = useState('');
  const [messages, setMessages] = useState<{ name: string; text: string }[]>([]);
  const [needsAudio, setNeedsAudio] = useState(false);
  useEffect(() => {
    let cancelled = false; let syncing = false;
    const room = new Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: VideoPresets.h720.resolution } });
    roomRef.current = room;
    const refresh = () => {
      if (cancelled) return;
      setCount(room.remoteParticipants.size + 1);
      setCanPublish(room.localParticipant.permissions?.canPublish === true);
      setMic(room.localParticipant.isMicrophoneEnabled); setCamera(room.localParticipant.isCameraEnabled); setScreen(room.localParticipant.isScreenShareEnabled);
      videoRef.current?.replaceChildren(); audioRef.current?.replaceChildren();
      for (const participant of [room.localParticipant, ...room.remoteParticipants.values()]) {
        for (const publication of participant.trackPublications.values()) {
          const track = publication.track;
          if (!track || publication.isMuted) continue;
          if (track.kind === Track.Kind.Video) {
            const tile = document.createElement('div'); tile.className = 'relative aspect-video min-w-0 bg-muted rounded-md overflow-hidden';
            const video = track.attach(); video.className = 'w-full h-full object-contain';
            if (participant === room.localParticipant) video.muted = true;
            const label = document.createElement('span'); label.className = 'absolute bottom-2 left-2 bg-background/80 text-foreground text-xs px-2 py-1 rounded';
            label.textContent = participant.name || 'Participant';
            tile.append(video, label); videoRef.current?.append(tile);
          } else if (participant !== room.localParticipant) audioRef.current?.append(track.attach());
        }
      }
    };
    const events = [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ParticipantPermissionsChanged];
    events.forEach(event => room.on(event, refresh));
    room.on(RoomEvent.Reconnecting, () => setStatus('Reconnecting'));
    room.on(RoomEvent.Reconnected, () => { setStatus('Connected'); refresh(); });
    room.on(RoomEvent.Disconnected, () => { if (!cancelled) { setStatus('Disconnected'); setError('Connection ended. Reconnect to continue.'); } });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsAudio(!room.canPlaybackAudio));
    room.on(RoomEvent.DataReceived, (payload, participant) => {
      if (!participant || payload.byteLength > 4096) return;
      try { const body = JSON.parse(new TextDecoder().decode(payload)); if (typeof body.text === 'string') setMessages(m => [...m.slice(-99), { name: participant.name || 'Participant', text: body.text.slice(0, 1000) }]); } catch { /* Ignore malformed data. */ }
    });
    setError(''); setStatus('Connecting');
    (async () => {
      try {
        const connection = await liveRoomAction(kind, id, 'join');
        if (cancelled) return;
        setModerator(connection.moderator === true);
        await room.connect(connection.url, connection.token);
        if (cancelled) { await room.disconnect(); return; }
        setStatus('Connected'); refresh();
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : 'Unable to connect'); setStatus('Disconnected'); }
      }
    })();
    const timer = window.setInterval(async () => {
      if (cancelled || syncing || room.state !== 'connected') return;
      syncing = true;
      try { await liveRoomAction(kind, id, 'sync'); }
      catch (err) {
        if (err instanceof Error && err.message === 'This room has ended') { await room.disconnect(); leaveRef.current(); }
      } finally { syncing = false; }
    }, 10000);
    return () => { cancelled = true; clearInterval(timer); room.removeAllListeners(); void room.disconnect(); roomRef.current = null; videoRef.current?.replaceChildren(); audioRef.current?.replaceChildren(); };
  }, [kind, id, attempt]);
  const toggle = async (type: 'mic' | 'camera' | 'screen') => {
    const room = roomRef.current; if (!room || busy) return;
    setBusy(true);
    try {
      if (type === 'mic') await room.localParticipant.setMicrophoneEnabled(!mic);
      if (type === 'camera') await room.localParticipant.setCameraEnabled(!camera);
      if (type === 'screen') await room.localParticipant.setScreenShareEnabled(!screen);
      setMic(room.localParticipant.isMicrophoneEnabled); setCamera(room.localParticipant.isCameraEnabled); setScreen(room.localParticipant.isScreenShareEnabled);
    } catch { toast.error('Could not enable media. Check your browser permissions.'); } finally { setBusy(false); }
  };
  const send = async () => {
    const room = roomRef.current; if (!room || !text.trim()) return;
    try { await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ text: text.trim().slice(0, 1000) })), { reliable: true });
      setMessages(m => [...m.slice(-99), { name: 'You', text: text.trim().slice(0, 1000) }]); setText('');
    } catch { toast.error('Message could not be sent'); }
  };
  const muteAll = async (source: string) => { try { await liveRoomAction(kind, id, 'mute', { source }); } catch { toast.error('Could not mute participants'); } };
  return <div ref={rootRef} className="flex flex-1 min-w-0 min-h-0 flex-col bg-background">
    <div className="flex items-center justify-between p-2 border-b text-xs text-muted-foreground"><span>{status}</span><span className="flex items-center gap-1"><Users className="h-3 w-3" />{count}</span></div>
    {error && <div role="alert" className="p-4 text-center space-y-2"><p>{error}</p><Button variant="outline" onClick={() => setAttempt(a => a + 1)}>Reconnect</Button></div>}
    <div className="flex-1 min-h-0 overflow-y-auto p-2">
      {status === 'Connecting' && <Loader2 className="h-6 w-6 animate-spin mx-auto mt-8" />}
      <div ref={videoRef} className="grid grid-cols-1 md:grid-cols-2 gap-2" />
      {status === 'Connected' && !camera && !screen && <p className="text-center text-sm text-muted-foreground my-4">{canPublish ? 'Camera off' : 'Waiting for the presenter'}</p>}
    </div>
    <div ref={audioRef} className="hidden" />
    {needsAudio && <Button variant="outline" onClick={() => void roomRef.current?.startAudio()}>Enable audio</Button>}
    {showChat && <div className="border-t p-2"><div className="max-h-40 overflow-y-auto text-sm">{messages.map((m, i) => <p key={i}><strong>{m.name}: </strong>{m.text}</p>)}</div><div className="flex gap-2 mt-2"><Input aria-label="Meeting message" value={text} maxLength={1000} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void send(); }} /><Button size="icon" aria-label="Send message" onClick={send}><Send className="h-4 w-4" /></Button></div></div>}
    <div className="border-t flex flex-wrap justify-center gap-2 p-2">
      {canPublish && <><Button size="icon" variant={mic ? 'default' : 'outline'} title={mic ? 'Mute microphone' : 'Enable microphone'} aria-label={mic ? 'Mute microphone' : 'Enable microphone'} disabled={busy} onClick={() => toggle('mic')}>{mic ? <Mic /> : <MicOff />}</Button><Button size="icon" variant={camera ? 'default' : 'outline'} title="Toggle camera" aria-label="Toggle camera" disabled={busy} onClick={() => toggle('camera')}>{camera ? <Video /> : <VideoOff />}</Button></>}
      {moderator && <Button size="icon" variant={screen ? 'default' : 'outline'} title="Share screen" aria-label="Share screen" disabled={busy} onClick={() => toggle('screen')}><MonitorUp /></Button>}
      <Button size="icon" variant="outline" title="Fullscreen" aria-label="Fullscreen" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void rootRef.current?.requestFullscreen().catch(() => toast.error('Fullscreen unavailable')); }}><Maximize /></Button>
      {kind === 'meeting' && <Button size="icon" variant="outline" title="Chat" aria-label="Chat" onClick={() => setShowChat(v => !v)}><MessageSquare /></Button>}
      {moderator && <><Button variant="outline" size="sm" onClick={() => muteAll('microphone')}>Mute all</Button><Button variant="outline" size="sm" onClick={() => muteAll('camera')}>Stop cameras</Button></>}
    </div>
  </div>;
}
