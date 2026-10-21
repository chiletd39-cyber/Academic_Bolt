import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CommentThread } from '@/components/comments/CommentThread';
import {
  BookOpen,
  Calendar,
  ClipboardList,
  Trophy,
  Clock,
  ChevronRight,
  MessageCircle,
  Pin,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

interface ClassPost {
  id: string;
  content: string;
  post_type: string;
  created_at: string;
  author_id: string;
  attachments?: any[];
  profiles?: {
    full_name: string;
    avatar_url: string | null;
  };
}

interface Task {
  id: string;
  title: string;
  task_type: string;
  class_name: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  scores_published?: boolean;
  total_marks?: number;
}

export const StudentDashboard = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<ClassPost[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submittedTaskIds, setSubmittedTaskIds] = useState<Set<string>>(new Set());
  const [submissionScores, setSubmissionScores] = useState<Record<string, number | null>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [profile?.current_class]);

  // Realtime: auto-update when new tasks or posts are added (#5)
  useEffect(() => {
    if (!profile?.current_class) return;

    const taskChannel = supabase
      .channel('student-tasks-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `class_name=eq.${profile.current_class}`,
      }, () => fetchData())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'class_posts',
        filter: `class_name=eq.${profile.current_class}`,
      }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(taskChannel); };
  }, [profile?.current_class]);

  const fetchData = async () => {
    setIsLoading(true);
    
    if (profile?.current_class) {
      const { data: postsData } = await supabase
        .from('class_posts')
        .select('*')
        .eq('class_name', profile.current_class)
        .order('created_at', { ascending: false })
        .limit(10);
      if (postsData) setPosts(postsData as unknown as ClassPost[]);
    }

    const { data: tasksData } = await supabase
      .from('tasks')
      .select('id, title, task_type, class_name, starts_at, ends_at, is_active, scores_published, total_marks')
      .eq('class_name', profile?.current_class || '')
      .order('created_at', { ascending: false })
      .limit(5);
    if (tasksData) setTasks(tasksData);

    // Fetch submitted task IDs and scores to prevent redo
    if (user?.id) {
      const { data: submissions } = await supabase
        .from('task_submissions')
        .select('task_id, score')
        .eq('student_id', user.id);
      if (submissions) {
        setSubmittedTaskIds(new Set(submissions.map(s => s.task_id)));
        const scoreMap: Record<string, number | null> = {};
        submissions.forEach(s => { scoreMap[s.task_id] = s.score; });
        setSubmissionScores(scoreMap);
      }
    }
    
    setIsLoading(false);
  };

  const startExam = (taskId: string) => {
    if (submittedTaskIds.has(taskId)) {
      toast.error('You have already submitted this task. Re-attempts are not allowed.');
      return;
    }
    navigate(`/exam/${taskId}`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome back, {profile?.full_name?.split(' ')[0] || 'Student'}!
          </h1>
          <p className="text-muted-foreground">
            Class: {profile?.current_class || 'Not assigned'} • Here's what's happening today.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          {tasks.find(t => t.is_active && !submittedTaskIds.has(t.id)) && (
            <Button className="gap-2" onClick={() => startExam(tasks.find(t => t.is_active && !submittedTaskIds.has(t.id))!.id)}>
              <BookOpen className="w-4 h-4" />
              Start Exam
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-secondary/50 to-background">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overall Rank</p>
                <p className="text-2xl font-bold text-foreground">-</p>
                <p className="text-xs text-muted-foreground">Not calculated yet</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                <Trophy className="w-6 h-6 text-accent-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/50 to-background">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average Score</p>
                <p className="text-2xl font-bold text-foreground">-</p>
                <p className="text-xs text-muted-foreground">No tasks yet</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/50 to-background">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Tasks</p>
                <p className="text-2xl font-bold text-foreground">{tasks.filter(t => t.is_active && !submittedTaskIds.has(t.id)).length}</p>
                <p className="text-xs text-warning">Active now</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/50 to-background">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Current Term</p>
                <p className="text-2xl font-bold text-foreground">Term 1</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Class Feed with Comments */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Class Activity</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1">
              View All <ChevronRight className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Students can only view and comment on posts, not create new ones */}
            <p className="text-xs text-muted-foreground italic">
              Use the comment icon below each post to discuss with your class.
            </p>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No posts yet. Be the first to comment!
              </div>
            ) : (
              posts.map((post) => {
                const postAttachments = Array.isArray(post.attachments) ? post.attachments as any[] : [];
                return (
                <div
                  key={post.id}
                  className="p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <MessageCircle className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={post.post_type === 'announcement' ? 'default' : 'secondary'}>
                          {post.post_type}
                        </Badge>
                        {post.post_type === 'announcement' && (
                          <Pin className="w-3 h-3 text-warning flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{post.content}</p>
                      
                      {/* Render attachments */}
                      {postAttachments.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {postAttachments.map((att: any, idx: number) => {
                            if (att.type?.startsWith('image/')) {
                              return (
                                <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer">
                                  <img src={att.url} alt={att.name} className="max-w-full max-h-60 rounded-lg border border-border" />
                                </a>
                              );
                            }
                            if (att.type?.startsWith('video/')) {
                              return (
                                <video key={idx} controls className="max-w-full max-h-60 rounded-lg border border-border">
                                  <source src={att.url} type={att.type} />
                                  Your browser does not support the video tag.
                                </video>
                              );
                            }
                            if (att.type?.includes('pdf')) {
                              return (
                                <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2 rounded-md bg-muted border border-border hover:bg-muted/80 transition-colors">
                                  <FileText className="w-4 h-4 text-destructive shrink-0" />
                                  <span className="text-sm truncate">{att.name}</span>
                                </a>
                              );
                            }
                            return (
                              <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2 rounded-md bg-muted border border-border hover:bg-muted/80 transition-colors">
                                <FileText className="w-4 h-4 shrink-0" />
                                <span className="text-sm truncate">{att.name}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(post.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <CommentThread parentType="class_post" parentId={post.id} />
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Upcoming Tasks */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Upcoming Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No tasks scheduled
              </div>
            ) : (
              tasks.map((task) => {
                const alreadySubmitted = submittedTaskIds.has(task.id);
                return (
                <div
                  key={task.id}
                  className="p-3 rounded-lg border border-border hover:border-primary/50 transition-colors"
                >
                  <div
                    className={alreadySubmitted ? 'opacity-60' : 'cursor-pointer'}
                    onClick={() => !alreadySubmitted && task.is_active && startExam(task.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium text-sm text-foreground">{task.title}</h4>
                      <Badge 
                        variant={alreadySubmitted ? 'outline' : task.is_active ? 'default' : 'secondary'} 
                        className={alreadySubmitted ? 'text-xs border-success text-success' : 'text-xs'}
                      >
                        {alreadySubmitted ? 'Submitted' : task.is_active ? 'Active' : task.task_type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{task.class_name}</p>
                    {alreadySubmitted && task.scores_published && submissionScores[task.id] !== null && submissionScores[task.id] !== undefined ? (
                      <p className="text-xs text-success mt-1 font-medium">
                        Score: {submissionScores[task.id]}/{task.total_marks || 100}
                      </p>
                    ) : alreadySubmitted ? (
                      <p className="text-xs text-muted-foreground mt-1 italic">You have already completed this task</p>
                    ) : null}
                    {!alreadySubmitted && task.starts_at && (
                      <p className="text-xs text-warning mt-1">
                        {new Date(task.starts_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <CommentThread parentType="task" parentId={task.id} compact />
                </div>
                );
              })
            )}

            <Button variant="outline" className="w-full mt-2">
              View All Tasks
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
