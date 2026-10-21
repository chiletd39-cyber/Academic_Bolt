import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Users,
  Clock,
  GraduationCap,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Megaphone,
  History,
  LayoutDashboard,
  Activity,
  Search,
  CreditCard,
  User,
  UserPlus,
  Send,
  MessageCircle,
  Languages,
} from 'lucide-react';
import { ParentTeacherChat } from './ParentTeacherChat';
import { ParentLanguageProvider, useParentLang } from '@/contexts/ParentLanguageContext';
import { format, subHours, isAfter } from 'date-fns';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface Child {
  id: string;
  user_id: string;
  full_name: string;
  current_class: string | null;
  avatar_url: string | null;
  student_card: string | null;
}

interface ActivityItem {
  id: string;
  type: 'submission' | 'post' | 'session';
  description: string;
  timestamp: string;
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: string | null;
  created_at: string;
}

interface HistoryItem {
  id: string;
  title: string;
  score: number | null;
  max_score: number | null;
  status: string | null;
  submitted_at: string | null;
  task_type: string;
}

interface PerformancePoint {
  label: string;
  score: number;
}

const LEVELS = ['3', '4', '5'];

const ParentDashboardInner = () => {
  const { user } = useAuth();
  const { t, lang, setLang } = useParentLang();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [pendingLinks, setPendingLinks] = useState<{ student_id: string; relationship: string | null }[]>([]);

  // Link child dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [searchType, setSearchType] = useState<'name' | 'card'>('name');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedLinkChild, setSelectedLinkChild] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // Data states
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [performanceData, setPerformanceData] = useState<PerformancePoint[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'portal' | 'announcement' | 'history' | 'messages'>('portal');

  // Realtime subscription for approval
  useEffect(() => {
    if (!user?.id) return;
    fetchChildren();

    const channel = supabase
      .channel(`parent-children-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'parent_children',
        filter: `parent_id=eq.${user.id}`,
      }, () => fetchChildren())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // When child or level changes, reload data
  useEffect(() => {
    if (selectedChild) {
      loadPortalData();
      loadAnnouncements();
      loadHistory();
    }
  }, [selectedChild, selectedLevel]);

  const fetchChildren = async () => {
    if (!user?.id) return;

    const { data: allLinks } = await supabase
      .from('parent_children')
      .select('student_id, verified, relationship')
      .eq('parent_id', user.id);

    if (!allLinks?.length) {
      setPendingLinks([]);
      setChildren([]);
      setIsLoading(false);
      return;
    }

    const verified = allLinks.filter(l => l.verified === true);
    const unverified = allLinks.filter(l => l.verified !== true);
    setPendingLinks(unverified.map(l => ({ student_id: l.student_id, relationship: l.relationship })));

    if (verified.length > 0) {
      // Use SECURITY DEFINER RPC so parents can read their approved children's profiles (RLS-bypassed safely).
      const { data: profiles, error: profErr } = await supabase.rpc('get_my_children');

      if (profErr) {
        console.error('Failed to fetch children profiles:', profErr);
      }

      if (profiles && profiles.length > 0) {
        const kids = (profiles as any[]).map(p => ({
          id: p.user_id,
          user_id: p.user_id,
          full_name: p.full_name,
          current_class: p.current_class,
          avatar_url: p.avatar_url,
          student_card: p.student_card,
        })) as Child[];
        setChildren(kids);
        if (!selectedChild || !kids.find(k => k.user_id === selectedChild.user_id)) {
          setSelectedChild(kids[0]);
          const cls = kids[0]?.current_class || '';
          const detectedLevel = LEVELS.find(l => cls.includes(l));
          setSelectedLevel(detectedLevel || LEVELS[0]);
        }
      } else {
        setChildren([]);
        setSelectedChild(null);
      }
    } else {
      setChildren([]);
      setSelectedChild(null);
    }
    setIsLoading(false);
  };

  const loadPortalData = async () => {
    if (!selectedChild) return;
    const studentId = selectedChild.user_id;
    const oneHourAgo = subHours(new Date(), 1).toISOString();

    // Last 1 hour activity: submissions, exam sessions
    const [submissionsRes, sessionsRes] = await Promise.all([
      supabase.from('task_submissions')
        .select('id, task_id, status, submitted_at, created_at')
        .eq('student_id', studentId)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false }),
      supabase.from('exam_sessions')
        .select('id, task_id, is_active, created_at, warnings')
        .eq('student_id', studentId)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false }),
    ]);

    const activities: ActivityItem[] = [];

    // Get task titles for context
    const allTaskIds = [
      ...(submissionsRes.data?.map(s => s.task_id) || []),
      ...(sessionsRes.data?.map(s => s.task_id) || []),
    ];
    const uniqueTaskIds = [...new Set(allTaskIds)];
    let taskMap = new Map<string, string>();
    if (uniqueTaskIds.length > 0) {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title')
        .in('id', uniqueTaskIds);
      taskMap = new Map(tasks?.map(t => [t.id, t.title]) || []);
    }

    submissionsRes.data?.forEach(s => {
      activities.push({
        id: s.id,
        type: 'submission',
        description: `${s.status === 'submitted' ? 'Submitted' : 'Started'} "${taskMap.get(s.task_id) || 'Task'}"`,
        timestamp: s.submitted_at || s.created_at,
      });
    });

    sessionsRes.data?.forEach(s => {
      activities.push({
        id: s.id,
        type: 'session',
        description: `${s.is_active ? 'Active in' : 'Ended'} exam session "${taskMap.get(s.task_id) || 'Exam'}" ${s.warnings ? `(${s.warnings} warnings)` : ''}`,
        timestamp: s.created_at,
      });
    });

    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setRecentActivity(activities);

    // Performance graph: scores over time
    const { data: scores } = await supabase
      .from('student_scores')
      .select('score, max_score, created_at, subject_id')
      .eq('student_id', studentId)
      .order('created_at', { ascending: true })
      .limit(20);

    if (scores?.length) {
      const perfData = scores.map(s => ({
        label: format(new Date(s.created_at), 'MMM dd'),
        score: s.max_score ? Math.round(((s.score || 0) / s.max_score) * 100) : 0,
      }));
      setPerformanceData(perfData);
    } else {
      setPerformanceData([]);
    }
  };

  const loadAnnouncements = async () => {
    if (!selectedChild) return;

    // Load notifications for this parent + broadcast messages for child's class
    const classFilter = selectedLevel ? `Level ${selectedLevel}` : selectedChild.current_class;

    const [notifRes, broadcastRes] = await Promise.all([
      supabase.from('notifications')
        .select('id, title, message, type, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('broadcast_messages')
        .select('id, message, broadcast_type, created_at, class_name')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const items: Announcement[] = [];

    notifRes.data?.forEach(n => {
      items.push({ id: n.id, title: n.title, message: n.message, type: n.type, created_at: n.created_at });
    });

    broadcastRes.data?.forEach(b => {
      // Show broadcasts relevant to child's class or general
      if (!b.class_name || b.class_name === selectedChild?.current_class || b.class_name.includes(selectedLevel)) {
        items.push({
          id: b.id,
          title: `${b.broadcast_type === 'class' ? 'Class' : 'General'} Broadcast`,
          message: b.message,
          type: 'broadcast',
          created_at: b.created_at,
        });
      }
    });

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setAnnouncements(items);
  };

  const loadHistory = async () => {
    if (!selectedChild) return;

    const { data: submissions } = await supabase
      .from('task_submissions')
      .select('id, task_id, score, status, submitted_at')
      .eq('student_id', selectedChild.user_id)
      .order('submitted_at', { ascending: false })
      .limit(50);

    if (!submissions?.length) {
      setHistoryItems([]);
      return;
    }

    const taskIds = [...new Set(submissions.map(s => s.task_id))];
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, task_type, total_marks, class_name')
      .in('id', taskIds);

    const taskMap = new Map(tasks?.map(t => [t.id, t]) || []);

    const items: HistoryItem[] = submissions.map(s => {
      const task = taskMap.get(s.task_id);
      return {
        id: s.id,
        title: task?.title || 'Unknown',
        score: s.score,
        max_score: task?.total_marks || 100,
        status: s.status,
        submitted_at: s.submitted_at,
        task_type: task?.task_type || 'exam',
      };
    });

    // Filter by level if selected
    if (selectedLevel && tasks) {
      const levelTaskIds = new Set(
        tasks.filter(t => t.class_name.includes(selectedLevel)).map(t => t.id)
      );
      setHistoryItems(items.filter(i => {
        const sub = submissions.find(s => s.id === i.id);
        return sub && levelTaskIds.has(sub.task_id);
      }));
    } else {
      setHistoryItems(items);
    }
  };

  // Search children for linking
  const handleChildSearch = async () => {
    if (searchQuery.length < 2) return;
    setIsSearching(true);
    try {
      const { data, error } = await supabase.rpc('search_students_for_parent', {
        _search: searchQuery,
        _search_by: searchType === 'name' ? 'name' : 'card',
      });
      if (!error) {
        const seen = new Set<string>();
        const unique = (data || []).filter((r: any) => {
          const key = r.student_card || r.user_id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setSearchResults(unique);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendLinkRequest = async () => {
    if (!selectedLinkChild || !user?.id) return;
    setIsSendingRequest(true);
    try {
      // Already linked?
      const { data: existing } = await supabase
        .from('parent_children')
        .select('id')
        .eq('parent_id', user.id)
        .eq('student_id', selectedLinkChild.user_id)
        .maybeSingle();

      if (existing) {
        toast.info('You already have a pending or active link to this child.');
        return;
      }

      // Enforce 2-parent cap up-front for a friendlier message
      const { count: parentCount } = await supabase
        .from('parent_children')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', selectedLinkChild.user_id);

      if ((parentCount ?? 0) >= 2) {
        toast.error('This student already has 2 parents linked. Only 2 are allowed.');
        return;
      }

      const { error } = await supabase.from('parent_children').insert({
        parent_id: user.id,
        student_id: selectedLinkChild.user_id,
        verified: false,
      });

      if (error) {
        const msg = /maximum of 2 parents/i.test(error.message)
          ? 'This student already has 2 parents linked.'
          : `Failed to send request: ${error.message}`;
        toast.error(msg);
      } else {
        toast.success(`Link request for ${selectedLinkChild.full_name} sent to admin for approval!`);
        setLinkDialogOpen(false);
        setSearchQuery('');
        setSearchResults([]);
        setSelectedLinkChild(null);
        fetchChildren();
      }
    } finally {
      setIsSendingRequest(false);
    }
  };

  // Computed stats
  const avgScore = useMemo(() => {
    if (!performanceData.length) return 0;
    return Math.round(performanceData.reduce((s, p) => s + p.score, 0) / performanceData.length);
  }, [performanceData]);

  // Link Child Dialog component
  const LinkChildDialog = () => (
    <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          Send Request to Link Child
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Find Your Child
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={searchType === 'name' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setSearchType('name'); setSearchQuery(''); setSearchResults([]); }}
              className="flex-1"
            >
              <User className="h-4 w-4 mr-2" />
              By Name
            </Button>
            <Button
              variant={searchType === 'card' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setSearchType('card'); setSearchQuery(''); setSearchResults([]); }}
              className="flex-1"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              By Student Card
            </Button>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchType === 'name' ? "Child's name..." : "Student card..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={handleChildSearch} disabled={searchQuery.length < 2 || isSearching}>
              {isSearching ? '...' : 'Search'}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {searchResults.map((s: any) => (
                <Card
                  key={`${s.source}-${s.user_id}`}
                  className={`cursor-pointer transition-all hover:border-primary ${
                    selectedLinkChild?.user_id === s.user_id ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => setSelectedLinkChild(s)}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <GraduationCap className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium text-sm text-foreground">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.current_class && s.current_class}
                        {s.student_card && ` • ID: ${s.student_card}`}
                      </p>
                    </div>
                    {selectedLinkChild?.user_id === s.user_id && (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {selectedLinkChild && (
            <Button
              className="w-full gap-2"
              onClick={handleSendLinkRequest}
              disabled={isSendingRequest}
            >
              <Send className="h-4 w-4" />
              {isSendingRequest ? 'Sending...' : `Send Request for ${selectedLinkChild.full_name}`}
            </Button>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Admin will review and approve your request. Dashboard updates automatically.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // No children linked or pending
  if (children.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t('parent.portal')}</h1>
        {pendingLinks.length > 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Clock className="h-16 w-16 text-warning mb-4 animate-pulse" />
              <h2 className="text-xl font-semibold text-foreground mb-2">{t('parent.awaiting.title')}</h2>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                {t('parent.awaiting.body')}
              </p>
              <Badge variant="secondary" className="text-sm px-4 py-2">
                {pendingLinks.length} {t('parent.pending')}{pendingLinks.length > 1 ? 's' : ''}
              </Badge>
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                {t('parent.listening')}
              </div>
              <div className="mt-6">
                <LinkChildDialog />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">{t('parent.noChildren')}</h2>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                {t('parent.noChildren.body')}
              </p>
              <LinkChildDialog />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with child selector and level selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('parent.portal')}</h1>
          <p className="text-muted-foreground">{t('parent.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Language switcher (parent only) */}
          <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
            <Languages className="h-4 w-4 text-muted-foreground ml-1" />
            <Button
              variant={lang === 'en' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setLang('en')}
            >EN</Button>
            <Button
              variant={lang === 'fr' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setLang('fr')}
            >FR</Button>
          </div>

          {/* Level Selector */}
          <Select value={selectedLevel} onValueChange={setSelectedLevel}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder={t('parent.level')} />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map(level => (
                <SelectItem key={level} value={level}>{t('parent.level')} {level}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Child Selector */}
          {children.length > 1 && (
            <Select
              value={selectedChild?.user_id || ''}
              onValueChange={(val) => {
                const child = children.find(c => c.user_id === val);
                if (child) setSelectedChild(child);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('parent.selectChild')} />
              </SelectTrigger>
              <SelectContent>
                {children.map(child => (
                  <SelectItem key={child.user_id} value={child.user_id}>
                    {child.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Child Info */}
      {selectedChild && (
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              {selectedChild.avatar_url ? (
                <img src={selectedChild.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <GraduationCap className="h-7 w-7 text-primary" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-foreground">{selectedChild.full_name}</h2>
              <div className="flex gap-2 mt-1">
                {selectedChild.current_class && <Badge variant="secondary">{selectedChild.current_class}</Badge>}
                <Badge variant="outline">{t('parent.level')} {selectedLevel}</Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">{t('parent.avgPerf')}</p>
              <p className="text-2xl font-bold text-primary">{avgScore}%</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 flex-wrap border-b border-border pb-2">
        <Button
          variant={activeTab === 'portal' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('portal')}
          className="gap-2"
        >
          <LayoutDashboard className="h-4 w-4" />
          {t('parent.tab.portal')}
        </Button>
        <Button
          variant={activeTab === 'announcement' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('announcement')}
          className="gap-2"
        >
          <Megaphone className="h-4 w-4" />
          {t('parent.tab.announcement')}
        </Button>
        <Button
          variant={activeTab === 'history' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('history')}
          className="gap-2"
        >
          <History className="h-4 w-4" />
          {t('parent.tab.history')}
        </Button>
        <Button
          variant={activeTab === 'messages' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('messages')}
          className="gap-2"
        >
          <MessageCircle className="h-4 w-4" />
          {t('parent.tab.messages')}
        </Button>
      </div>

      {/* Portal Tab */}
      {activeTab === 'portal' && (
        <div className="space-y-6">
          {/* Last 1 Hour Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-primary" />
                {t('parent.activity.title')}
              </CardTitle>
              <CardDescription>{t('parent.activity.sub')}</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>{t('parent.activity.empty')}</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {recentActivity.map(a => (
                    <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        a.type === 'submission' ? 'bg-green-500/10' : 'bg-primary/10'
                      }`}>
                        {a.type === 'submission' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <Activity className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{a.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(a.timestamp), 'hh:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Performance Analysis Graph */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
                {t('parent.perf.title')}
              </CardTitle>
              <CardDescription>{t('parent.perf.sub')}</CardDescription>
            </CardHeader>
            <CardContent>
              {performanceData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>{t('parent.perf.empty')}</p>
                </div>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={performanceData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="perfGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                      <XAxis dataKey="label" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px',
                          color: 'hsl(var(--foreground))',
                          boxShadow: '0 8px 24px hsl(var(--primary) / 0.15)',
                        }}
                        formatter={(value: number) => [`${value}%`, 'Score']}
                      />
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="hsl(var(--primary))"
                        strokeWidth={3}
                        fill="url(#perfGradient)"
                        dot={{ fill: 'hsl(var(--background))', stroke: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 7, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Announcement Tab */}
      {activeTab === 'announcement' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="h-5 w-5 text-primary" />
              {t('parent.ann.title')}
            </CardTitle>
            <CardDescription>{t('parent.ann.sub')}</CardDescription>
          </CardHeader>
          <CardContent>
            {announcements.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>{t('parent.ann.empty')}</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {announcements.map(a => (
                  <div key={a.id} className="p-4 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-foreground text-sm">{a.title}</h3>
                      <Badge variant={a.type === 'broadcast' ? 'secondary' : 'outline'} className="text-xs">
                        {a.type === 'broadcast' ? 'Broadcast' : a.type || 'Info'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{a.message}</p>
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      {format(new Date(a.created_at), 'MMM dd, yyyy · hh:mm a')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-primary" />
              {t('parent.history.title')}
            </CardTitle>
            <CardDescription>{t('parent.history.sub')}</CardDescription>
          </CardHeader>
          <CardContent>
            {historyItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>{t('parent.history.empty')} {selectedLevel}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {historyItems.map(h => (
                  <div key={h.id} className="flex items-center gap-4 p-3 rounded-lg border border-border">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                      h.status === 'submitted' ? 'bg-green-500/10' : 'bg-yellow-500/10'
                    }`}>
                      {h.status === 'submitted' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{h.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-xs">{h.task_type}</Badge>
                        {h.submitted_at && (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(h.submitted_at), 'MMM dd, yyyy')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {h.score !== null ? (
                        <p className="font-bold text-foreground">
                          {h.score}<span className="text-muted-foreground text-sm">/{h.max_score}</span>
                        </p>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          {h.status === 'in_progress' ? 'In Progress' : h.status || 'Pending'}
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
      {/* Messages Tab */}
      {activeTab === 'messages' && (
        <ParentTeacherChat />
      )}
    </div>
  );
};

export const ParentDashboard = () => (
  <ParentLanguageProvider>
    <ParentDashboardInner />
  </ParentLanguageProvider>
);
