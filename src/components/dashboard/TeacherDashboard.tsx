import { useState, useEffect, lazy, Suspense } from 'react';
import { setScoresPublished } from '@/grading-engine';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Video as MeetingsIcon, Radio as RadioBroadcast, Megaphone } from 'lucide-react';
const MeetingsModule = lazy(() => import('./MeetingsModule').then(m => ({ default: m.MeetingsModule })));
const LiveEventsModule = lazy(() => import('./LiveEventsModule').then(m => ({ default: m.LiveEventsModule })));
const AnnouncementsModule = lazy(() => import('./AnnouncementsModule').then(m => ({ default: m.AnnouncementsModule })));
import { useAuth } from '@/contexts/AuthContext';
import { useActiveClass } from '@/contexts/ActiveClassContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  ClipboardList,
  Radio,
  Plus,
  Eye,
  AlertCircle,
  Clock,
  Video,
  XCircle,
  Send,
  Activity,
  MessageSquare,
  CheckCircle2,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

interface ExamSession {
  id: string;
  task_id: string;
  student_id: string;
  is_active: boolean | null;
  warnings: number | null;
  last_heartbeat: string | null;
  warning_details?: unknown;
}

interface Task {
  id: string;
  title: string;
  task_type: string;
  class_name: string;
  is_active: boolean;
  created_at: string;
  total_marks: number;
  duration_minutes: number;
  max_warnings: number;
  starts_at: string | null;
  ends_at: string | null;
  required_fields: { name: boolean; class: boolean; email: boolean };
}

interface StudentProfile {
  full_name: string;
  student_card: string;
  current_class: string;
}

