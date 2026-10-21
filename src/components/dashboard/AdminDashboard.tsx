import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users, GraduationCap, BookOpen, Shield, UserPlus, AlertTriangle,
  Check, X, Key, Clock, Video, Radio, UserCircle, Plus, Megaphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const MeetingsModule = lazy(() => import('./MeetingsModule').then(m => ({ default: m.MeetingsModule })));
const LiveEventsModule = lazy(() => import('./LiveEventsModule').then(m => ({ default: m.LiveEventsModule })));
const AnnouncementsModule = lazy(() => import('./AnnouncementsModule').then(m => ({ default: m.AnnouncementsModule })));
const ExamSecurityConfigModule = lazy(() => import('./ExamSecurityConfigModule').then(m => ({ default: m.ExamSecurityConfigModule })));

interface ClassSwitchRequest {
  id: string;
  student_id: string;
  from_class: string | null;
  to_class: string;
  student_name: string;
  student_card: string | null;
  status: string;
  created_at: string;
}

interface ExamSession {
  id: string;
  is_active: boolean;
  warnings: number;
}

export const AdminDashboard = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [switchRequests, setSwitchRequests] = useState<ClassSwitchRequest[]>([]);
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [stats, setStats] = useState({ students: 0, teachers: 0, classes: 0, activeExams: 0 });
  const [showAddCode, setShowAddCode] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [maxAdminCount, setMaxAdminCount] = useState(4);
  const [adminCount, setAdminCount] = useState(0);
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const [newLimit, setNewLimit] = useState('4');
  const [pendingParents, setPendingParents] = useState(0);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassDescription, setNewClassDescription] = useState('');

  useEffect(() => {
    fetchData();

    const requestsChannel = supabase
      .channel('class-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_switch_requests' }, () => {
        fetchSwitchRequests();
      })
      .subscribe();

    const sessionsChannel = supabase
      .channel('exam-sessions-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_sessions' }, () => {
        fetchExamSessions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(sessionsChannel);
    };
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    await Promise.all([fetchStats(), fetchSwitchRequests(), fetchExamSessions(), checkMainAdmin(), fetchAdminSettings(), fetchPendingParents()]);
    setIsLoading(false);
  };

  const checkMainAdmin = async () => {
    if (!user?.id) return;
    const { data } = await supabase.rpc('is_main_admin', { _user_id: user.id });
    setIsMainAdmin(!!data);
  };

  const fetchAdminSettings = async () => {
    const { data } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'max_admin_count')
      .maybeSingle();
    if (data) {
      setMaxAdminCount(parseInt(data.setting_value) || 4);
      setNewLimit(data.setting_value);
    }
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin');
    setAdminCount(count || 0);
  };

  const handleUpdateLimit = async () => {
    const val = parseInt(newLimit);
    if (isNaN(val) || val < adminCount) {
      toast.error(`Limit cannot be less than current admin count (${adminCount})`);
      return;
    }
    const { error } = await supabase
      .from('admin_settings')
      .update({ setting_value: String(val), updated_by: user?.id, updated_at: new Date().toISOString() })
      .eq('setting_key', 'max_admin_count');
    if (error) {
      toast.error('Failed to update limit');
    } else {
      setMaxAdminCount(val);
      toast.success(`Admin limit updated to ${val}`);
      setShowLimitDialog(false);
    }
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim()) {
      toast.error('Class name is required');
      return;
    }
    const { error } = await supabase.from('classes').insert({
      name: newClassName.trim(),
      description: newClassDescription.trim() || null,
      created_by: user?.id,
    });
    if (error) {
      toast.error('Failed to create class');
    } else {
      toast.success('Class created successfully');
      setShowCreateClass(false);
      setNewClassName('');
      setNewClassDescription('');
      fetchStats();
    }
  };

  const fetchPendingParents = async () => {
    const { count } = await supabase
      .from('parent_children')
      .select('*', { count: 'exact', head: true })
      .eq('verified', false);
    setPendingParents(count || 0);
  };

  const fetchStats = async () => {
    const [studentsResult, teachersResult, tasksResult, classesResult] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'student'),
      supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'teacher'),
      supabase.from('tasks').select('id', { count: 'exact' }).eq('is_active', true),
      supabase.from('classes').select('id', { count: 'exact' }),
    ]);

    setStats({
      students: studentsResult.count || 0,
      teachers: teachersResult.count || 0,
      classes: classesResult.count || 0,
      activeExams: tasksResult.count || 0,
    });
  };

  const fetchSwitchRequests = async () => {
    const { data } = await supabase
      .from('class_switch_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    
    if (data) setSwitchRequests(data);
  };

  const fetchExamSessions = async () => {
    const { data } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('is_active', true);
    
    if (data) setExamSessions(data);
  };

  const handleRequestAction = async (requestId: string, action: 'approved' | 'denied') => {
    if (actionLoading) return; // Prevent double-click
    setActionLoading(requestId);

    const { error } = await supabase
      .from('class_switch_requests')
      .update({ 
        status: action, 
        reviewed_by: user?.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (error) {
      toast.error('Failed to update request');
    } else {
      toast.success(`Request ${action}!`);
      
      if (action === 'approved') {
        const request = switchRequests.find(r => r.id === requestId);
        if (request) {
          await supabase
            .from('profiles')
            .update({ current_class: request.to_class })
            .eq('user_id', request.student_id);
        }
      }
      
      // Optimistic removal
      setSwitchRequests(prev => prev.filter(r => r.id !== requestId));
    }
    setActionLoading(null);
  };

  const handleAddCode = async () => {
    if (!newCode.trim()) return;

    const { error } = await supabase.from('admin_codes').insert({
      code: newCode,
      created_by: user?.id,
      is_active: true,
    });

    if (error) {
      toast.error('Failed to add code');
    } else {
      toast.success('New admin code created!');
      setNewCode('');
      setShowAddCode(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground">System overview and management controls.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isMainAdmin && (
            <>
              <Button variant="outline" className="gap-2" onClick={() => setShowAddCode(true)}>
                <Key className="w-4 h-4" />
                Manage Codes
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setShowLimitDialog(true)}>
                <Shield className="w-4 h-4" />
                Admin Limit ({adminCount}/{maxAdminCount})
              </Button>
            </>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setShowCreateClass(true)}>
            <Plus className="w-4 h-4" />
            Create Class
          </Button>
          <Button className="gap-2" onClick={() => navigate('/dashboard/users')}>
            <UserPlus className="w-4 h-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Add Code Dialog */}
      <Dialog open={showAddCode} onOpenChange={setShowAddCode}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Admin Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Security Code</Label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Enter new admin code"
              />
            </div>
            <Button onClick={handleAddCode} className="w-full" disabled={!newCode.trim()}>
              Add Code
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-secondary/50 to-background cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/dashboard/users')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Students</p>
                <p className="text-2xl font-bold text-foreground">{stats.students}</p>
                <p className="text-xs text-success">Registered</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/50 to-background cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/dashboard/users')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Teachers</p>
                <p className="text-2xl font-bold text-foreground">{stats.teachers}</p>
                <p className="text-xs text-muted-foreground">Active staff</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/50 to-background cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/dashboard/parent-id')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Parent Requests</p>
                <p className="text-2xl font-bold text-foreground">{pendingParents}</p>
                <p className="text-xs text-warning">{pendingParents > 0 ? 'Pending approval' : 'All reviewed'}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <UserCircle className="w-6 h-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/50 to-background cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/dashboard/live')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Live Sessions</p>
                <p className="text-2xl font-bold text-foreground">{examSessions.length}</p>
                <p className="text-xs text-success">Students in exams</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                <Video className="w-6 h-6 text-accent-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/50 to-background cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/dashboard/tasks')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Exams</p>
                <p className="text-2xl font-bold text-foreground">{stats.activeExams}</p>
                <p className="text-xs text-warning">In progress</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <Radio className="w-6 h-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Class Switch Requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Class Switch Requests</CardTitle>
            <Badge variant="outline">{switchRequests.length} pending</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {switchRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No pending requests
              </div>
            ) : (
              switchRequests.map((request) => (
                <div key={request.id} className="p-4 rounded-lg border border-border">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-foreground">{request.student_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Card: {request.student_card || 'N/A'}
                      </p>
                      <p className="text-sm mt-1">
                        <span className="text-muted-foreground">{request.from_class || 'None'}</span>
                        <span className="mx-2">→</span>
                        <span className="text-primary font-medium">{request.to_class}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-success border-success hover:bg-success/10"
                        disabled={actionLoading === request.id}
                        onClick={() => handleRequestAction(request.id, 'approved')}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive hover:bg-destructive/10"
                        disabled={actionLoading === request.id}
                        onClick={() => handleRequestAction(request.id, 'denied')}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Live Monitoring Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Radio className="w-5 h-5 text-success animate-pulse" />
              Live Monitoring
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/live')}>
              View All
            </Button>
          </CardHeader>
          <CardContent>
            {examSessions.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No active exam sessions</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Students will appear here when they start exams
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {examSessions.slice(0, 9).map((session) => (
                  <div
                    key={session.id}
                    className={`aspect-video rounded-lg border flex items-center justify-center ${
                      session.warnings > 0 
                        ? 'border-destructive bg-destructive/5' 
                        : 'border-border bg-muted'
                    }`}
                  >
                    <Video className="w-6 h-6 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Admin Limit Dialog */}
      <Dialog open={showLimitDialog} onOpenChange={setShowLimitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin Account Limit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Current admins: <strong>{adminCount}</strong> / {maxAdminCount}
            </p>
            <p className="text-sm text-muted-foreground">
              Only the first 2 registered admins (main admins) can change this limit and manage security codes.
            </p>
            <div>
              <Label>Maximum Admin Accounts</Label>
              <Input
                type="number"
                min={adminCount}
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
              />
            </div>
            <Button onClick={handleUpdateLimit} className="w-full">
              Update Limit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Class Dialog */}
      <Dialog open={showCreateClass} onOpenChange={setShowCreateClass}>
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

      {/* Collaboration & Communication */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Collaboration & Communication</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="meetings" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="meetings"><Video className="w-4 h-4 mr-2" />Meetings</TabsTrigger>
              <TabsTrigger value="live"><Radio className="w-4 h-4 mr-2" />Live Events</TabsTrigger>
              <TabsTrigger value="announce"><Megaphone className="w-4 h-4 mr-2" />Announcements</TabsTrigger>
              <TabsTrigger value="examsec"><Shield className="w-4 h-4 mr-2" />Exam Security</TabsTrigger>
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
            <TabsContent value="examsec" className="mt-4">
              <Suspense fallback={<div className="h-32" />}><ExamSecurityConfigModule /></Suspense>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="border-warning/50 bg-warning/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-foreground">Admin Security Notice</h4>
              <p className="text-sm text-muted-foreground mt-1">
                {isMainAdmin
                  ? `You are a Main Admin. You can manage security codes and admin limits. Current: ${adminCount}/${maxAdminCount} admin slots used.`
                  : `You are a Sub-Admin. Code management and admin limits are restricted to main admins (first 2 registered). Current: ${adminCount}/${maxAdminCount} admin slots used.`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
