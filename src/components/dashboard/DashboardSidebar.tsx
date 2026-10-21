import { useCallback, memo, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveClass } from '@/contexts/ActiveClassContext';
import { useSidebarBadges } from '@/hooks/useSidebarBadges';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Trophy,
  Users,
  History,
  LogOut,
  Trash2,
  Radio,
  ClipboardList,
  GraduationCap,
  BookOpen,
  Shield,
  BarChart3,
  CreditCard,
  FileText,
  UserCircle,
  Activity,
  MessageSquare,
  MessageCircle,
  Video,
  Megaphone,
  ShieldAlert,
} from 'lucide-react';
import schoolLogo from '@/assets/school-logo.png';
import { formatDistanceToNow } from 'date-fns';

interface ClassActivity {
  id: string;
  type: 'task' | 'post' | 'comment';
  title: string;
  time: string;
}

const studentMenuItems = [
  { title: 'Class', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Rank', url: '/dashboard/rank', icon: Trophy },
  { title: 'People', url: '/dashboard/people', icon: Users },
  { title: 'History', url: '/dashboard/history', icon: History },
  { title: 'Meetings', url: '/dashboard/meetings', icon: Video },
  { title: 'Live Events', url: '/dashboard/live-events', icon: Radio },
  { title: 'Announcements', url: '/dashboard/announcements', icon: Megaphone },
];

const teacherMenuItems = [
  { title: 'Classes', url: '/dashboard', icon: GraduationCap },
  { title: 'Live Monitor', url: '/dashboard/live', icon: Radio },
  { title: 'Term & Tasks', url: '/dashboard/term-tasks', icon: ClipboardList },
  { title: 'Grading', url: '/dashboard/grading', icon: FileText },
  { title: 'People', url: '/dashboard/people', icon: Users },
  { title: 'History', url: '/dashboard/history', icon: History },
  { title: 'Messages', url: '/dashboard/messages', icon: MessageCircle },
];

const adminMenuItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Classes', url: '/dashboard/classes', icon: GraduationCap },
  { title: 'Live Monitor', url: '/dashboard/live', icon: Radio },
  { title: 'Users', url: '/dashboard/users', icon: Users },
  { title: 'Parent & ID Card', url: '/dashboard/parent-id', icon: CreditCard },
  { title: 'Term & Tasks', url: '/dashboard/term-tasks', icon: ClipboardList },
  { title: 'Grading', url: '/dashboard/grading', icon: FileText },
  { title: 'Audit Trail', url: '/dashboard/audit', icon: ShieldAlert },
  { title: 'History', url: '/dashboard/history', icon: History },
  { title: 'Reports & Analytics', url: '/dashboard/reports-analytics', icon: BarChart3 },
];


const parentMenuItems = [
  { title: 'Portal', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Announcement', url: '/dashboard/parent-announcements', icon: Radio },
  { title: 'History', url: '/dashboard/parent-history', icon: History },
  { title: 'Messages', url: '/dashboard/messages', icon: MessageCircle },
];

const roleIcons: Record<string, typeof GraduationCap> = {
  student: GraduationCap,
  teacher: BookOpen,
  admin: Shield,
  parent: UserCircle,
};

const activityIcons: Record<string, typeof Activity> = {
  task: ClipboardList,
  post: MessageSquare,
  comment: MessageSquare,
};

// Memoized menu item component for performance
const MenuItem = memo(({ 
  item, 
  isActive,
  badge,
}: { 
  item: { title: string; url: string; icon: typeof LayoutDashboard }; 
  isActive: boolean;
  badge?: number;
}) => (
  <SidebarMenuItem>
    <SidebarMenuButton
      asChild
      isActive={isActive}
      tooltip={badge && badge > 0 ? `${item.title} (${badge} new)` : item.title}
    >
      <Link
        to={item.url}
        className="flex items-center gap-3 relative"
      >
        <span className="relative inline-flex">
          <item.icon className="w-5 h-5" />
          {badge && badge > 0 ? (
            <span
              aria-label={`${badge} new`}
              className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center leading-none animate-pulse"
            >
              {badge > 99 ? '99+' : badge}
            </span>
          ) : null}
        </span>
        <span className="flex-1">{item.title}</span>
        {badge && badge > 0 ? (
          <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-[10px]">
            {badge > 99 ? '99+' : badge}
          </Badge>
        ) : null}
      </Link>
    </SidebarMenuButton>
  </SidebarMenuItem>
));
MenuItem.displayName = 'MenuItem';

// Class activity section for teacher/admin sidebar
const ClassActivitySection = memo(() => {
  const { activeClass } = useActiveClass();
  const { state } = useSidebar();
  const [activities, setActivities] = useState<ClassActivity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeClass) return;
    
    const fetchActivity = async () => {
      setLoading(true);
      
      // Fetch latest tasks, posts, and comments for the active class in parallel
      const [tasksRes, postsRes, commentsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, created_at')
          .eq('class_name', activeClass)
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('class_posts')
          .select('id, content, created_at')
          .eq('class_name', activeClass)
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('comments')
          .select('id, content, created_at, parent_type')
          .eq('parent_type', 'class_post')
          .order('created_at', { ascending: false })
          .limit(3),
      ]);

      const items: ClassActivity[] = [];

      (tasksRes.data || []).forEach(t => {
        items.push({
          id: t.id,
          type: 'task',
          title: t.title,
          time: t.created_at,
        });
      });

      (postsRes.data || []).forEach(p => {
        items.push({
          id: p.id,
          type: 'post',
          title: p.content.substring(0, 40) + (p.content.length > 40 ? '...' : ''),
          time: p.created_at,
        });
      });

      (commentsRes.data || []).forEach(c => {
        items.push({
          id: c.id,
          type: 'comment',
          title: c.content.substring(0, 40) + (c.content.length > 40 ? '...' : ''),
          time: c.created_at,
        });
      });

      // Sort by time descending and take top 5
      items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setActivities(items.slice(0, 5));
      setLoading(false);
    };

    fetchActivity();
  }, [activeClass]);

  if (state === 'collapsed' || !activeClass) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center gap-2 text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider">
        <Activity className="w-3.5 h-3.5" />
        {activeClass} Activity
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="px-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sidebar-primary"></div>
            </div>
          ) : activities.length === 0 ? (
            <p className="text-xs text-sidebar-foreground/50 px-2 py-2">No recent activity</p>
          ) : (
            activities.map((activity) => {
              const Icon = activityIcons[activity.type] || Activity;
              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-2 p-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors"
                >
                  <Icon className="w-3.5 h-3.5 mt-0.5 text-sidebar-foreground/60 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-sidebar-foreground truncate leading-tight">
                      {activity.title}
                    </p>
                    <p className="text-[10px] text-sidebar-foreground/40 leading-tight">
                      {formatDistanceToNow(new Date(activity.time), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0 border-sidebar-border text-sidebar-foreground/50">
                    {activity.type}
                  </Badge>
                </div>
              );
            })
          )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
});
ClassActivitySection.displayName = 'ClassActivitySection';

