import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveClass } from '@/contexts/ActiveClassContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Megaphone, Plus, Pencil, Trash2, Archive } from 'lucide-react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';

const ROLES = ['student', 'teacher', 'parent', 'admin'];

export const AnnouncementsModule: React.FC = () => {
  const { user, profile, role } = useAuth();
  const { activeClass } = useActiveClass();
  const audit = useAuditLog();
  const canCreate = role === 'admin' || role === 'teacher';

  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [roles, setRoles] = useState<string[]>(['student', 'teacher', 'parent', 'admin']);
  const [classTarget, setClassTarget] = useState<string>('');

  const load = async () => {
    const { data } = await (supabase as any)
      .from('announcements').select('*').is('deleted_at', null)
      .order('created_at', { ascending: false });
    setItems(data || []);
  };

  useEffect(() => {
    load();
    supabase.from('classes').select('name').then(({ data }) =>
      setClasses((data || []).map((c: any) => c.name))
    );
    const ch = supabase.channel('announce-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const reset = () => {
    setEditing(null); setTitle(''); setBody('');
    setRoles(['student', 'teacher', 'parent', 'admin']);
    setClassTarget(role === 'teacher' ? (profile?.current_class || activeClass || '') : '');
  };

  const save = async () => {
    if (!title.trim() || !body.trim()) { toast.error('Title & body required'); return; }
    const audience = { roles, classes: classTarget ? [classTarget] : [] };
    if (editing) {
      await (supabase as any).from('announcements').update({
        title, body, audience,
        edited_by: user!.id, edited_by_name: profile?.full_name || '',
      }).eq('id', editing.id);
      audit('update', 'announcement', { id: editing.id, label: title });
    } else {
      const { data, error } = await (supabase as any).from('announcements').insert({
        title, body, audience,
        created_by: user!.id, created_by_name: profile?.full_name || '',
      }).select().single();
      if (error) { toast.error(error.message); return; }
      audit('create', 'announcement', { id: data?.id, label: title });
    }
    toast.success('Saved');
    setOpen(false); reset(); load();
  };

  const remove = async (a: any) => {
    await (supabase as any).from('announcements').update({
      deleted_at: new Date().toISOString(),
      deleted_by: user!.id, deleted_by_name: profile?.full_name || '',
    }).eq('id', a.id);
    audit('delete', 'announcement', { id: a.id, label: a.title });
    toast.success('Announcement deleted');
    load();
  };

  const archive = async (a: any) => {
    await (supabase as any).from('announcements').update({
      archived_at: a.archived_at ? null : new Date().toISOString(),
      edited_by: user!.id, edited_by_name: profile?.full_name || '',
    }).eq('id', a.id);
    audit('archive', 'announcement', { id: a.id, label: a.title });
    load();
  };

  // Visibility rules:
  //  - role gating: announcement's audience.roles must include viewer's role
  //  - class gating: if audience.classes is non-empty, viewer's class must match
  //  - admins always see everything (filtered by activeClass below for context)
  const visible = items.filter(a => {
    if (role === 'admin') {
      // If admin has selected an active class, show only announcements that:
      //   (a) target that class explicitly, OR
      //   (b) are public (no class target)
      if (activeClass) {
        const tgt: string[] = a.audience?.classes || [];
        return tgt.length === 0 || tgt.includes(activeClass);
      }
      return true;
    }
    const r = a.audience?.roles || ROLES;
    if (!r.includes(role || '')) return false;
    const tgt: string[] = a.audience?.classes || [];
    if (tgt.length === 0) return true;
    return tgt.includes(profile?.current_class || '');
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Megaphone className="h-6 w-6" />Announcements
          {role === 'admin' && activeClass && (
            <Badge variant="outline" className="ml-2">{activeClass}</Badge>
          )}
        </h2>
        {canCreate && (
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild><Button onClick={reset}><Plus className="h-4 w-4 mr-1" />New</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} announcement</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
                <Textarea placeholder="Body" rows={5} value={body} onChange={e => setBody(e.target.value)} />
                <div>
                  <Label className="text-xs">Target class (optional)</Label>
                  <Select value={classTarget || 'all'} onValueChange={v => setClassTarget(v === 'all' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">— All classes —</SelectItem>
                      {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Visible to roles</Label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {ROLES.map(r => (
                      <Badge key={r} variant={roles.includes(r) ? 'default' : 'outline'} className="cursor-pointer"
                        onClick={() => setRoles(s => s.includes(r) ? s.filter(x => x !== r) : [...s, r])}>{r}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button onClick={save}>{editing ? 'Update' : 'Post'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-3">
        {visible.length === 0 && <p className="text-sm text-muted-foreground">No announcements.</p>}
        {visible.map(a => {
          const mine = a.created_by === user?.id || role === 'admin';
          const tgt: string[] = a.audience?.classes || [];
          return (
            <Card key={a.id} className={a.archived_at ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{a.title}</h3>
                      {a.archived_at && <Badge variant="outline">Archived</Badge>}
                      {tgt.length > 0 && tgt.map(c => <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>)}
                    </div>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{a.body}</p>
                    <div className="text-xs text-muted-foreground mt-2 space-x-3">
                      <span>Posted by {a.created_by_name || 'Unknown'} · {new Date(a.created_at).toLocaleString()}</span>
                      {a.edited_by_name && <span>· Last modified by {a.edited_by_name} · {new Date(a.updated_at).toLocaleString()}</span>}
                    </div>
                  </div>
                  {mine && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => {
                        setEditing(a); setTitle(a.title); setBody(a.body);
                        setRoles(a.audience?.roles || ROLES);
                        setClassTarget((a.audience?.classes || [])[0] || '');
                        setOpen(true);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => archive(a)}><Archive className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{a.title}" will be removed for every recipient. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(a)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
