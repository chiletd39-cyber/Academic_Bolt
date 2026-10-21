import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Video, Plus, Play, Clock, Users, Trash2, FileText, Loader2 } from 'lucide-react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { MeetingRoom } from '@/components/meetings/MeetingRoom';
import { toast } from 'sonner';

const ROLES = ['student', 'teacher', 'parent', 'admin'];

export const MeetingsModule: React.FC = () => {
  const { user, profile, role } = useAuth();
  const audit = useAuditLog();
  const canCreate = role === 'admin' || role === 'teacher';

  const [meetings, setMeetings] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [reportFor, setReportFor] = useState<any | null>(null);
  const [report, setReport] = useState<any | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [kind, setKind] = useState<'scheduled'|'instant'>('scheduled');
  const [start, setStart] = useState('');
  const [maxSpk, setMaxSpk] = useState('3');
  const [selRole, setSelRole] = useState<string>('');
  const [selClass, setSelClass] = useState<string>('');

  const load = async () => {
    const { data } = await (supabase as any).from('meetings').select('*').order('created_at', { ascending: false });
    setMeetings(data || []);
  };
  const loadClasses = async () => {
    if (role === 'admin') {
      const { data } = await supabase.from('classes').select('name');
      setClasses((data || []).map((c: any) => c.name));
    } else if (role === 'teacher') {
      const { data } = await (supabase as any).from('subjects').select('class_name').eq('teacher_id', user!.id);
      setClasses(Array.from(new Set((data || []).map((s: any) => s.class_name))));
    }
  };

  useEffect(() => {
    load(); loadClasses();
    const ch = supabase.channel('meetings-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const create = async () => {
    if (!title.trim()) { toast.error('Title required'); return; }
    const room_code = Math.random().toString(36).slice(2, 10);
    const startAt = kind === 'instant' ? new Date().toISOString() : (start ? new Date(start).toISOString() : null);
    const payload = {
      title, description: desc, host_id: user!.id, host_name: profile?.full_name || "",
      kind, status: kind === 'instant' ? 'live' : 'scheduled',
      scheduled_start: startAt, started_at: kind === 'instant' ? startAt : null,
      room_code, max_active_speakers: parseInt(maxSpk),
      audience: { roles: selRole ? [selRole] : [], classes: selClass ? [selClass] : [] },
      created_by: user!.id, created_by_name: profile?.full_name || "",
    };
    const { data, error } = await (supabase as any).from('meetings').insert(payload).select().single();
    if (error) { toast.error(error.message); return; }

    // invitees
    const inv: any[] = [];
    if (selClass) inv.push({ meeting_id: data.id, class_name: selClass });
    if (selRole) inv.push({ meeting_id: data.id, role_target: selRole });
    if (inv.length) await (supabase as any).from('meeting_invitees').insert(inv);

    audit('create', 'meeting', { id: data.id, label: title });
    toast.success('Meeting created');
    setOpenCreate(false);
    setTitle(''); setDesc(''); setStart(''); setSelRole(''); setSelClass('');
    load();
    if (kind === 'instant') setActive(data);
  };

  const remove = async (m: any) => {
    if (!confirm(`Delete "${m.title}"?`)) return;
    await (supabase as any).from('meetings').delete().eq('id', m.id);
    audit('delete', 'meeting', { id: m.id, label: m.title });
    load();
  };

  const join = async (m: any) => {
    if (m.status === 'ended') { toast.error('This meeting has ended'); return; }
    if (m.status === 'scheduled') {
      await (supabase as any).from('meetings').update({ status: 'live', started_at: new Date().toISOString() }).eq('id', m.id);
      audit('meeting_start', 'meeting', { id: m.id, label: m.title });
    }
    setActive(m);
  };

  const openReport = async (m: any) => {
    setReportFor(m);
    setReport(null);
    setReportLoading(true);
    const { data, error } = await (supabase as any).rpc('get_meeting_report', { _meeting_id: m.id });
    setReportLoading(false);
    if (error) { toast.error(error.message); setReportFor(null); return; }
    setReport(data);
  };

  if (active) return <MeetingRoom meeting={active} onLeave={() => { setActive(null); load(); }} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Video className="h-6 w-6" />Meetings</h2>
        {canCreate && (
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New meeting</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create meeting</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
                <div><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Type</Label>
                    <Select value={kind} onValueChange={(v: any) => setKind(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="instant">Start instantly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Max active speakers</Label>
                    <Select value={maxSpk} onValueChange={setMaxSpk}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                        <SelectItem value="5">5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {kind === 'scheduled' && (
                  <div><Label>Starts at</Label><Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></div>
                )}
                <div><Label>Invite class</Label>
                  <Select value={selClass || 'none'} onValueChange={v => setSelClass(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— none —</SelectItem>
                      {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Invite by role (one)</Label>
                  <Select value={selRole || 'none'} onValueChange={v => setSelRole(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="No role filter" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— none —</SelectItem>
                      {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-3">
        {meetings.length === 0 && <p className="text-muted-foreground text-sm">No meetings yet.</p>}
        {meetings.map(m => (
          <Card key={m.id}>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{m.title}</h3>
                  <Badge variant={m.status === 'live' ? 'default' : 'outline'}>{m.status}</Badge>
                  <span className="text-xs text-muted-foreground">Created by {m.created_by_name || 'Unknown'}</span>
                </div>
                {m.description && <p className="text-sm text-muted-foreground mt-1">{m.description}</p>}
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{m.scheduled_start ? new Date(m.scheduled_start).toLocaleString() : 'instant'}</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />max {m.max_active_speakers} speakers</span>
                </div>
              </div>
              <div className="flex gap-2">
                {m.status !== 'ended' && (
                  <Button size="sm" onClick={() => join(m)}><Play className="h-4 w-4 mr-1" />Join</Button>
                )}
                {m.status === 'ended' && (m.host_id === user?.id || m.created_by === user?.id || role === 'admin') && (
                  <Button size="sm" variant="outline" onClick={() => openReport(m)}>
                    <FileText className="h-4 w-4 mr-1" />Report
                  </Button>
                )}
                {(m.host_id === user?.id || role === 'admin') && (
                  <Button size="sm" variant="ghost" onClick={() => remove(m)}><Trash2 className="h-4 w-4" /></Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Attendance & meeting report */}
      <Dialog open={!!reportFor} onOpenChange={(o) => { if (!o) { setReportFor(null); setReport(null); } }}>
        <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Meeting report — {reportFor?.title}
            </DialogTitle>
          </DialogHeader>
          {reportLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {report && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Host:</span> {report.host_name || '—'}</div>
                <div><span className="text-muted-foreground">Participants:</span> {report.participant_count ?? 0}</div>
                <div><span className="text-muted-foreground">Started:</span> {report.started_at ? new Date(report.started_at).toLocaleString() : '—'}</div>
                <div><span className="text-muted-foreground">Ended:</span> {report.ended_at ? new Date(report.ended_at).toLocaleString() : '—'}</div>
                <div><span className="text-muted-foreground">Phone cameras used:</span> {report.broadcast_devices ?? 0}</div>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Attendance</h3>
                {(report.participants || []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No attendance was recorded.</p>
                )}
                {(report.participants || []).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{p.role}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {p.joined_at ? new Date(p.joined_at).toLocaleTimeString() : '—'}
                        {p.left_at ? ` → ${new Date(p.left_at).toLocaleTimeString()}` : ''}
                      </span>
                    </div>
                    <span className="text-xs">
                      {p.duration_seconds != null ? `${Math.round(p.duration_seconds / 60)} min` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