export const TeacherDashboard = () => {
  const { profile, user } = useAuth();
  const { activeClass } = useActiveClass();
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [studentProfiles, setStudentProfiles] = useState<Record<string, StudentProfile>>({});
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassDescription, setNewClassDescription] = useState('');
  const [forceSubmitIds, setForceSubmitIds] = useState('');
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    task_type: 'exam',
    class_name: '',
    duration_minutes: 60,
    total_marks: 100,
    max_warnings: 3,
    starts_at: '',
    ends_at: '',
    required_fields: { name: true, class: true, email: false },
  });

  useEffect(() => {
    fetchData();
    
    const channel = supabase
      .channel('exam-sessions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_sessions' }, () => {
        fetchExamSessions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    await Promise.all([fetchTasks(), fetchExamSessions()]);
    setIsLoading(false);
  };

  const fetchTasks = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (data) {
      setTasks(data.map(t => ({
        ...t,
        required_fields: (t.required_fields as { name: boolean; class: boolean; email: boolean }) || { name: true, class: true, email: false },
        max_warnings: t.max_warnings || 3,
      })));
    }
  };

  const fetchExamSessions = async () => {
    const { data } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('is_active', true);
    
    if (data) {
      setExamSessions(data);
      // Fetch student profiles
      const studentIds = [...new Set(data.map(s => s.student_id))];
      if (studentIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, student_card, current_class')
          .in('user_id', studentIds);
        
        if (profiles) {
          const profileMap: Record<string, StudentProfile> = {};
          profiles.forEach(p => {
            profileMap[p.user_id] = {
              full_name: p.full_name,
              student_card: p.student_card || '',
              current_class: p.current_class || '',
            };
          });
          setStudentProfiles(profileMap);
        }
      }
    }
  };

  const handleCreateTask = async () => {
    if (!user?.id || !newTask.title || !newTask.class_name) {
      toast.error('Please fill in all required fields');
      return;
    }

    const { error } = await supabase.from('tasks').insert({
      ...newTask,
      created_by: user.id,
      is_active: false,
      starts_at: newTask.starts_at || null,
      ends_at: newTask.ends_at || null,
    });

    if (error) {
      toast.error('Failed to create task');
    } else {
      toast.success('Task created successfully!');
      setShowCreateTask(false);
      setNewTask({
        title: '',
        description: '',
        task_type: 'exam',
        class_name: '',
        duration_minutes: 60,
        total_marks: 100,
        max_warnings: 3,
        starts_at: '',
        ends_at: '',
        required_fields: { name: true, class: true, email: false },
      });
      fetchTasks();
    }
  };
  const handleCreateClass = async () => {
    if (!newClassName.trim()) {
      toast.error('Please enter a class name');
      return;
    }
    const { error } = await supabase.from('classes').insert({
      name: newClassName.trim(),
      description: newClassDescription.trim() || null,
      created_by: user?.id || null,
    });
    if (error) {
      toast.error(error.message.includes('duplicate') ? 'Class already exists' : 'Failed to create class');
    } else {
      toast.success('Class created successfully!');
      setShowCreateClass(false);
      setNewClassName('');
      setNewClassDescription('');
    }
  };

  const toggleTaskActive = async (taskId: string, isActive: boolean) => {
    const { error } = await supabase
      .from('tasks')
      .update({ is_active: !isActive })
      .eq('id', taskId);

    if (error) {
      toast.error('Failed to update task');
    } else {
      toast.success(isActive ? 'Task deactivated' : 'Task activated - students can now take it!');
      fetchTasks();
    }
  };

  const handleForceSubmit = async () => {
    const ids = forceSubmitIds.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length < 3) {
      toast.error('Enter at least 3 student card IDs separated by commas');
      return;
    }

    // Find sessions by student card
    const sessionsToForce = examSessions.filter(s => {
      const profile = studentProfiles[s.student_id];
      return profile && ids.includes(profile.student_card);
    });

    if (sessionsToForce.length === 0) {
      toast.error('No active sessions found for those student cards');
      return;
    }

    for (const session of sessionsToForce) {
      await supabase
        .from('exam_sessions')
        .update({ is_active: false })
        .eq('id', session.id);
      
      await supabase.from('task_submissions').insert({
        student_id: session.student_id,
        task_id: session.task_id,
        status: 'force_submitted',
        warnings: session.warnings,
        submitted_at: new Date().toISOString(),
      });
    }

    toast.success(`Force submitted ${sessionsToForce.length} student(s)`);
    setForceSubmitIds('');
    fetchExamSessions();
  };

  const activeTasks = tasks.filter(t => t.is_active);

  // Assignment cards for active class
  interface AssignmentCard {
    id: string;
    title: string;
    task_type: string;
    created_at: string;
    creator_name: string;
    total_marks: number;
    submission_count: number;
    class_member_count: number;
    is_active: boolean;
    scores_published: boolean;
  }
  const [assignmentCards, setAssignmentCards] = useState<AssignmentCard[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentCard | null>(null);
  const [assignmentStudents, setAssignmentStudents] = useState<{ user_id: string; full_name: string; score: number | null; warnings: number; status: string }[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [postingOutcome, setPostingOutcome] = useState(false);

  useEffect(() => {
    if (!activeClass) return;
    const fetchAssignments = async () => {
      setLoadingActivity(true);
      
      // Fetch tasks for active class
      const { data: classTasks } = await supabase
        .from('tasks')
        .select('id, title, task_type, created_at, created_by, total_marks, is_active, scores_published')
        .eq('class_name', activeClass)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (!classTasks || classTasks.length === 0) {
        setAssignmentCards([]);
        setLoadingActivity(false);
        return;
      }

      // Fetch creator names
      const creatorIds = [...new Set(classTasks.map(t => t.created_by))];
      const { data: creators } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', creatorIds);
      const creatorMap: Record<string, string> = {};
      (creators || []).forEach(c => { creatorMap[c.user_id] = c.full_name; });

      // Fetch submission counts per task
      const taskIds = classTasks.map(t => t.id);
      const { data: submissions } = await supabase
        .from('task_submissions')
        .select('task_id')
        .in('task_id', taskIds);
      const subCounts: Record<string, number> = {};
      (submissions || []).forEach(s => { subCounts[s.task_id] = (subCounts[s.task_id] || 0) + 1; });

      // Count class members
      const { count: memberCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('current_class', activeClass)
        .eq('role', 'student');

      const cards: AssignmentCard[] = classTasks.map(t => ({
        id: t.id,
        title: t.title,
        task_type: t.task_type,
        created_at: t.created_at,
        creator_name: creatorMap[t.created_by] || 'Unknown',
        total_marks: t.total_marks || 100,
        submission_count: subCounts[t.id] || 0,
        class_member_count: memberCount || 0,
        is_active: t.is_active ?? false,
        scores_published: t.scores_published ?? false,
      }));

      setAssignmentCards(cards);
      setLoadingActivity(false);
    };
    fetchAssignments();
  }, [activeClass]);

  const openAssignmentDetail = async (card: AssignmentCard) => {
    setSelectedAssignment(card);
    setLoadingStudents(true);
    
    // Fetch all students in this class
    const { data: classStudents } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .eq('current_class', activeClass)
      .eq('role', 'student');

    // Fetch submissions for this task
    const { data: subs } = await supabase
      .from('task_submissions')
      .select('student_id, score, warnings, status')
      .eq('task_id', card.id);

    const subMap: Record<string, { score: number | null; warnings: number; status: string }> = {};
    (subs || []).forEach(s => {
      subMap[s.student_id] = { score: s.score, warnings: s.warnings || 0, status: s.status || 'unknown' };
    });

    const studentList = (classStudents || []).map(s => ({
      user_id: s.user_id,
      full_name: s.full_name,
      score: subMap[s.user_id]?.score ?? null,
      warnings: subMap[s.user_id]?.warnings ?? 0,
      status: subMap[s.user_id]?.status ?? 'not_submitted',
    }));

    // Sort: submitted students by score desc, then unsubmitted at bottom
    studentList.sort((a, b) => {
      if (a.status === 'not_submitted' && b.status !== 'not_submitted') return 1;
      if (a.status !== 'not_submitted' && b.status === 'not_submitted') return -1;
      return (b.score ?? 0) - (a.score ?? 0);
    });

    setAssignmentStudents(studentList);
    setLoadingStudents(false);
  };

  const handlePostOutcome = async () => {
    if (!selectedAssignment || postingOutcome) return;
    setPostingOutcome(true);
    const result = await setScoresPublished(selectedAssignment.id, true);
    setPostingOutcome(false);
    if (!result.ok) {
      toast.error(result.message);
    } else {
      toast.success('Scores published! Students can now view their results.');
      setSelectedAssignment({ ...selectedAssignment, scores_published: true });
      setAssignmentCards(prev => prev.map(c => c.id === selectedAssignment.id ? { ...c, scores_published: true } : c));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Good morning, {profile?.full_name?.split(' ')[0] || 'Teacher'}!
          </h1>
          <p className="text-muted-foreground">
            Manage your classes and monitor student progress.
          </p>
        </div>
        {/* Class creation is admin-only — teachers manage subjects/tasks only */}

      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-secondary/50 to-background">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Tasks</p>
                <p className="text-2xl font-bold text-foreground">{activeTasks.length}</p>
                <p className="text-xs text-success">{examSessions.length} students taking</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                <Radio className="w-6 h-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/50 to-background">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Live Students</p>
                <p className="text-2xl font-bold text-foreground">{examSessions.length}</p>
                <p className="text-xs text-muted-foreground">Currently taking exams</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Video className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/50 to-background">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Tasks</p>
                <p className="text-2xl font-bold text-foreground">{tasks.length}</p>
                <p className="text-xs text-muted-foreground">Created by you</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/50 to-background">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Warnings Today</p>
                <p className="text-2xl font-bold text-foreground">
                  {examSessions.reduce((acc, s) => acc + (s.warnings || 0), 0)}
                </p>
                <p className="text-xs text-destructive">From active sessions</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-destructive/20 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignments Overview */}
      {activeClass && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              {activeClass} — Assignments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : assignmentCards.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No assignments for this class yet</p>
            ) : (
              <div className="space-y-2">
                {assignmentCards.map((card) => (
                  <div
                    key={card.id}
                    onClick={() => openAssignmentDetail(card)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                      card.is_active ? 'bg-success/20' : 'bg-muted'
                    )}>
                      <ClipboardList className={cn('w-5 h-5', card.is_active ? 'text-success' : 'text-muted-foreground')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
                      <p className="text-xs text-muted-foreground">
                        By {card.creator_name} • {format(new Date(card.created_at), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-foreground">
                        {card.submission_count}/{card.class_member_count}
                      </p>
                      <p className="text-xs text-muted-foreground">submitted</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Badge variant={card.is_active ? 'default' : 'secondary'} className="text-xs">
                        {card.task_type}
                      </Badge>
                      {card.scores_published && (
                        <Badge variant="outline" className="text-xs text-success border-success">
                          Published
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Assignment Detail Dialog */}
      <Dialog open={!!selectedAssignment} onOpenChange={(open) => !open && setSelectedAssignment(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              {selectedAssignment?.title}
            </DialogTitle>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>By {selectedAssignment?.creator_name}</span>
              <span>•</span>
              <span>{selectedAssignment?.total_marks} marks</span>
              <span>•</span>
              <span>{selectedAssignment?.submission_count}/{selectedAssignment?.class_member_count} submitted</span>
            </div>
          </DialogHeader>
          
          <ScrollArea className="flex-1 -mx-6 px-6">
            {loadingStudents ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead className="text-center">Warnings</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignmentStudents.map((student, idx) => (
                    <TableRow key={student.user_id}>
                      <TableCell className="font-medium text-muted-foreground">
                        {student.status !== 'not_submitted' ? idx + 1 : '—'}
                      </TableCell>
                      <TableCell className="font-medium">{student.full_name}</TableCell>
                      <TableCell className="text-center">
                        {student.score !== null ? (
                          <span className="font-semibold">{student.score}/{selectedAssignment?.total_marks}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {student.warnings > 0 ? (
                          <Badge variant="destructive" className="text-xs">{student.warnings}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {student.status === 'not_submitted' ? (
                          <Badge variant="secondary" className="text-xs">Not Submitted</Badge>
                        ) : student.status === 'force_submitted' ? (
                          <Badge variant="destructive" className="text-xs">Force Submitted</Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Submitted
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>

          <div className="flex justify-between items-center pt-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              {selectedAssignment?.scores_published ? (
                <span className="flex items-center gap-1 text-success">
                  <CheckCircle2 className="w-4 h-4" />
                  Scores are published — students can view results
                </span>
              ) : (
                <span>Scores are hidden from students</span>
              )}
            </div>
            {!selectedAssignment?.scores_published && (
              <Button onClick={handlePostOutcome} className="gap-2">
                <Trophy className="w-4 h-4" />
                Post Outcome
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Monitoring */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Radio className="w-5 h-5 text-success animate-pulse" />
              Live Monitoring
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {examSessions.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No active exams right now</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {tasks.length > 0 
                    ? `Last task created: ${new Date(tasks[0].created_at).toLocaleDateString()}`
                    : 'Create a task to get started'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {examSessions.slice(0, 9).map((session) => {
                    const studentProfile = studentProfiles[session.student_id];
                    const sessionWarnings = session.warnings || 0;
                    const hasWarning = sessionWarnings > 0;
                    
                    return (
                      <div
                        key={session.id}
                        className={cn(
                          'p-3 rounded-lg border transition-all',
                          hasWarning 
                            ? 'border-destructive bg-destructive/10 shadow-[0_0_15px_-3px_hsl(var(--destructive)/0.5)] animate-pulse' 
                            : 'border-border'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center',
                            hasWarning ? 'bg-destructive/20' : 'bg-muted'
                          )}>
                            <Video className={cn('w-4 h-4', hasWarning && 'text-destructive')} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {studentProfile?.full_name || 'Student'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {studentProfile?.student_card || 'No ID'}
                            </p>
                          </div>
                        </div>
                        {sessionWarnings > 0 && (
                          <div className="mt-2 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-destructive" />
                            <span className="text-xs text-destructive font-medium">
                              {sessionWarnings} warning{sessionWarnings > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Force Submit Section */}
                <div className="border-t border-border pt-4 space-y-3">
                  <Label className="text-sm font-medium">Force Submit Students</Label>
                  <p className="text-xs text-muted-foreground">
                    Enter 3+ student card IDs separated by commas to force submit their exams
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., SC001, SC002, SC003"
                      value={forceSubmitIds}
                      onChange={(e) => setForceSubmitIds(e.target.value)}
                      className="flex-1"
                    />
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={handleForceSubmit}
                      className="gap-1"
                    >
                      <Send className="w-4 h-4" />
                      Force
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Tasks List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Your Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No tasks created yet
              </div>
            ) : (
              tasks.slice(0, 6).map((task) => (
                <div
                  key={task.id}
                  className="p-3 rounded-lg border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm text-foreground">{task.title}</h4>
                    <div className="flex items-center gap-2">
                      <Badge variant={task.is_active ? 'default' : 'secondary'}>
                        {task.is_active ? 'Active' : task.task_type}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleTaskActive(task.id, task.is_active)}
                      >
                        {task.is_active ? 'Stop' : 'Start'}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{task.class_name}</span>
                    <span>{task.duration_minutes}min • {task.max_warnings} warnings max</span>
                  </div>
                  {task.ends_at && (
                    <p className="text-xs text-warning mt-1">
                      Deadline: {new Date(task.ends_at).toLocaleString()}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Collaboration & Communication</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="meetings" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="meetings"><MeetingsIcon className="w-4 h-4 mr-2" />Meetings</TabsTrigger>
              <TabsTrigger value="live"><RadioBroadcast className="w-4 h-4 mr-2" />Live Events</TabsTrigger>
              <TabsTrigger value="announce"><Megaphone className="w-4 h-4 mr-2" />Announcements</TabsTrigger>
            </TabsList>
            <TabsContent value="meetings" className="mt-4">
              <Suspense fallback={<div className="h-32" />}><MeetingsModule /></Suspense>
            </TabsContent>
            <TabsContent value="live" className="mt-4">
              <Suspense fallback={<div className="h-32" />}><LiveEventsModule /></Suspense>
            </TabsContent>
            <TabsContent value="announce" className="mt-4">
              <Suspense fallback={<div className="h-32" />}><AnnouncementsModule /></Suspense>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};