import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import { CheckSquare, Clock, RotateCcw, XCircle } from 'lucide-react';

interface Props {
  taskId: string;
  taskTitle: string;
  submissionId?: string;
  studentId?: string;
}

export const ExamAdminActions: React.FC<Props> = ({ taskId, taskTitle, submissionId, studentId }) => {
  const { user, profile } = useAuth();
  const audit = useAuditLog();
  const [reason, setReason] = useState('');
  const [extendMin, setExtendMin] = useState('10');
  const [open, setOpen] = useState<string | null>(null);

  if (user?.role !== 'admin' && user?.role !== 'teacher') return null;

  const record = async (action_type: string, metadata: any = {}) => {
    await (supabase as any).from('exam_admin_actions').insert({
      task_id: taskId, submission_id: submissionId, student_id: studentId,
      action_type, reason, metadata,
      performed_by: user!.id, performed_by_name: profile?.full_name || "", performed_by_role: profile?.role || "",
    });
    audit(action_type as any, 'exam', { id: taskId, label: taskTitle, metadata: { ...metadata, reason } });
  };

  const forceSubmit = async () => {
    if (submissionId) {
      await (supabase as any).from('task_submissions').update({
        status: 'submitted', submitted_at: new Date().toISOString(),
      }).eq('id', submissionId);
    }
    await record('force_submit');
    toast.success('Force-submitted'); setOpen(null); setReason('');
  };

  const extendTime = async () => {
    const minutes = parseInt(extendMin);
    const { data: t } = await (supabase as any).from('tasks').select('ends_at, duration_minutes').eq('id', taskId).single();
    const newEnd = t?.ends_at ? new Date(new Date(t.ends_at).getTime() + minutes*60000) : null;
    await (supabase as any).from('tasks').update({
      ends_at: newEnd?.toISOString(), duration_minutes: (t?.duration_minutes || 0) + minutes,
    }).eq('id', taskId);
    await record('extend_time', { added_minutes: minutes });
    toast.success(`Extended by ${minutes}m`); setOpen(null); setReason('');
  };

  const reopen = async () => {
    await (supabase as any).from('tasks').update({ is_active: true, ends_at: null }).eq('id', taskId);
    if (submissionId) {
      await (supabase as any).from('task_submissions').update({ status: 'in_progress', submitted_at: null }).eq('id', submissionId);
    }
    await record('reopen_exam');
    toast.success('Reopened'); setOpen(null); setReason('');
  };

  const cancel = async () => {
    await (supabase as any).from('tasks').update({ is_active: false }).eq('id', taskId);
    await record('cancel_exam');
    toast.success('Cancelled'); setOpen(null); setReason('');
  };

  const ActionDialog = (key: string, title: string, body: React.ReactNode, onConfirm: () => void) => (
    <Dialog open={open === key} onOpenChange={v => setOpen(v ? key : null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {body}
        <div><Label>Reason</Label><Input value={reason} onChange={e => setReason(e.target.value)} /></div>
        <DialogFooter><Button onClick={onConfirm}>Confirm</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setOpen('submit')}><CheckSquare className="h-4 w-4 mr-1" />Force submit</Button>
      <Button size="sm" variant="outline" onClick={() => setOpen('extend')}><Clock className="h-4 w-4 mr-1" />Extend time</Button>
      <Button size="sm" variant="outline" onClick={() => setOpen('reopen')}><RotateCcw className="h-4 w-4 mr-1" />Reopen</Button>
      <Button size="sm" variant="destructive" onClick={() => setOpen('cancel')}><XCircle className="h-4 w-4 mr-1" />Cancel exam</Button>

      {ActionDialog('submit', 'Force submit?', <p className="text-sm">This will mark the submission as submitted.</p>, forceSubmit)}
      {ActionDialog('extend', 'Extend exam time',
        <div><Label>Minutes</Label><Input type="number" value={extendMin} onChange={e => setExtendMin(e.target.value)} /></div>, extendTime)}
      {ActionDialog('reopen', 'Reopen exam?', <p className="text-sm">Re-activate the exam and clear submission status.</p>, reopen)}
      {ActionDialog('cancel', 'Cancel exam?', <p className="text-sm">This deactivates the exam for everyone.</p>, cancel)}
    </div>
  );
};