export const DashboardSidebar = memo(() => {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSidebar();
  const { badges } = useSidebarBadges();

  const menuItems = role === 'student' 
    ? studentMenuItems 
    : role === 'teacher' 
    ? teacherMenuItems 
    : role === 'parent'
    ? parentMenuItems
    : adminMenuItems;

  const RoleIcon = role && roleIcons[role] ? roleIcons[role] : GraduationCap;

  const handleLogout = useCallback(async () => {
    await signOut();
    navigate('/');
  }, [signOut, navigate]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const handleDeleteAccount = useCallback(async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      toast.success('Account permanently deleted');
      await signOut();
      navigate('/');
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }, [signOut, navigate]);

  const isActive = useCallback((path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname === path;
  }, [location.pathname]);

  const badgeFor = useCallback((url: string): number => {
    if (role === 'admin') {
      if (url === '/dashboard/parent-id') return badges.pendingParentLinks;
      if (url === '/dashboard/users') return badges.pendingSwitchRequests;
    }
    if ((role === 'teacher' || role === 'admin' || role === 'parent') && url === '/dashboard/messages') {
      return badges.unreadMessages;
    }
    if (role === 'parent' && url === '/dashboard') {
      return badges.pendingChildLinks;
    }
    return 0;
  }, [role, badges]);

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <img src={schoolLogo} alt="School Logo" className="w-10 h-10 object-contain" />
          {state !== 'collapsed' && (
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-sidebar-foreground truncate">
                World Mission
              </h2>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                High School
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="mt-2">
            <SidebarMenu>
              {menuItems.map((item) => (
                <MenuItem 
                  key={item.title} 
                  item={item} 
                  isActive={isActive(item.url)}
                  badge={badgeFor(item.url)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Class Activity Section removed - now inside Classes view */}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="space-y-2">
          {state !== 'collapsed' && profile && (
            <Link
              to="/dashboard/profile"
              className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/50 mb-3 hover:bg-sidebar-accent transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-sidebar-primary flex items-center justify-center overflow-hidden ring-2 ring-sidebar-border shrink-0">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                ) : (
                  <RoleIcon className="w-4 h-4 text-sidebar-primary-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {profile.full_name}
                </p>
                <p className="text-xs text-sidebar-foreground/60 capitalize">
                  {role}
                </p>
              </div>
            </Link>
          )}
          {state === 'collapsed' && profile && (
            <Link to="/dashboard/profile" className="flex justify-center mb-2">
              <div className="w-9 h-9 rounded-full bg-sidebar-primary flex items-center justify-center overflow-hidden ring-2 ring-sidebar-border">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                ) : (
                  <RoleIcon className="w-4 h-4 text-sidebar-primary-foreground" />
                )}
              </div>
            </Link>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            {state !== 'collapsed' && <span>Logout</span>}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="w-4 h-4" />
            {state !== 'collapsed' && <span>Delete Account</span>}
          </Button>
        </div>
      </SidebarFooter>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This is permanent. Your account, profile and personal data will be
              removed from the database with no recovery. Administrators will be
              notified of this deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteAccount(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Yes, delete forever'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
});
DashboardSidebar.displayName = 'DashboardSidebar';
