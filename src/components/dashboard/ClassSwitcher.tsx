import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowRightLeft, Clock, CheckCircle, XCircle, History, FolderOpen, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface SwitchRequest {
  id: string;
  from_class: string | null;
  to_class: string;
  status: string;
  created_at: string;
}

interface PastClass {
  class_name: string;
  left_at: string;
  gen_name: string;
}

export const ClassSwitcher = () => {
  const { user, profile, role } = useAuth();
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [requests, setRequests] = useState<SwitchRequest[]>([]);
  const [pastClasses, setPastClasses] = useState<PastClass[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewingPast, setViewingPast] = useState<PastClass | null>(null);
  const [pastTasks, setPastTasks] = useState<any[]>([]);
  const [loadingPast, setLoadingPast] = useState(false);

  useEffect(() => {
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user?.id) return;
    setLoading(true);

    const [classesRes, requestsRes, profileRes] = await Promise.all([
      supabase.from('classes').select('name').order('name'),
      supabase.from('class_switch_requests').select('*').eq('student_id', user.id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('class_history').eq('user_id', user.id).single(),
    ]);

    setClasses((classesRes.data || []).map(c => c.name));
    setRequests((requestsRes.data || []) as SwitchRequest[]);
    
    const history = profileRes.data?.class_history;
    setPastClasses(Array.isArray(history) ? (history as unknown as PastClass[]) : []);
    setLoading(false);
  };

  const handleSubmitRequest = async () => {
    if (!selectedClass || !user?.id || !profile) return;
    if (selectedClass === profile.current_class) {
      toast.error('You are already in this class');
      return;
    }

    const hasPending = requests.some(r => r.status === 'pending');
    if (hasPending) {
      toast.error('You already have a pending class switch request');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('class_switch_requests').insert({
      student_id: user.id,
      student_name: profile.full_name,
      from_class: profile.current_class,
      to_class: selectedClass,
      student_card: profile.student_card,
    });

    if (error) {
      toast.error('Failed to submit request');
    } else {
      toast.success('Class switch request submitted for admin approval');
      setDialogOpen(false);
      setSelectedClass('');
      fetchData();
    }
    setSubmitting(false);
  };

  const openPastClass = async (past: PastClass) => {
    setViewingPast(past);
    setLoadingPast(true);

    // Fetch tasks and submissions from past class
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, task_type, created_at, total_marks, scores_published')
      .eq('class_name', past.class_name)
      .order('created_at', { ascending: false })
      .limit(20);

    if (tasks && user?.id) {
      const taskIds = tasks.map(t => t.id);
      const { data: subs } = await supabase
        .from('task_submissions')
        .select('task_id, score, status, submitted_at')
        .eq('student_id', user.id)
        .in('task_id', taskIds);

      const subMap: Record<string, any> = {};
      (subs || []).forEach(s => { subMap[s.task_id] = s; });

      setPastTasks(tasks.map(t => ({
        ...t,
        submission: subMap[t.id] || null,
      })));
    }
    setLoadingPast(false);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4 text-success" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-warning" />;
    }
  };

  if (role !== 'student') return null;

  return (
    <div className="space-y-4">
      {/* Switch Class Request */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-primary" /> Class Switch
            </span>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <ArrowRightLeft className="h-3 w-3" /> Request Switch
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Request Class Switch</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Current class: <strong>{profile?.current_class || 'None'}</strong>
                  </p>
                  <div>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select new class" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.filter(c => c !== profile?.current_class).map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This request will be sent to admin for approval.
                  </p>
                  <Button onClick={handleSubmitRequest} disabled={!selectedClass || submitting} className="w-full">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Submit Request
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No switch requests yet.</p>
          ) : (
            <div className="space-y-2">
              {requests.slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm">
                  {statusIcon(r.status || 'pending')}
                  <span className="flex-1">
                    {r.from_class || '?'} → {r.to_class}
                  </span>
                  <Badge variant={r.status === 'approved' ? 'default' : r.status === 'rejected' ? 'destructive' : 'secondary'} className="text-xs capitalize">
                    {r.status || 'pending'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(r.created_at), 'MMM dd')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past Classes */}
      {pastClasses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" /> Past Classes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pastClasses.map((pc, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{pc.class_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pc.gen_name} • Left {format(new Date(pc.left_at), 'MMM dd, yyyy')}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => openPastClass(pc)}>
                    <FolderOpen className="h-3 w-3" /> Open
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Past Class Viewer */}
      {viewingPast && (
        <Dialog open={!!viewingPast} onOpenChange={() => setViewingPast(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                {viewingPast.class_name} — {viewingPast.gen_name}
              </DialogTitle>
            </DialogHeader>
            {loadingPast ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : pastTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No tasks found for this class.</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {pastTasks.map((t: any) => (
                  <div key={t.id} className="p-3 rounded-lg border border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{t.task_type}</p>
                      </div>
                      {t.submission ? (
                        <div className="text-right">
                          <Badge variant="default" className="text-xs">
                            {t.scores_published && t.submission.score !== null
                              ? `${t.submission.score}/${t.total_marks}`
                              : t.submission.status}
                          </Badge>
                        </div>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Not taken</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(t.created_at), 'MMM dd, yyyy')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ClassSwitcher;
