import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { GraduationCap, Plus, Users, BookOpen, ArrowLeft, ClipboardList, MessageSquare, Bell, FileText, Activity, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ClassItem {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  student_count?: number;
}

interface ClassStudent {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  student_card: string | null;
  phone: string | null;
}

interface ClassActivity {
  tasks: any[];
  comments: any[];
  notices: any[];
  notes: any[];
}
const EMPTY_ACTIVITY: ClassActivity = { tasks: [], comments: [], notices: [], notes: [] };

export const ClassesModule = () => {
  const { user, role } = useAuth();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassDescription, setNewClassDescription] = useState('');
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [classStudents, setClassStudents] = useState<ClassStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const isAdmin = role === 'admin';

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    const { data: classData } = await supabase
      .from('classes')
      .select('*')
      .order('name');

    if (classData) {
      const classesWithCounts = await Promise.all(
        classData.map(async (cls) => {
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('current_class', cls.name)
            .eq('role', 'student');
          
          return { ...cls, student_count: count || 0 };
        })
      );
      setClasses(classesWithCounts);
    }
    setLoading(false);
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim()) {
      toast.error('Class name is required');
      return;
    }

    if (!isAdmin) {
      toast.error('Only administrators can create classes');
      return;
    }

    const { error } = await supabase.from('classes').insert({
      name: newClassName,
      description: newClassDescription || null,
      created_by: user?.id
    });

    if (error) {
      toast.error('Failed to create class');
    } else {
      toast.success('Class created successfully');
      setIsDialogOpen(false);
      setNewClassName('');
      setNewClassDescription('');
      fetchClasses();
    }
  };

  const handleDeleteClass = async (classId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin) return;
    
    const confirmed = window.confirm('Are you sure you want to delete this class?');
    if (!confirmed) return;

    const { error } = await supabase.from('classes').delete().eq('id', classId);
    if (error) {
      toast.error('Failed to delete class');
    } else {
      toast.success('Class deleted');
      fetchClasses();
    }
  };

  const handleSelectClass = async (cls: ClassItem) => {
    setSelectedClass(cls);
    setLoadingStudents(true);
    
    const { data } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, avatar_url, student_card, phone')
      .eq('current_class', cls.name)
      .eq('role', 'student')
      .order('full_name');

    setClassStudents((data as ClassStudent[]) || []);
    setLoadingStudents(false);
  };

  const [activity, setActivity] = useState<ClassActivity>(EMPTY_ACTIVITY);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    if (!selectedClass) { setActivity(EMPTY_ACTIVITY); return; }
    let cancelled = false;
    (async () => {
      setActivityLoading(true);
      const className = selectedClass.name;
      const [tasksRes, postsRes, commentsRes, noticesRes] = await Promise.all([
        // Real tasks for the class
        supabase.from('tasks')
          .select('id, title, task_type, created_at, is_active, ends_at')
          .eq('class_name', className)
          .order('created_at', { ascending: false })
          .limit(20),
        // Class posts (notes / posts / announcements scoped to class)
        supabase.from('class_posts')
          .select('id, content, post_type, author_id, created_at, attachments')
          .eq('class_name', className)
          .order('created_at', { ascending: false })
          .limit(50),
        // Teacher comments — public-visibility comments on tasks for this class
        (supabase as any).from('comments')
          .select('id, content, author_id, parent_id, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        // Announcements targeting this class (or all classes)
        (supabase as any).from('announcements')
          .select('id, title, body, audience, created_at, created_by_name, archived_at')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (cancelled) return;

      // Resolve author names (one shot)
      const authorIds = new Set<string>();
      (commentsRes.data || []).forEach((c: any) => c.author_id && authorIds.add(c.author_id));
      (postsRes.data || []).forEach((p: any) => p.author_id && authorIds.add(p.author_id));
      let nameMap: Record<string, string> = {};
      if (authorIds.size) {
        const { data: ppl } = await supabase
          .from('profiles').select('user_id, full_name').in('user_id', Array.from(authorIds));
        nameMap = Object.fromEntries((ppl || []).map((p: any) => [p.user_id, p.full_name]));
      }

      // Filter comments to those attached to this class's tasks/posts
      const taskIds = new Set((tasksRes.data || []).map((t: any) => t.id));
      const postIds = new Set((postsRes.data || []).map((p: any) => p.id));
      const classComments = ((commentsRes.data) || []).filter((c: any) =>
        taskIds.has(c.parent_id) || postIds.has(c.parent_id)
      );

      const tasks = (tasksRes.data || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        type: t.task_type || 'task',
        date: new Date(t.created_at).toISOString().slice(0, 10),
        status: t.is_active ? 'active' : (t.ends_at && new Date(t.ends_at) < new Date() ? 'ended' : 'draft'),
      }));

      const comments = classComments.map((c: any) => ({
        id: c.id,
        author: nameMap[c.author_id] || 'Member',
        message: c.content,
        date: new Date(c.created_at).toISOString().slice(0, 10),
      }));

      // Notices = announcements targeting this class or untargeted
      const notices = (noticesRes.data || [])
        .filter((a: any) => {
          const tgt = a.audience?.classes || [];
          return tgt.length === 0 || tgt.includes(className);
        })
        .map((a: any) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          author: a.created_by_name || 'Admin',
          priority: a.archived_at ? 'low' : 'medium',
          date: new Date(a.created_at).toISOString().slice(0, 10),
        }));

      // Notes = class_posts of type 'post' or 'announcement'
      const notes = (postsRes.data || [])
        .filter((p: any) => p.post_type !== 'comment')
        .map((p: any) => ({
          id: p.id,
          subject: p.post_type === 'announcement' ? 'Announcement' : 'Class note',
          topic: p.content.slice(0, 80) + (p.content.length > 80 ? '…' : ''),
          author: nameMap[p.author_id] || 'Member',
          date: new Date(p.created_at).toISOString().slice(0, 10),
        }));

      setActivity({ tasks, comments, notices, notes });
      setActivityLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedClass]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Class Detail View
  if (selectedClass) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedClass(null)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{selectedClass.name}</h2>
            <p className="text-muted-foreground">{selectedClass.description || 'Class overview and activity'}</p>
          </div>
        </div>

        {/* Class Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Students</p>
                <p className="text-2xl font-bold">{classStudents.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ClipboardList className="w-8 h-8 text-success" />
              <div>
                <p className="text-sm text-muted-foreground">Tasks</p>
                <p className="text-2xl font-bold">{activity.tasks.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <MessageSquare className="w-8 h-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Comments</p>
                <p className="text-2xl font-bold">{activity.comments.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Bell className="w-8 h-8 text-warning" />
              <div>
                <p className="text-sm text-muted-foreground">Notices</p>
                <p className="text-2xl font-bold">{activity.notices.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="students" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="comments">Comments</TabsTrigger>
            <TabsTrigger value="notices">Notices</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="students">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Students in {selectedClass.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingStudents ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : classStudents.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Student Card</TableHead>
                        <TableHead>Phone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {classStudents.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={student.avatar_url || undefined} />
                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                  {student.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{student.full_name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{student.student_card || '-'}</TableCell>
                          <TableCell>{student.phone || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No students enrolled in this class
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5" />
                  Recent Tasks & Exams
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Avg Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activity.tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{task.type}</Badge>
                        </TableCell>
                        <TableCell>{task.date}</TableCell>
                        <TableCell>
                          <Badge variant={task.status === 'completed' || task.status === 'graded' ? 'default' : 'secondary'} className="capitalize">
                            {task.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{task.score}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="comments">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Teacher Comments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {activity.comments.map((comment) => (
                  <div key={comment.id} className="p-4 rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-foreground">{comment.author}</span>
                      <span className="text-xs text-muted-foreground">{comment.date}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{comment.message}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notices">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notices & Announcements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activity.notices.map((notice) => (
                  <div key={notice.id} className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div>
                      <p className="font-medium text-foreground">{notice.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{notice.date}</p>
                    </div>
                    <Badge variant={getPriorityColor(notice.priority) as any} className="capitalize">
                      {notice.priority}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Class Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead>Pages</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activity.notes.map((note) => (
                      <TableRow key={note.id}>
                        <TableCell className="font-medium">{note.subject}</TableCell>
                        <TableCell>{note.topic}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{note.pages} pages</Badge>
                        </TableCell>
                        <TableCell>{note.date}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Classes List View
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Classes Management</h2>
          <p className="text-muted-foreground">
            {isAdmin ? 'Create and manage school classes' : 'View school classes'}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg">
                <Plus className="w-4 h-4 mr-2" />
                Create New Class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Class</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Class Name</Label>
                  <Input 
                    value={newClassName} 
                    onChange={(e) => setNewClassName(e.target.value)} 
                    placeholder="e.g., L4 SOD A"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Textarea 
                    value={newClassDescription} 
                    onChange={(e) => setNewClassDescription(e.target.value)} 
                    placeholder="Class description..."
                  />
                </div>
                <Button onClick={handleCreateClass} className="w-full" disabled={!newClassName.trim()}>
                  Create Class
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <GraduationCap className="w-8 h-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Total Classes</p>
              <p className="text-2xl font-bold">{classes.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-success" />
            <div>
              <p className="text-sm text-muted-foreground">Total Students</p>
              <p className="text-2xl font-bold">
                {classes.reduce((a, b) => a + (b.student_count || 0), 0)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-accent-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Avg per Class</p>
              <p className="text-2xl font-bold">
                {classes.length > 0 
                  ? Math.round(classes.reduce((a, b) => a + (b.student_count || 0), 0) / classes.length)
                  : 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Classes Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5" />
            All Classes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {classes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Students</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((cls) => (
                  <TableRow key={cls.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleSelectClass(cls)}>
                    <TableCell className="font-medium">{cls.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {cls.description || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{cls.student_count}</Badge>
                    </TableCell>
                    <TableCell>{format(new Date(cls.created_at), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleSelectClass(cls); }}>
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={(e) => handleDeleteClass(cls.id, e)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">No classes created yet</p>
              {isAdmin && <p className="text-sm text-muted-foreground mt-1">Click "Add Class" to create one</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
