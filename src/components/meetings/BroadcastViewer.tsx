import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BroadcastSignaling, StreamViewer } from '@/lib/liveConnection';
import { Badge } from '@/components/ui/badge';
import { Smartphone } from 'lucide-react';

interface Props {
  meetingId?: string;
  liveEventId?: string;
}

/**
 * Watches the active broadcast session of a meeting/event and renders every
 * connected phone camera as a live video tile.
 */
export const BroadcastViewer: React.FC<Props> = ({ meetingId, liveEventId }) => {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // Find the active broadcast session (realtime so it appears without reload)
  useEffect(() => {
    const col = meetingId ? 'meeting_id' : 'live_event_id';
    const id = meetingId || liveEventId;
    const find = async () => {
      const { data } = await (supabase as any)
        .from('broadcast_sessions')
        .select('id')
        .eq(col, id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      setSessionId(data?.id ?? null);
    };
    find();
    const ch = supabase
      .channel(`bcast-sess-${col}-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcast_sessions' }, find)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [meetingId, liveEventId]);

  // Connect as a viewer once a session exists
  useEffect(() => {
    if (!sessionId) return;
    let viewer!: StreamViewer;
    const signaling = new BroadcastSignaling(sessionId, (m) => viewer?.handleSignal(m));
    viewer = new StreamViewer(
      signaling,
      (publisherId, stream) => {
        setStreams((prev) => {
          const next = { ...prev };
          if (stream) next[publisherId] = stream;
          else delete next[publisherId];
          return next;
        });
      },
    );
    signaling.connect();

    // Ask publishers for their streams until we get at least one
    const want = setInterval(() => viewer.requestStreams(), 3000);
    viewer.requestStreams();

    // Register as a viewer (best effort — requires auth)
    if (user) {
      (supabase as any)
        .from('broadcast_viewers')
        .upsert({ session_id: sessionId, user_id: user.id, last_seen: new Date().toISOString() })
        .then(() => {});
    }

    return () => {
      clearInterval(want);
      viewer.destroy();
      signaling.close();
      setStreams({});
    };
  }, [sessionId, user?.id]);

  useEffect(() => {
    for (const [id, stream] of Object.entries(streams)) {
      const el = videoRefs.current[id];
      if (el && el.srcObject !== stream) el.srcObject = stream;
    }
  }, [streams]);

  const entries = Object.entries(streams);
  if (!sessionId) return null;

  return (
    <div className="border-t bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 mb-2">
        <Smartphone className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">Phone cameras</span>
        <Badge variant="outline" className="text-[10px]">{entries.length} live</Badge>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Waiting for a phone to connect…</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto">
          {entries.map(([id, stream]) => (
            <video
              key={id}
              ref={(el) => { videoRefs.current[id] = el; }}
              autoPlay
              playsInline
              className="w-48 rounded-md bg-black aspect-video object-cover flex-shrink-0"
            />
          ))}
        </div>
      )}
    </div>
  );
};
