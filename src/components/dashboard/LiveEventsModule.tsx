import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Radio, Plus, Play, Send, MessageSquare, Trash2, Smartphone } from 'lucide-react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { BroadcastPanel } from '@/components/meetings/BroadcastPanel';
import { BroadcastViewer } from '@/components/meetings/BroadcastViewer';
import { toast } from 'sonner';
import { LiveVideoRoom } from '@/components/meetings/LiveVideoRoom';
import { liveRoomAction } from '@/components/meetings/liveRoomApi';

const ROLES = ['student','teacher','parent','admin'];

export const LiveEventsModule: React.FC = () => {
  const { user, profile, role } = useAuth();
  const audit = useAuditLog();
  const canCreate = role === 'admin' || role === 'teacher';
  const isAdmin = role === 'admin';
  const [events, setEvents] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<string[]>([]);

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [start, setStart] = useState('');
  const [selRoles, setSelRoles] = useState<string[]>([]);
  const [selClass, setSelClass] = useState('');

  const load = async () => {
    const { data } = await (supabase as any).from('live_events').select('*').order('created_at', { ascending: false });
    setEvents(data || []);
  };
  useEffect(() => {
    load();
    supabase.from('classes').select('name').then(({ data }) => setClasses((data || []).map((c: any) => c.name)));
    const ch = supabase.channel('events-list').on('postgres_changes', { event: '*', schema: 'public', table: 'live_events' }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const create = async () => {
    if (!title.trim()) { toast.error('Title required'); return; }
    const room_code = Math.random().toString(36).slice(2, 10);
    const { data, error } = await (supabase as any).from('live_events').insert({
      title, description: desc, host_id: user!.id, host_name: profile?.full_name || "",
      scheduled_start: start ? new Date(start).toISOString() : new Date().toISOString(),
      audience: { roles: selRoles, classes: selClass ? [selClass] : [] },
      room_code, created_by: user!.id, created_by_name: profile?.full_name || "",
    }).select().single();
    if (error) { toast.error(error.message); return; }
    const aud: any[] = [];
    if (selClass) aud.push({ event_id: data.id, class_name: selClass });
    for (const r of selRoles) aud.push({ event_id: data.id, role_target: r });
    if (aud.length) await (supabase as any).from('live_event_audience').insert(aud);
    audit('create', 'live_event', { id: data.id, label: title });
    toast.success('Live event created');
    setOpen(false); setTitle(''); setDesc(''); setStart(''); setSelRoles([]); setSelClass('');
    load();
  };

  const remove = async (e: any) => {
    if (!confirm(`Delete "${e.title}"?`)) return;
    await (supabase as any).from('live_events').delete().eq('id', e.id);
    audit('delete', 'live_event', { id: e.id, label: e.title });
    load();
  };

  if (active) return <LiveEventRoom event={active} onLeave={() => { setActive(null); load(); }} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Radio className="h-6 w-6" />Live events & broadcasts</h2>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New event</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create live event</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
                <div><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} /></div>
                <div><Label>Starts at</Label><Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></div>
                <div><Label>Audience class</Label>
                  <Select value={selClass || 'none'} onValueChange={v => setSelClass(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— none —</SelectItem>
                      {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Audience roles</Label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {ROLES.map(r => (
                      <Badge key={r} variant={selRoles.includes(r) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => setSelRoles(s => s.includes(r) ? s.filter(x => x!==r) : [...s, r])}>{r}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {isAdmin && <Button variant="outline" asChild><a href="/dashboard/live-analytics">Analytics</a></Button>}
      </div>

      <div className="grid gap-3">
        {events.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
        {events.map(e => (
          <Card key={e.id}>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{e.title}</h3>
                  <Badge variant={e.status === 'live' ? 'default' : 'outline'}>{e.status}</Badge>
                  <span className="text-xs text-muted-foreground">Posted by {e.created_by_name}</span>
                </div>
                {e.description && <p className="text-sm text-muted-foreground mt-1">{e.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">{e.scheduled_start ? new Date(e.scheduled_start).toLocaleString() : ''}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={async () => {
                  if (e.status === 'scheduled') {
                    await (supabase as any).from('live_events').update({ status: 'live', started_at: new Date().toISOString() }).eq('id', e.id);
                    audit('event_start', 'live_event', { id: e.id, label: e.title });
                  }
                  setActive(e);
                }}><Play className="h-4 w-4 mr-1" />{e.host_id === user?.id ? 'Go live' : 'Watch'}</Button>
                {(e.host_id === user?.id || isAdmin) && <Button size="sm" variant="ghost" onClick={() => remove(e)}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

const LiveEventRoom: React.FC<{ event: any; onLeave: () => void }> = ({ event, onLeave }) => {
  const { user, profile } = useAuth();
  const audit = useAuditLog();
  const isHost = event.host_id === user?.id || event.created_by === user?.id;
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [showBroadcast, setShowBroadcast] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const { data } = await (supabase as any).from('live_event_comments').select('*').eq('event_id', event.id).order('created_at');
    setComments(data || []);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel(`event-${event.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_event_comments', filter: `event_id=eq.${event.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [event.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [comments]);

  const send = async () => {
    if (!text.trim()) return;
    await (supabase as any).from('live_event_comments').insert({
      event_id: event.id, user_id: user!.id, user_name: profile?.full_name || "", user_role: profile?.role || "", content: text,
    });
    setText('');
  };

  const endEvent = async () => {
    try { await liveRoomAction('event', event.id, 'end'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Could not end event'); return; }
    audit('event_end', 'live_event', { id: event.id, label: event.title });
    onLeave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{event.title}</h2>
          <Badge>{isHost ? 'Presenter' : 'Viewer'}</Badge>
        </div>
        <div className="flex gap-2">
          {isHost && (
            <Button size="sm" variant="outline" onClick={() => setShowBroadcast(true)}>
              <Smartphone className="h-4 w-4 mr-1" />Phone camera
            </Button>
          )}
          {isHost && <Button size="sm" variant="destructive" onClick={endEvent}>End event</Button>}
          <Button size="sm" variant="ghost" onClick={onLeave}>Leave</Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex overflow-auto">
        <LiveVideoRoom kind="event" id={event.id} onLeave={onLeave} />
        <Card className="w-80 m-2 flex flex-col">
          <div className="p-3 border-b flex items-center gap-2"><MessageSquare className="h-4 w-4" /><span className="font-semibold text-sm">Live chat</span></div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {comments.map(c => (
              <div key={c.id}><span className="font-medium">{c.user_name}</span> <Badge variant="outline" className="text-[10px]">{c.user_role}</Badge><div className="text-muted-foreground">{c.content}</div></div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="p-2 border-t flex gap-1">
            <Input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Comment…" />
            <Button size="icon" onClick={send}><Send className="h-4 w-4" /></Button>
          </div>
        </Card>
      </div>
      <BroadcastViewer liveEventId={event.id} />
      {isHost && (
        <BroadcastPanel liveEventId={event.id} open={showBroadcast} onOpenChange={setShowBroadcast} />
      )}
    </div>
  );
};
