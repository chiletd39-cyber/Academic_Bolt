import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Video, VideoOff, AlertTriangle, Users, Eye, XCircle, Radio } from 'lucide-react';
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
  profiles?: {
    full_name: string;
    current_class: string;
    student_card: string;
  };
  tasks?: {
    title: string;
    max_warnings: number;
  };
}

// WebRTC Configuration
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const WebcamStream = () => {
  const { user, role } = useAuth();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<ExamSession | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    fetchSessions();
    
    const channel = supabase
      .channel('webcam_sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exam_sessions' },
        () => fetchSessions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      stopAllStreams();
    };
  }, []);

  const fetchSessions = async () => {
    const { data: sessionsData } = await supabase
      .from('exam_sessions')
      .select(`
        *,
        tasks:task_id (title, max_warnings)
      `)
      .eq('is_active', true)
      .order('warnings', { ascending: false });

    if (sessionsData) {
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

  const stopAllStreams = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setIsStreaming(false);
  };

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user'
        },
        audio: false
      });
      localStreamRef.current = stream;
      setIsStreaming(true);
      return stream;
    } catch (err) {
      toast.error('Failed to access webcam');
      console.error('Webcam error:', err);
      return null;
    }
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

  const getWarningLevel = (warnings: number, maxWarnings: number) => {
    const ratio = warnings / maxWarnings;
    if (ratio >= 0.8) return 'critical';
    if (ratio >= 0.5) return 'warning';
    return 'normal';
  };

  const setVideoRef = useCallback((studentId: string, element: HTMLVideoElement | null) => {
    videoRefs.current[studentId] = element;
  }, []);

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
            Live Webcam Monitor
          </h2>
          <p className="text-muted-foreground">Real-time student webcam streaming</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-lg px-4 py-2">
            <Users className="w-4 h-4 mr-2" />
            {sessions.length} Active
          </Badge>
        </div>
      </div>

      {/* Student Webcam Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sessions.map((session) => {
          const warningLevel = getWarningLevel(session.warnings, session.tasks?.max_warnings || 3);
          
          return (
            <Card 
              key={session.id}
              className={`relative overflow-hidden transition-all cursor-pointer hover:shadow-lg ${
                warningLevel === 'critical' 
                  ? 'border-destructive ring-2 ring-destructive/50 animate-pulse' 
                  : warningLevel === 'warning'
                  ? 'border-yellow-500 ring-1 ring-yellow-500/30'
                  : 'border-border'
              }`}
              onClick={() => setSelectedSession(session)}
            >
              {/* Warning Overlay */}
              {warningLevel === 'critical' && (
                <div className="absolute inset-0 bg-destructive/20 pointer-events-none z-10" />
              )}
              
              <CardHeader className="pb-2 relative z-20">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm truncate">
                      {session.profiles?.full_name || 'Unknown'}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground truncate">
                      {session.profiles?.current_class} • #{session.profiles?.student_card}
                    </p>
                  </div>
                  <Badge 
                    variant={warningLevel === 'critical' ? 'destructive' : warningLevel === 'warning' ? 'default' : 'secondary'}
                    className="ml-2 shrink-0"
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {session.warnings}/{session.tasks?.max_warnings || 3}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="p-2 relative z-20">
                {/* Simulated Video Feed Placeholder */}
                <div className={`relative aspect-video rounded-lg overflow-hidden ${
                  warningLevel === 'critical' 
                    ? 'bg-destructive/30' 
                    : warningLevel === 'warning'
                    ? 'bg-yellow-500/20'
                    : 'bg-muted'
                }`}>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {warningLevel === 'critical' ? (
                      <>
                        <AlertTriangle className="w-8 h-8 text-destructive animate-bounce" />
                        <span className="text-xs text-destructive font-medium mt-1">HIGH ALERT</span>
                      </>
                    ) : (
                      <>
                        <Video className="w-8 h-8 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground mt-1">Live Feed</span>
                      </>
                    )}
                  </div>
                  
                  {/* Status indicator */}
                  <div className="absolute top-2 right-2">
                    <div className={`w-2 h-2 rounded-full ${
                      warningLevel === 'critical' 
                        ? 'bg-destructive animate-ping' 
                        : 'bg-green-500 animate-pulse'
                    }`} />
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(session.last_heartbeat), 'HH:mm:ss')}
                  </span>
                  <Button 
                    variant={warningLevel === 'critical' ? 'destructive' : 'outline'}
                    size="sm"
                    className="h-6 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleForceSubmit(session.student_id);
                    }}
                  >
                    <XCircle className="w-3 h-3 mr-1" />
                    End
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {sessions.length === 0 && (
        <Card className="p-12 text-center">
          <VideoOff className="w-16 h-16 mx-auto text-muted-foreground/50" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">No Active Exam Sessions</p>
          <p className="text-sm text-muted-foreground mt-1">
            Student webcam feeds will appear here during exams
          </p>
        </Card>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedSession} onOpenChange={() => setSelectedSession(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              {selectedSession?.profiles?.full_name} - Live Session
            </DialogTitle>
          </DialogHeader>
          
          {selectedSession && (
            <div className="space-y-4">
              {/* Large Video Feed */}
              <div className={`aspect-video rounded-lg overflow-hidden ${
                getWarningLevel(selectedSession.warnings, selectedSession.tasks?.max_warnings || 3) === 'critical'
                  ? 'bg-destructive/30 ring-2 ring-destructive'
                  : 'bg-muted'
              }`}>
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <Video className="w-16 h-16 text-muted-foreground" />
                  <p className="text-muted-foreground mt-2">WebRTC Video Stream</p>
                  <p className="text-xs text-muted-foreground">
                    Real-time peer-to-peer connection
                  </p>
                </div>
              </div>

              {/* Session Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Student</p>
                  <p className="font-medium">{selectedSession.profiles?.full_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Class</p>
                  <p className="font-medium">{selectedSession.profiles?.current_class}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Task</p>
                  <p className="font-medium">{selectedSession.tasks?.title}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Warnings</p>
                  <Badge variant={selectedSession.warnings >= (selectedSession.tasks?.max_warnings || 3) * 0.8 ? 'destructive' : 'secondary'}>
                    {selectedSession.warnings} / {selectedSession.tasks?.max_warnings || 3}
                  </Badge>
                </div>
              </div>

              {/* Warning Details */}
              <div>
                <h4 className="font-medium mb-2">Warning History</h4>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {(selectedSession.warning_details as any[])?.length > 0 ? (
                    (selectedSession.warning_details as any[]).map((warning, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                        <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                        <span>{warning.type}: {warning.message}</span>
                        {warning.timestamp && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            {format(new Date(warning.timestamp), 'HH:mm:ss')}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">No warnings recorded</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedSession(null)}>
                  Close
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => {
                    handleForceSubmit(selectedSession.student_id);
                    setSelectedSession(null);
                  }}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Force Submit Exam
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
