import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Send, Users, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface BroadcastPanelProps {
  taskId?: string;
  className?: string;
  defaultClass?: string;
}

interface StudentOption {
  user_id: string;
  full_name: string;
}

export const BroadcastPanel: React.FC<BroadcastPanelProps> = ({ taskId, className, defaultClass }) => {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState<'class' | 'individual'>('class');
  const [selectedClass, setSelectedClass] = useState(defaultClass || '');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [classes, setClasses] = useState<string[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const fetchClasses = async () => {
      const { data } = await supabase.from('classes').select('name').order('name');
      if (data) setClasses(data.map(c => c.name));
    };
    fetchClasses();
  }, []);

  useEffect(() => {
    if (broadcastType === 'individual' && selectedClass) {
      const fetchStudents = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .eq('role', 'student')
          .eq('current_class', selectedClass)
          .order('full_name');
        if (data) setStudents(data);
      };
      fetchStudents();
    }
  }, [broadcastType, selectedClass]);

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }
    if (!selectedClass && broadcastType === 'class') {
      toast.error('Please select a class');
      return;
    }
    if (broadcastType === 'individual' && !selectedStudent) {
      toast.error('Please select a student');
      return;
    }

    setSending(true);
    const { error } = await supabase.from('broadcast_messages').insert({
      sender_id: user!.id,
      class_name: selectedClass || null,
      target_student_id: broadcastType === 'individual' ? selectedStudent : null,
      message: message.trim(),
      task_id: taskId || null,
      broadcast_type: broadcastType,
    });

    if (error) {
      toast.error('Failed to send broadcast');
    } else {
      toast.success(
        broadcastType === 'class' 
          ? `Broadcast sent to ${selectedClass}` 
          : 'Message sent to student'
      );
      setMessage('');
    }
    setSending(false);
  };

  return (
    <div className={cn('p-4 rounded-lg bg-card border border-border space-y-3', className)}>
      <div className="flex items-center gap-2 mb-1">
        <Mic className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Broadcast to Students</span>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={broadcastType === 'class' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBroadcastType('class')}
          className="flex-1"
        >
          <Users className="w-3 h-3 mr-1" />
          Class
        </Button>
        <Button
          type="button"
          variant={broadcastType === 'individual' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBroadcastType('individual')}
          className="flex-1"
        >
          <User className="w-3 h-3 mr-1" />
          Individual
        </Button>
      </div>

      <Select value={selectedClass} onValueChange={setSelectedClass}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select class" />
        </SelectTrigger>
        <SelectContent>
          {classes.map(c => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {broadcastType === 'individual' && selectedClass && (
        <Select value={selectedStudent} onValueChange={setSelectedStudent}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select student" />
          </SelectTrigger>
          <SelectContent>
            {students.map(s => (
              <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={sending || !message.trim()} size="icon">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};