import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Video, VideoOff, AlertTriangle, Users, Eye, XCircle, Radio, Clock, Megaphone, MessageSquare, Send, RefreshCw, Mic } from 'lucide-react';
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

export const LiveMonitorCombined = () => {
  const { role, user } = useAuth();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<ExamSession | null>(null);
  const [forceSubmitCard, setForceSubmitCard] = useState('');
  const [bulkSubmitCards, setBulkSubmitCards] = useState('');
  const [activeTab, setActiveTab] = useState('grid');
  const [showBroadcastAll, setShowBroadcastAll] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [individualMessageTarget, setIndividualMessageTarget] = useState<ExamSession | null>(null);
  const [individualMessage, setIndividualMessage] = useState('');
  const [snapshotRefreshKey, setSnapshotRefreshKey] = useState(0);

  // Auto-refresh snapshots every 2 seconds for near-live feel
  useEffect(() => {
    const interval = window.setInterval(() => {
      setSnapshotRefreshKey(prev => prev + 1);
    }, 2000);
    return () => window.clearInterval(interval);
  }, []);

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const getSnapshotUrl = (studentId: string, taskId: string) => {
    const key = `${studentId}/${taskId}.jpg`;
    const url = signedUrls[key];
    return url ? `${url}${url.includes('?') ? '&' : '?'}t=${snapshotRefreshKey}` : '';
  };

  // Refresh signed URLs for active sessions periodically
  useEffect(() => {
    let cancelled = false;
    const refreshSigned = async () => {
      const paths = Object.keys(signedUrls);
      // Will be populated by the sessions effect below via signSnapshot()
      if (paths.length === 0) return;
      const { data } = await supabase.storage
        .from('exam-snapshots')
        .createSignedUrls(paths, 300);
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      data.forEach((d, i) => { if (d.signedUrl) next[paths[i]] = d.signedUrl; });
      setSignedUrls(prev => ({ ...prev, ...next }));
    };
    const id = window.setInterval(refreshSigned, 240000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [signedUrls]);

  const signSnapshot = async (studentId: string, taskId: string) => {
    const path = `${studentId}/${taskId}.jpg`;
    if (signedUrls[path]) return;
    const { data } = await supabase.storage
      .from('exam-snapshots')
      .createSignedUrl(path, 300);
    if (data?.signedUrl) {
      setSignedUrls(prev => ({ ...prev, [path]: data.signedUrl }));
    }
  };

  useEffect(() => {
    fetchSessions();
    
    const channel = supabase
      .channel('exam_sessions_live_combined')
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
      // Pre-sign snapshot URLs for active sessions
      sessionsWithProfiles.forEach((s: any) => {
        if (s.student_id && s.task_id) signSnapshot(s.student_id, s.task_id);
      });
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

  const handleBulkForceSubmit = async () => {
    if (!bulkSubmitCards.trim()) return;

    const cards = bulkSubmitCards.split(',').map(c => c.trim()).filter(c => c.length > 0);
    
    if (cards.length < 3) {
      toast.error('Enter at least 3 student card IDs separated by commas');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const card of cards) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('student_card', card)
        .single();

      if (profile) {
        await handleForceSubmit(profile.user_id);
        successCount++;
      } else {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Force submitted ${successCount} exams`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} student cards not found`);
    }
    setBulkSubmitCards('');
  };

  // Get unique active classes from sessions
  const activeClasses = [...new Set(sessions.map(s => s.tasks?.class_name).filter(Boolean))];

  const handleBroadcastAll = async () => {
    if (!broadcastMessage.trim()) {
      toast.error('Please enter a message');
      return;
    }
    setSendingBroadcast(true);
    // Send broadcast to all active classes
    const inserts = activeClasses.map(className => ({
      sender_id: user!.id,
      class_name: className!,
      message: broadcastMessage.trim(),
      broadcast_type: 'class',
    }));
    
    if (inserts.length === 0) {
      // Fallback: send without class filter
      const { error } = await supabase.from('broadcast_messages').insert({
        sender_id: user!.id,
        message: broadcastMessage.trim(),
        broadcast_type: 'class',
      });
      if (error) {
        toast.error('Failed to send broadcast');
      } else {
        toast.success('Broadcast sent to all live students');
      }
    } else {
      const { error } = await supabase.from('broadcast_messages').insert(inserts);
      if (error) {
        toast.error('Failed to send broadcast');
      } else {
        toast.success(`Broadcast sent to ${sessions.length} live students`);
      }
    }
    setBroadcastMessage('');
    setShowBroadcastAll(false);
    setSendingBroadcast(false);
  };

  const handleSendIndividualMessage = async () => {
    if (!individualMessage.trim() || !individualMessageTarget) return;
    setSendingBroadcast(true);
    const { error } = await supabase.from('broadcast_messages').insert({
      sender_id: user!.id,
      target_student_id: individualMessageTarget.student_id,
      class_name: individualMessageTarget.tasks?.class_name || null,
      message: individualMessage.trim(),
      broadcast_type: 'individual',
    });
    if (error) {
      toast.error('Failed to send message');
    } else {
      toast.success(`Message sent to ${individualMessageTarget.profiles?.full_name}`);
    }
    setIndividualMessage('');
    setIndividualMessageTarget(null);
    setSendingBroadcast(false);
  };

  // Voice broadcast - uses Web Speech API for text-to-speech broadcast via message
  const [voiceBroadcastTarget, setVoiceBroadcastTarget] = useState<ExamSession | null>(null);
  const [voiceText, setVoiceText] = useState('');

  const handleVoiceBroadcast = (session?: ExamSession) => {
    if (session) {
      setVoiceBroadcastTarget(session);
    } else {
      // Broadcast to all - use the existing broadcast dialog
      setShowBroadcastAll(true);
    }
  };

  const sendVoiceMessage = async (target: 'all' | ExamSession) => {
    if (!voiceText.trim()) {
      toast.error('Please enter a voice message');
      return;
    }
    setSendingBroadcast(true);
    
    if (target === 'all') {
      const inserts = activeClasses.map(className => ({
        sender_id: user!.id,
        class_name: className!,
        message: `🔊 VOICE: ${voiceText.trim()}`,
        broadcast_type: 'class' as const,
      }));
      if (inserts.length > 0) {
        await supabase.from('broadcast_messages').insert(inserts);
      }
      toast.success('Voice broadcast sent to all students');
    } else {
      await supabase.from('broadcast_messages').insert({
        sender_id: user!.id,
        target_student_id: target.student_id,
        class_name: target.tasks?.class_name || null,
        message: `🔊 VOICE: ${voiceText.trim()}`,
        broadcast_type: 'individual' as const,
      });
      toast.success(`Voice message sent to ${target.profiles?.full_name}`);
    }
    
    setVoiceText('');
    setVoiceBroadcastTarget(null);
    setSendingBroadcast(false);
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
            Live Monitor
          </h2>
          <p className="text-muted-foreground">Real-time exam session monitoring with webcam feeds</p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          <Users className="w-4 h-4 mr-2" />
          {sessions.length} Active
        </Badge>
        <Button onClick={() => setShowBroadcastAll(true)} disabled={sessions.length === 0}>
          <Megaphone className="w-4 h-4 mr-2" />
          Broadcast to All
        </Button>
        <Button variant="outline" onClick={() => handleVoiceBroadcast()} disabled={sessions.length === 0}>
          <Mic className="w-4 h-4 mr-2" />
          Voice to All
        </Button>
      </div>

      {/* Voice Broadcast Dialog */}
      <Dialog open={!!voiceBroadcastTarget} onOpenChange={() => setVoiceBroadcastTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="w-5 h-5 text-primary" />
              Voice Message to {voiceBroadcastTarget?.profiles?.full_name || 'Student'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This voice message will be displayed as an alert to the student during their exam.
            </p>
            <Textarea
              placeholder="Type the voice message content..."
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setVoiceBroadcastTarget(null)}>Cancel</Button>
              <Button 
                onClick={() => voiceBroadcastTarget && sendVoiceMessage(voiceBroadcastTarget)} 
                disabled={sendingBroadcast || !voiceText.trim()}
              >
                <Mic className="w-4 h-4 mr-2" />
                Send Voice
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Broadcast to All Dialog */}
      <Dialog open={showBroadcastAll} onOpenChange={setShowBroadcastAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" />
              Broadcast to All Live Students
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This message will be sent to all {sessions.length} currently active exam students.
            </p>
            <Textarea
              placeholder="Type your message to all students..."
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowBroadcastAll(false)}>Cancel</Button>
              <Button onClick={handleBroadcastAll} disabled={sendingBroadcast || !broadcastMessage.trim()}>
                <Send className="w-4 h-4 mr-2" />
                Send to All
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Individual Message Dialog */}
      <Dialog open={!!individualMessageTarget} onOpenChange={() => setIndividualMessageTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Message to {individualMessageTarget?.profiles?.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Send a private message to this student during their exam.
            </p>
            <Textarea
              placeholder="Type your message..."
              value={individualMessage}
              onChange={(e) => setIndividualMessage(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIndividualMessageTarget(null)}>Cancel</Button>
              <Button onClick={handleSendIndividualMessage} disabled={sendingBroadcast || !individualMessage.trim()}>
                <Send className="w-4 h-4 mr-2" />
                Send Message
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Force Submit Controls */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 flex items-center gap-2">
              <Input
                placeholder="Enter student card to force submit..."
                value={forceSubmitCard}
                onChange={(e) => setForceSubmitCard(e.target.value)}
              />
              <Button variant="destructive" onClick={handleForceSubmitByCard}>
                <XCircle className="w-4 h-4 mr-2" />
                Force Submit
              </Button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Bulk force submit (>3 cards, comma separated): SC001, SC002, SC003..."
                value={bulkSubmitCards}
                onChange={(e) => setBulkSubmitCards(e.target.value)}
              />
            </div>
            <Button variant="destructive" onClick={handleBulkForceSubmit}>
              <XCircle className="w-4 h-4 mr-2" />
              Bulk Force Submit
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="grid">Session Grid</TabsTrigger>
          <TabsTrigger value="webcam">Webcam View</TabsTrigger>
        </TabsList>

        <TabsContent value="grid" className="mt-4">
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

                      <div className="flex items-center gap-2 flex-wrap">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setSelectedSession(session)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Details
                        </Button>

                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setIndividualMessageTarget(session)}
                        >
                          <MessageSquare className="w-4 h-4 mr-1" />
                          Message
                        </Button>
                        
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
        </TabsContent>

        <TabsContent value="webcam" className="mt-4">
          {/* Webcam Grid View */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sessions.map((session) => {
              const warningLevel = getWarningLevel(session.warnings, session.tasks?.max_warnings || 3);
              
              return (
                <Card 
                  key={session.id}
                  className={`relative overflow-hidden cursor-pointer transition-all hover:shadow-lg ${
                    warningLevel === 'critical' 
                      ? 'border-destructive ring-2 ring-destructive/50 animate-pulse' 
                      : warningLevel === 'warning'
                      ? 'border-yellow-500 ring-1 ring-yellow-500/30'
                      : 'border-border'
                  }`}
                  onClick={() => setSelectedSession(session)}
                >
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
                    {/* Real Webcam Snapshot Feed */}
                    <div className={`relative aspect-video rounded-lg overflow-hidden ${
                      warningLevel === 'critical' 
                        ? 'bg-destructive/30' 
                        : warningLevel === 'warning'
                        ? 'bg-yellow-500/20'
                        : 'bg-muted'
                    }`}>
                      <img
                        src={getSnapshotUrl(session.student_id, session.task_id)}
                        alt={`${session.profiles?.full_name} webcam`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        {warningLevel === 'critical' && (
                          <>
                            <AlertTriangle className="w-8 h-8 text-destructive animate-bounce" />
                            <span className="text-xs text-destructive font-medium mt-1">HIGH ALERT</span>
                          </>
                        )}
                      </div>
                      
                      {/* Live indicator */}
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-background/70 rounded px-1.5 py-0.5">
                        <div className={`w-2 h-2 rounded-full ${
                          warningLevel === 'critical' 
                            ? 'bg-destructive animate-ping' 
                            : 'bg-green-500 animate-pulse'
                        }`} />
                        <span className="text-[10px] font-medium">LIVE</span>
                      </div>
                    </div>

                    {/* Quick actions */}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(session.last_heartbeat), 'HH:mm:ss')}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIndividualMessageTarget(session);
                          }}
                        >
                          <MessageSquare className="w-3 h-3 mr-1" />
                          Msg
                        </Button>
                        <Button 
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVoiceBroadcast(session);
                          }}
                        >
                          <Mic className="w-3 h-3 mr-1" />
                          Voice
                        </Button>
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
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

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
              {/* Large Real Webcam Feed */}
              <div className={`aspect-video rounded-lg overflow-hidden relative ${
                getWarningLevel(selectedSession.warnings, selectedSession.tasks?.max_warnings || 3) === 'critical'
                  ? 'bg-destructive/30 ring-2 ring-destructive'
                  : 'bg-muted'
              }`}>
                <img
                  src={getSnapshotUrl(selectedSession.student_id, selectedSession.task_id)}
                  alt={`${selectedSession.profiles?.full_name} webcam`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-background/70 rounded px-2 py-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-medium">LIVE — refreshes every 2s</span>
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