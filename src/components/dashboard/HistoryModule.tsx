import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveClass } from '@/contexts/ActiveClassContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, CheckCircle, Clock, AlertTriangle, ChevronDown, ChevronRight, ClipboardList, FileText, User, FolderOpen, Check } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { setScoresPublished } from '@/grading-engine';

interface TaskItem {
  id: string;
  title: string;
  task_type: string;
  class_name: string;
  created_at: string;
  created_by: string;
  total_marks: number;
  scores_published: boolean;
}

interface StudentDetail {
  user_id: string;
  full_name: string;
  current_class: string;
  score: number | null;
  warnings: number;
  status: string;
  position: number;
  submission_id: string | null;
}

interface TypeSubfold {
  task_type: string;
  dates: {
    date: string;
    tasks: (TaskItem & { submission_count: number; class_member_count: number; all_graded: boolean })[];
  }[];
}

interface FoldGroup {
  key: string;            // class_name
  class_name: string;
  types: TypeSubfold[];   // subfolds by task_type
}

export const HistoryModule = () => {
  const { user, role } = useAuth();
  const { activeClass } = useActiveClass();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'tasks' | 'posts'>('all');
  
  const [allTasks, setAllTasks] = useState<(TaskItem & { submission_count: number; class_member_count: number; all_graded: boolean })[]>([]);
  const [activities, setActivities] = useState<{ id: string; title: string; created_at: string; class_name: string }[]>([]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [studentDetails, setStudentDetails] = useState<Record<string, StudentDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [editingScores, setEditingScores] = useState<Record<string, Record<string, string>>>({});
  const [publishingTask, setPublishingTask] = useState<string | null>(null);

  // Student view
  const [studentSubmissions, setStudentSubmissions] = useState<any[]>([]);

  // Fold state
  const [expandedFolds, setExpandedFolds] = useState<Set<string>>(new Set());
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const isStaff = role === 'teacher' || role === 'admin';
  const isAdmin = role === 'admin';

  useEffect(() => {
    if (isStaff) {
      fetchStaffHistory();
    } else {
      fetchStudentHistory();
    }
  }, [user, role, activeClass, filter]);

  const fetchStaffHistory = async () => {
    if (!user) return;
    setLoading(true);

    // For teacher: only tasks they created; for admin: all tasks
    let taskQuery = supabase
      .from('tasks')
      .select('id, title, task_type, class_name, created_at, total_marks, scores_published, created_by')
      .order('created_at', { ascending: false });

    if (!isAdmin) {
      taskQuery = taskQuery.eq('created_by', user.id);
    }

    const { data: tasksData } = await taskQuery;

    if (tasksData && tasksData.length > 0) {
      const taskIds = tasksData.map(t => t.id);
      
      // Get submissions counts
      const { data: submissions } = await supabase
        .from('task_submissions')
        .select('task_id, score, status')
        .in('task_id', taskIds);

      const subCounts: Record<string, number> = {};
      const gradedCheck: Record<string, { total: number; graded: number }> = {};
      (submissions || []).forEach(s => {
        subCounts[s.task_id] = (subCounts[s.task_id] || 0) + 1;
        if (!gradedCheck[s.task_id]) gradedCheck[s.task_id] = { total: 0, graded: 0 };
        gradedCheck[s.task_id].total++;
        if (s.score !== null) gradedCheck[s.task_id].graded++;
      });

      // Get class member counts for each unique class
      const uniqueClasses = [...new Set(tasksData.map(t => t.class_name))];
      const memberCounts: Record<string, number> = {};
      
      for (const cls of uniqueClasses) {
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('current_class', cls)
          .eq('role', 'student');
        memberCounts[cls] = count || 0;
      }

      setAllTasks(tasksData.map(t => ({
        ...t,
        submission_count: subCounts[t.id] || 0,
        class_member_count: memberCounts[t.class_name] || 0,
        all_graded: gradedCheck[t.id] 
          ? (gradedCheck[t.id].graded === gradedCheck[t.id].total && gradedCheck[t.id].total > 0)
          : false,
      })));
    } else {
      setAllTasks([]);
    }

    // Fetch posts
    if (filter !== 'tasks' && activeClass) {
      const { data: posts } = await supabase
        .from('class_posts')
        .select('id, content, created_at, class_name')
        .eq('class_name', activeClass)
        .order('created_at', { ascending: false })
        .limit(20);

      setActivities((posts || []).map(p => ({
        id: p.id,
        title: p.content.substring(0, 60) + (p.content.length > 60 ? '...' : ''),
        created_at: p.created_at,
        class_name: p.class_name,
      })));
    } else {
      setActivities([]);
    }

    setLoading(false);
  };

  const fetchStudentHistory = async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await supabase
      .from('task_submissions')
      .select(`*, tasks:task_id (title, task_type, total_marks, class_name, scores_published)`)
      .eq('student_id', user.id)
      .order('created_at', { ascending: false });

    setStudentSubmissions(data || []);
    setLoading(false);
  };

  // Group: class_name → task_type → date → tasks
  const foldGroups = useMemo<FoldGroup[]>(() => {
    const groups: Record<string, FoldGroup> = {};

    allTasks.forEach(task => {
      const classKey = task.class_name;
      if (!groups[classKey]) {
        groups[classKey] = { key: classKey, class_name: task.class_name, types: [] };
      }
      let typeFold = groups[classKey].types.find(t => t.task_type === task.task_type);
      if (!typeFold) {
        typeFold = { task_type: task.task_type, dates: [] };
        groups[classKey].types.push(typeFold);
      }
      const dateStr = format(new Date(task.created_at), 'yyyy-MM-dd');
      let dateGroup = typeFold.dates.find(d => d.date === dateStr);
      if (!dateGroup) {
        dateGroup = { date: dateStr, tasks: [] };
        typeFold.dates.push(dateGroup);
      }
      dateGroup.tasks.push(task);
    });

    Object.values(groups).forEach(g => {
      g.types.forEach(t => t.dates.sort((a, b) => b.date.localeCompare(a.date)));
      g.types.sort((a, b) => a.task_type.localeCompare(b.task_type));
    });

    return Object.values(groups).sort((a, b) => a.class_name.localeCompare(b.class_name));
  }, [allTasks]);

  const toggleFold = (key: string) => {
    setExpandedFolds(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleDate = (key: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleTaskDetails = async (taskId: string) => {
    if (expandedTask === taskId) {
      setExpandedTask(null);
      return;
    }
    setExpandedTask(taskId);
    if (studentDetails[taskId]) return;

    setLoadingDetails(taskId);
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    const [studentsRes, subsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('user_id, full_name, current_class')
        .eq('current_class', task.class_name)
        .eq('role', 'student'),
      supabase
        .from('task_submissions')
        .select('id, student_id, score, warnings, status')
        .eq('task_id', taskId),
    ]);

    const subMap: Record<string, { score: number | null; warnings: number; status: string; id: string }> = {};
    (subsRes.data || []).forEach(s => {
      subMap[s.student_id] = { score: s.score, warnings: s.warnings || 0, status: s.status || 'unknown', id: s.id };
    });

    const students: StudentDetail[] = (studentsRes.data || []).map(s => ({
      user_id: s.user_id,
      full_name: s.full_name,
      current_class: s.current_class || '',
      score: subMap[s.user_id]?.score ?? null,
      warnings: subMap[s.user_id]?.warnings ?? 0,
      status: subMap[s.user_id]?.status ?? 'not_submitted',
      position: 0,
      submission_id: subMap[s.user_id]?.id ?? null,
    }));

    students.sort((a, b) => {
      if (a.status === 'not_submitted' && b.status !== 'not_submitted') return 1;
      if (a.status !== 'not_submitted' && b.status === 'not_submitted') return -1;
      return (b.score ?? 0) - (a.score ?? 0);
    });

    let pos = 1;
    students.forEach(s => {
      if (s.status !== 'not_submitted') s.position = pos++;
    });

    setStudentDetails(prev => ({ ...prev, [taskId]: students }));
    setLoadingDetails(null);
  };

  const handleScoreChange = (taskId: string, studentId: string, value: string) => {
    setEditingScores(prev => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), [studentId]: value },
    }));
  };

  const saveScore = async (taskId: string, student: StudentDetail, totalMarks: number) => {
    const val = editingScores[taskId]?.[student.user_id];
    if (val === undefined || val === '') return;
    
    const score = parseInt(val);
    if (isNaN(score) || score < 0 || score > totalMarks) {
      toast.error(`Score must be between 0 and ${totalMarks}`);
      return;
    }

    if (!student.submission_id) {
      toast.error('No submission found for this student');
      return;
    }

    const { error } = await supabase
      .from('task_submissions')
      .update({ score })
      .eq('id', student.submission_id);

    if (error) {
      toast.error('Failed to save score');
    } else {
      // Update local state
      setStudentDetails(prev => {
        const updated = { ...prev };
        if (updated[taskId]) {
          updated[taskId] = updated[taskId].map(s =>
            s.user_id === student.user_id ? { ...s, score } : s
          );
          // Re-sort
          updated[taskId].sort((a, b) => {
            if (a.status === 'not_submitted' && b.status !== 'not_submitted') return 1;
            if (a.status !== 'not_submitted' && b.status === 'not_submitted') return -1;
            return (b.score ?? 0) - (a.score ?? 0);
          });
          let p = 1;
          updated[taskId].forEach(s => { if (s.status !== 'not_submitted') s.position = p++; });
        }
        return updated;
      });
      // Clear editing
      setEditingScores(prev => {
        const next = { ...prev };
        if (next[taskId]) delete next[taskId][student.user_id];
        return next;
      });
      toast.success('Score saved');
    }
  };

  const publishScores = async (taskId: string) => {
    if (publishingTask === taskId) return; // single-flight guard for double clicks
    setPublishingTask(taskId);
    const result = await setScoresPublished(taskId, true);
    if (!result.ok) {
      toast.error(result.message);
    } else {
      setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, scores_published: true } : t));
      toast.success('Scores published! Students can now view their results.');
    }
    setPublishingTask(null);
  };

  const getScoreColor = (score: number | null, total: number) => {
    if (score === null) return 'text-muted-foreground';
    const pct = (score / total) * 100;
    if (pct >= 70) return 'text-green-600';
    if (pct >= 50) return 'text-yellow-600';
    return 'text-destructive';
  };

  const isFoldComplete = (group: FoldGroup) => {
    return group.types.every(t => t.dates.every(d => d.tasks.every(tk => tk.scores_published && tk.all_graded)));
  };
  const isTypeFoldComplete = (tf: TypeSubfold) => {
    return tf.dates.every(d => d.tasks.every(t => t.scores_published && t.all_graded));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // ─── Student View ───
  if (!isStaff) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">History</h2>
          <p className="text-muted-foreground">Your submission history</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Submissions</p>
                  <p className="text-2xl font-bold">{studentSubmissions.length}</p>
                </div>
                <History className="w-8 h-8 text-primary/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-green-600">
                    {studentSubmissions.filter((s: any) => s.status === 'submitted').length}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-600/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Average Score</p>
                  <p className="text-2xl font-bold">
                    {studentSubmissions.filter((s: any) => s.score !== null && s.tasks?.scores_published).length > 0
                      ? (studentSubmissions
                          .filter((s: any) => s.score !== null && s.tasks?.scores_published)
                          .reduce((a: number, b: any) => a + (b.score || 0), 0) /
                         studentSubmissions.filter((s: any) => s.score !== null && s.tasks?.scores_published).length
                        ).toFixed(0)
                      : '-'}%
                  </p>
                </div>
                <Clock className="w-8 h-8 text-yellow-600/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Submission Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            {studentSubmissions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead className="text-center">Warnings</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentSubmissions.map((sub: any) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.tasks?.title || 'Unknown'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{sub.tasks?.task_type || 'Task'}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {sub.status === 'submitted' ? (
                          <Badge className="bg-green-500/20 text-green-600 hover:bg-green-500/30">Submitted</Badge>
                        ) : sub.status === 'force_submitted' ? (
                          <Badge variant="destructive">Force Submitted</Badge>
                        ) : (
                          <Badge variant="secondary">{sub.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-center font-medium ${getScoreColor(sub.score, sub.tasks?.total_marks || 100)}`}>
                        {sub.tasks?.scores_published
                          ? (sub.score !== null ? `${sub.score}/${sub.tasks?.total_marks || 100}` : 'Pending')
                          : (sub.score !== null ? 'Not Published' : '-')}
                      </TableCell>
                      <TableCell className="text-center">
                        {sub.warnings > 0 ? <Badge variant="destructive">{sub.warnings}</Badge> : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell>
                        {sub.submitted_at ? format(new Date(sub.submitted_at), 'MMM dd, yyyy HH:mm') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <History className="w-12 h-12 mx-auto text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">No submission history yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Staff View with Fold Structure ───
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">History</h2>
          <p className="text-muted-foreground">
            {isAdmin ? 'All task submissions across classes' : 'Your task submissions'}
          </p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Activity</SelectItem>
            <SelectItem value="tasks">Tasks Only</SelectItem>
            <SelectItem value="posts">Posts Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Tasks</p>
                <p className="text-2xl font-bold">{allTasks.length}</p>
              </div>
              <ClipboardList className="w-8 h-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {allTasks.filter(t => t.scores_published && t.all_graded).length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Fold Groups</p>
                <p className="text-2xl font-bold">{foldGroups.length}</p>
              </div>
              <FolderOpen className="w-8 h-8 text-yellow-600/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fold Structure: Class + Type → Date → Tasks */}
      {(filter === 'all' || filter === 'tasks') && (
        <div className="space-y-3">
          {foldGroups.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">No tasks found</p>
              </CardContent>
            </Card>
          ) : (
            foldGroups.map(group => {
              const foldOpen = expandedFolds.has(group.key);
              const complete = isFoldComplete(group);

              return (
                <Card key={group.key}>
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleFold(group.key)}
                  >
                    <div className="shrink-0">
                      {foldOpen ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <FolderOpen className={`w-5 h-5 shrink-0 ${complete ? 'text-green-600' : 'text-yellow-600'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{group.class_name}</p>
                        {complete && <span className="text-green-600 text-lg">✅</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {group.types.length} categor{group.types.length === 1 ? 'y' : 'ies'} · {group.types.reduce((sum, t) => sum + t.dates.reduce((s, d) => s + d.tasks.length, 0), 0)} task(s)
                      </p>
                    </div>
                  </div>

                  {foldOpen && (
                    <div className="border-t border-border">
                      {group.types.map(typeFold => {
                        const typeKey = `${group.key}||TYPE||${typeFold.task_type}`;
                        const typeOpen = expandedFolds.has(typeKey);
                        const typeComplete = isTypeFoldComplete(typeFold);
                        return (
                          <div key={typeKey} className="border-b border-border last:border-0 bg-muted/10">
                            <div
                              className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                              onClick={() => toggleFold(typeKey)}
                            >
                              <div className="shrink-0">
                                {typeOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                              </div>
                              <FolderOpen className={`w-4 h-4 shrink-0 ${typeComplete ? 'text-green-600' : 'text-primary/70'}`} />
                              <div className="flex-1 flex items-center gap-2">
                                <Badge variant="outline" className="capitalize text-xs">{typeFold.task_type}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {typeFold.dates.reduce((s, d) => s + d.tasks.length, 0)} task(s) · {typeFold.dates.length} date(s)
                                </span>
                                {typeComplete && <span className="text-green-600">✅</span>}
                              </div>
                            </div>

                            {typeOpen && typeFold.dates.map(dateGroup => {
                              const dateKey = `${typeKey}||${dateGroup.date}`;
                              const dateOpen = expandedDates.has(dateKey);
                              const dateComplete = dateGroup.tasks.every(t => t.scores_published && t.all_graded);

                              return (
                                <div key={dateKey} className="border-t border-border/60 bg-background">
                                  <div
                                    className="flex items-center gap-3 px-8 py-2 cursor-pointer hover:bg-muted/20 transition-colors"
                                    onClick={() => toggleDate(dateKey)}
                                  >
                                    <div className="shrink-0">
                                      {dateOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                                    </div>
                                    <div className="flex-1 flex items-center gap-2">
                                      <p className="text-sm font-medium text-foreground">
                                        {format(new Date(dateGroup.date), 'dd MMM yyyy')}
                                      </p>
                                      <Badge variant="secondary" className="text-xs">{dateGroup.tasks.length} task(s)</Badge>
                                      {dateComplete && <span className="text-green-600">✅</span>}
                                    </div>
                                  </div>

                                  {dateOpen && (
                                    <div className="pl-12 pr-4 pb-3 space-y-2">
                                      {dateGroup.tasks.map(task => {
                                        const taskComplete = task.scores_published && task.all_graded;

                                        return (
                                          <Collapsible
                                            key={task.id}
                                            open={expandedTask === task.id}
                                            onOpenChange={() => toggleTaskDetails(task.id)}
                                          >
                                            <CollapsibleTrigger asChild>
                                              <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
                                                <div className="shrink-0">
                                                  {expandedTask === task.id
                                                    ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                                    : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                                                </div>
                                                {taskComplete && <span className="text-green-600 shrink-0">✅</span>}
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                                                  <p className="text-xs text-muted-foreground">
                                                    {format(new Date(task.created_at), 'HH:mm')} · {task.submission_count}/{task.class_member_count} submitted
                                                  </p>
                                                </div>
                                                <div className="flex gap-1 shrink-0">
                                                  {task.scores_published && (
                                                    <Badge variant="outline" className="text-xs text-green-600 border-green-600">Published</Badge>
                                                  )}
                                                </div>
                                              </div>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent>
                                              <div className="ml-8 mr-2 mt-1 mb-2 border border-border rounded-lg overflow-hidden">
                                                {loadingDetails === task.id ? (
                                                  <div className="flex justify-center py-6">
                                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                                                  </div>
                                                ) : (
                                                  <>
                                                    <ScrollArea className="max-h-[350px]">
                                                      <Table>
                                                        <TableHeader>
                                                          <TableRow>
                                                            <TableHead className="w-12">#</TableHead>
                                                            <TableHead>Name</TableHead>
                                                            <TableHead>Class</TableHead>
                                                            <TableHead className="text-center">Score</TableHead>
                                                            <TableHead className="text-center">Warnings</TableHead>
                                                            <TableHead className="text-center">Status</TableHead>
                                                            <TableHead className="text-center w-24">Grade</TableHead>
                                                          </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                          {(studentDetails[task.id] || []).map(student => (
                                                            <TableRow key={student.user_id}>
                                                              <TableCell className="font-medium text-muted-foreground">
                                                                {student.status !== 'not_submitted' ? student.position : '—'}
                                                              </TableCell>
                                                              <TableCell className="font-medium">{student.full_name}</TableCell>
                                                              <TableCell className="text-sm text-muted-foreground">{student.current_class}</TableCell>
                                                              <TableCell className={`text-center font-medium ${getScoreColor(student.score, task.total_marks)}`}>
                                                                {student.score !== null ? `${student.score}/${task.total_marks}` : '—'}
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
                                                                  <Badge variant="destructive" className="text-xs">Forced</Badge>
                                                                ) : (
                                                                  <Badge className="bg-green-500/20 text-green-600 hover:bg-green-500/30 text-xs">Submitted</Badge>
                                                                )}
                                                              </TableCell>
                                                              <TableCell className="text-center">
                                                                {student.status !== 'not_submitted' && student.submission_id ? (
                                                                  <div className="flex items-center gap-1">
                                                                    <Input
                                                                      type="number"
                                                                      className="w-16 h-7 text-xs text-center"
                                                                      placeholder={student.score !== null ? String(student.score) : '—'}
                                                                      value={editingScores[task.id]?.[student.user_id] ?? ''}
                                                                      onChange={(e) => handleScoreChange(task.id, student.user_id, e.target.value)}
                                                                      min={0}
                                                                      max={task.total_marks}
                                                                    />
                                                                    {editingScores[task.id]?.[student.user_id] && (
                                                                      <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-7 w-7"
                                                                        onClick={() => saveScore(task.id, student, task.total_marks)}
                                                                      >
                                                                        <Check className="h-3 w-3" />
                                                                      </Button>
                                                                    )}
                                                                  </div>
                                                                ) : (
                                                                  <span className="text-xs text-muted-foreground">—</span>
                                                                )}
                                                              </TableCell>
                                                            </TableRow>
                                                          ))}
                                                        </TableBody>
                                                      </Table>
                                                    </ScrollArea>
                                                    {!task.scores_published && (studentDetails[task.id] || []).some(s => s.score !== null) && (
                                                      <div className="p-3 border-t border-border bg-muted/30 flex justify-end">
                                                        <Button
                                                          size="sm"
                                                          onClick={() => publishScores(task.id)}
                                                          disabled={publishingTask === task.id}
                                                          className="gap-2"
                                                        >
                                                          <CheckCircle className="h-4 w-4" />
                                                          {publishingTask === task.id ? 'Publishing...' : 'Post Outcome'}
                                                        </Button>
                                                      </div>
                                                    )}
                                                  </>
                                                )}
                                              </div>
                                            </CollapsibleContent>
                                          </Collapsible>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Posts/Notes Activity */}
      {(filter === 'all' || filter === 'posts') && activities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Posts & Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activities.map(activity => (
              <div key={activity.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{activity.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(activity.created_at), 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">Post</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
