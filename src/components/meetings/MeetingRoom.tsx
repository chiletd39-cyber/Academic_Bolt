import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Hand, X, Check, Users, LogOut, Smartphone } from 'lucide-react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { BroadcastPanel } from '@/components/meetings/BroadcastPanel';
import { BroadcastViewer } from '@/components/meetings/BroadcastViewer';
import { toast } from 'sonner';
import { LiveVideoRoom } from './LiveVideoRoom';
import { liveRoomAction } from './liveRoomApi';

interface Props { meeting: any; onLeave: () => void; }

export const MeetingRoom: React.FC<Props> = ({ meeting, onLeave }) => {
  const { user, profile } = useAuth();
  const audit = useAuditLog();
  const isHost = meeting.host_id === user?.id || meeting.created_by === user?.id;
  const [requests, setRequests] = useState<any[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState(0);
  const [myStatus, setMyStatus] = useState<'attendee'|'speaker'|'monitor'>(isHost ? 'monitor' : 'attendee');
  const [showBroadcast, setShowBroadcast] = useState(false);
  const participantRowRef = useRef<string | null>(null);
  const joinTimeRef = useRef<number>(Date.now());

  // Record participation
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any).rpc('mark_meeting_attendance', {
        _meeting_id: meeting.id,
        _role: isHost ? 'monitor' : 'attendee',
        _device: { ua: navigator.userAgent },
      });
      if (!cancelled && data && !error) participantRowRef.current = data;
    })();
    audit('meeting_join', 'meeting', { id: meeting.id, label: meeting.title });
    return () => {
      const duration = Math.round((Date.now() - joinTimeRef.current) / 1000);
      if (participantRowRef.current) {
        (supabase as any).from('meeting_participants')
          .update({ left_at: new Date().toISOString(), duration_seconds: duration })
          .eq('id', participantRowRef.current).then(() => {});
      }
      audit('meeting_leave', 'meeting', { id: meeting.id, metadata: { duration } });
      cancelled = true;
    };
  }, [meeting.id]);

  // Realtime: speak requests + active speaker count
  useEffect(() => {
    const fetchReqs = async () => {
      const { data } = await (supabase as any)
        .from('meeting_speak_requests')
        .select('*').eq('meeting_id', meeting.id).order('created_at');
      setRequests(data || []);
      setActiveSpeakers((data || []).filter((r: any) => r.status === 'approved').length);
      const mine = (data || []).find((r: any) => r.user_id === user?.id && r.status === 'approved');
      if (!isHost) setMyStatus(mine ? 'speaker' : 'attendee');
    };
    fetchReqs();
    const ch = supabase
      .channel(`meeting-${meeting.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_speak_requests', filter: `meeting_id=eq.${meeting.id}` }, fetchReqs)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [meeting.id, user?.id, myStatus]);

  const raiseHand = async () => {
    const existing = requests.find(r => r.user_id === user?.id && r.status === 'pending');
    if (existing) { toast.info('Request already pending'); return; }
    if (!user) return;
    const { error } = await supabase.from('meeting_speak_requests').insert({
      meeting_id: meeting.id, user_id: user.id, user_name: profile?.full_name || '', status: 'pending',
    });
    if (error) { toast.error('Could not raise hand'); return; }
    toast.success('Hand raised');
  };

  const decide = async (req: any, approve: boolean) => {
    if (approve && activeSpeakers >= (meeting.max_active_speakers || 3)) {
      toast.error(`Max speakers (${meeting.max_active_speakers || 3}) reached — remove one first`);
      return;
    }
    try { await liveRoomAction('meeting', meeting.id, 'moderate', { requestId: req.id, decision: approve ? 'approved' : 'rejected' }); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Could not update request'); return; }
    audit(approve ? 'approve' : 'reject', 'meeting', { id: meeting.id, label: `speak request from ${req.user_name}` });
  };

  const removeSpeaker = async (req: any) => {
    try { await liveRoomAction('meeting', meeting.id, 'moderate', { requestId: req.id, decision: 'removed' }); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Could not remove speaker'); return; }
    audit('reject', 'meeting', { id: meeting.id, label: `removed speaker ${req.user_name}` });
  };

  const endMeeting = async () => {
    try { await liveRoomAction('meeting', meeting.id, 'end'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Could not end meeting'); return; }
    audit('meeting_end', 'meeting', { id: meeting.id, label: meeting.title });
    onLeave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">{meeting.title}</h2>
          <Badge variant="outline">Host: {meeting.host_name || '—'}</Badge>
          <Badge>{myStatus}</Badge>
          <Badge variant="secondary"><Users className="h-3 w-3 mr-1" />{activeSpeakers}/{meeting.max_active_speakers || 3} speakers</Badge>
        </div>
        <div className="flex gap-2">
          {!isHost && myStatus === 'attendee' && (
            <Button size="sm" variant="outline" onClick={raiseHand}><Hand className="h-4 w-4 mr-1" />Raise hand</Button>
          )}
          {isHost && (
            <Button size="sm" variant="outline" onClick={() => setShowBroadcast(true)}>
              <Smartphone className="h-4 w-4 mr-1" />Phone camera
            </Button>
          )}
          {isHost && <Button size="sm" variant="destructive" onClick={endMeeting}>End meeting</Button>}
          <Button size="sm" variant="ghost" onClick={onLeave}><LogOut className="h-4 w-4 mr-1" />Leave</Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex overflow-auto">
        <LiveVideoRoom kind="meeting" id={meeting.id} onLeave={onLeave} />
        {isHost && (
          <Card className="w-72 m-2 p-3 overflow-y-auto">
            <h3 className="font-semibold mb-2 text-sm">Speak requests</h3>
            {requests.filter(r => r.status === 'pending').length === 0 && (
              <p className="text-xs text-muted-foreground">No pending requests</p>
            )}
            {requests.filter(r => r.status === 'pending').map(r => (
              <div key={r.id} className="flex items-center justify-between py-1.5 border-b text-sm">
                <span>{r.user_name}</span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => decide(r, true)}><Check className="h-4 w-4 text-green-500" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => decide(r, false)}><X className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
            <h3 className="font-semibold mt-4 mb-2 text-sm">Active speakers</h3>
            {requests.filter(r => r.status === 'approved').map(r => (
              <div key={r.id} className="flex items-center justify-between py-1.5 border-b text-sm">
                <span>{r.user_name}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeSpeaker(r)}><X className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
          </Card>
        )}
      </div>
      <BroadcastViewer meetingId={meeting.id} />
      {isHost && (
        <BroadcastPanel meetingId={meeting.id} open={showBroadcast} onOpenChange={setShowBroadcast} />
      )}
    </div>
  );
};
