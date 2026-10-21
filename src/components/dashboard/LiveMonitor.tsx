import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Radio, AlertTriangle, Eye, Users, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ExamSession {
  id: string;
  student_id: string;
  task_id: string;
  warnings: number;
  warning_details: any[];
  is_active: boolean;
  last_heartbeat: string;
  created_at: string;
  profiles?: {
    full_name: string;
    current_class: string;
    student_card: string;
  };
  tasks?: {
    title: string;
    max_warnings: number;
    class_name: string;
  };
}

export const LiveMonitor = () => {
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<ExamSession | null>(null);
  const [forceSubmitCard, setForceSubmitCard] = useState('');

  useEffect(() => {
    fetchSessions();
    
    // Real-time subscription
    const channel = supabase
      .channel('exam_sessions_live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exam_sessions' },
        () => fetchSessions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchSessions = async () => {
    const { data: sessionsData } = await supabase
      .from('exam_sessions')
      .select(`
        *,
        tasks:task_id (title, max_warnings, class_name)
      `)
      .eq('is_active', true)
      .order('warnings', { ascending: false });

    if (sessionsData) {
      // Fetch profiles separately
      const sessionsWithProfiles = await Promise.all(
        sessionsData.map(async (session) => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name, current_class, student_card')
            .eq('user_id', session.student_id)
            .single();
          
          return {
            ...session,
            profiles: profileData
          };
        })
      );
      setSessions(sessionsWithProfiles as ExamSession[]);
    }
    setLoading(false);
  };

  const handleForceSubmit = async (studentId: string) => {
    const { error } = await supabase
      .from('task_submissions')
      .update({ 
        status: 'force_submitted',
        submitted_at: new Date().toISOString()
      })
      .eq('student_id', studentId)
      .eq('status', 'in_progress');

    if (!error) {
      await supabase
        .from('exam_sessions')
        .update({ is_active: false })
        .eq('student_id', studentId)
        .eq('is_active', true);
      
      toast.success('Student exam force submitted');
      fetchSessions();
    } else {
      toast.error('Failed to force submit');
    }
  };

  const handleForceSubmitByCard = async () => {
    if (!forceSubmitCard.trim()) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('student_card', forceSubmitCard.trim())
      .single();

    if (profile) {
      await handleForceSubmit(profile.user_id);
      setForceSubmitCard('');
    } else {
      toast.error('Student card not found');
    }
  };

  const getWarningLevel = (warnings: number, maxWarnings: number) => {
    const ratio = warnings / maxWarnings;
    if (ratio >= 0.8) return 'critical';
    if (ratio >= 0.5) return 'warning';
    return 'normal';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Radio className="w-6 h-6 text-destructive animate-pulse" />
            Live Exam Monitor
          </h2>
          <p className="text-muted-foreground">Real-time exam session monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-lg px-4 py-2">
            <Users className="w-4 h-4 mr-2" />
            {sessions.length} Active
          </Badge>
        </div>
      </div>

      {/* Force Submit by Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Input
              placeholder="Enter student card to force submit..."
              value={forceSubmitCard}
              onChange={(e) => setForceSubmitCard(e.target.value)}
              className="max-w-xs"
            />
            <Button variant="destructive" onClick={handleForceSubmitByCard}>
              <XCircle className="w-4 h-4 mr-2" />
              Force Submit
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessions.map((session) => {
          const warningLevel = getWarningLevel(session.warnings, session.tasks?.max_warnings || 3);
          
          return (
            <Card 
              key={session.id}
              className={`relative overflow-hidden transition-all ${
                warningLevel === 'critical' 
                  ? 'border-destructive/50 bg-destructive/5 animate-pulse' 
                  : warningLevel === 'warning'
                  ? 'border-warning/50 bg-warning/5'
                  : ''
              }`}
            >
              {warningLevel === 'critical' && (
                <div className="absolute inset-0 bg-destructive/10 pointer-events-none" />
              )}
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {session.profiles?.full_name || 'Unknown Student'}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {session.profiles?.current_class} • #{session.profiles?.student_card}
                    </p>
                  </div>
                  <Badge 
                    variant={warningLevel === 'critical' ? 'destructive' : warningLevel === 'warning' ? 'default' : 'secondary'}
                    className="text-lg"
                  >
                    {session.warnings}/{session.tasks?.max_warnings || 3}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm font-medium">{session.tasks?.title}</p>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    Last active: {format(new Date(session.last_heartbeat), 'HH:mm:ss')}
                  </div>

                  <div className="flex items-center gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => setSelectedSession(session)}>
                          <Eye className="w-4 h-4 mr-1" />
                          View Details
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Session Details - {session.profiles?.full_name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium">Warning History</h4>
                            <div className="mt-2 space-y-2">
                              {(session.warning_details as any[])?.map((warning, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                                  <AlertTriangle className="w-4 h-4 text-warning" />
                                  <span>{warning.type}: {warning.message}</span>
                                </div>
                              )) || <p className="text-muted-foreground">No warnings recorded</p>}
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => handleForceSubmit(session.student_id)}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Force Submit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {sessions.length === 0 && (
        <Card className="p-12 text-center">
          <Radio className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">No active exam sessions</p>
        </Card>
      )}
    </div>
  );
};
