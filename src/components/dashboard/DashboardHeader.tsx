import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveClass } from '@/contexts/ActiveClassContext';
import { AnnouncementPanel } from '@/components/dashboard/AnnouncementPanel';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { ArrowLeftRight, ChevronDown, Bell, Loader2, User, HelpCircle, LogOut, School, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ProfileEditor } from '@/components/profile/ProfileEditor';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export const DashboardHeader = () => {
  const { profile, role, signOut, user } = useAuth();
  const { activeClass, setActiveClass, classes: availableClasses, isLoadingClasses } = useActiveClass();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showSwitchClass, setShowSwitchClass] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);

  const isStaff = role === 'teacher' || role === 'admin';

  useEffect(() => {
    if (user?.id) {
      fetchNotifications();

      const channel = supabase
        .channel('notifications')
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications(prev => [newNotification, ...prev]);
          toast(newNotification.title, { description: newNotification.message });
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id]);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user?.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (data) setNotifications(data);
  };

  const markAsRead = async (notificationId: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
    
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const handleClassSwitchRequest = async () => {
    if (!newClassName.trim() || !user?.id) return;

    setIsSubmitting(true);
    
    const { error } = await supabase.from('class_switch_requests').insert({
      student_id: user.id,
      from_class: profile?.current_class,
      to_class: newClassName,
      student_name: profile?.full_name || 'Unknown',
      student_card: profile?.student_card,
      status: 'pending',
    });

    if (error) {
      toast.error('Failed to submit request');
    } else {
      toast.success('Class switch request submitted! Waiting for admin approval.');
      setShowSwitchClass(false);
      setNewClassName('');
    }
    
    setIsSubmitting(false);
  };

  const handleSignOut = useCallback(async () => {
    await signOut();
    navigate('/');
  }, [signOut, navigate]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            
            {/* Active Class Selector for Teacher/Admin */}
            {(role === 'teacher' || role === 'admin') && (
              <div className="flex items-center gap-2">
                <School className="w-4 h-4 text-primary hidden sm:block" />
                <Select value={activeClass} onValueChange={setActiveClass} disabled={isLoadingClasses}>
                  <SelectTrigger className="w-[160px] sm:w-[200px] h-9 text-sm font-medium">
                    <SelectValue placeholder={isLoadingClasses ? 'Loading...' : 'Select Class'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClasses.map(cls => (
                      <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                    ))}
                    {availableClasses.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">No classes available</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Student: show current class with switch option */}
            {role === 'student' && profile?.current_class && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-medium">
                  {profile.current_class}
                </Badge>
                <Dialog open={showSwitchClass} onOpenChange={setShowSwitchClass}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                      <ArrowLeftRight className="w-4 h-4" />
                      <span className="hidden sm:inline">Switch Class</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Request Class Switch</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Current Class</Label>
                        <Input value={profile?.current_class || 'None'} disabled />
                      </div>
                      <div>
                        <Label>New Class</Label>
                        <Input
                          value={newClassName}
                          onChange={(e) => setNewClassName(e.target.value)}
                          placeholder="e.g., L4 SOD B"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Your request will be reviewed by an admin. You'll be notified once it's processed.
                      </p>
                      <Button 
                        onClick={handleClassSwitchRequest} 
                        className="w-full"
                        disabled={!newClassName.trim() || isSubmitting}
                      >
                        {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Submit Request
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageSwitcher compact />

            {/* Announcement Button (Staff Only) */}
            {isStaff && (
              <Button variant="ghost" size="icon" className="relative min-h-11 min-w-11" onClick={() => setShowAnnouncements(true)} aria-label="Open announcements">
                <Megaphone className="w-5 h-5" aria-hidden="true" />
              </Button>
            )}

            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative min-h-11 min-w-11" aria-label={`Notifications${notifications.length ? `, ${notifications.length} unread` : ''}`}>
                  <Bell className="w-5 h-5" aria-hidden="true" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[10px] text-destructive-foreground flex items-center justify-center" aria-hidden="true">
                      {notifications.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No new notifications
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <DropdownMenuItem
                      key={notification.id}
                      className="flex flex-col items-start p-3 cursor-pointer"
                      onSelect={() => markAsRead(notification.id)}
                    >
                      <p className="font-medium text-sm">{notification.title}</p>
                      <p className="text-xs text-muted-foreground">{notification.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(notification.created_at).toLocaleString()}
                      </p>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 pl-2 pr-3">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {profile?.full_name ? getInitials(profile.full_name) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium max-w-[120px] truncate">
                    {profile?.full_name}
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div>
                    <p className="font-medium">{profile?.full_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{role}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setShowProfileEditor(true)} className="gap-2 cursor-pointer">
                  <User className="w-4 h-4" />
                  Profile Settings
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShowHelpDialog(true)} className="gap-2 cursor-pointer">
                  <HelpCircle className="w-4 h-4" />
                  Help & Support
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive gap-2 cursor-pointer" onSelect={handleSignOut}>
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Profile Editor Dialog */}
      <ProfileEditor open={showProfileEditor} onOpenChange={setShowProfileEditor} />

      {/* Help & Support Dialog */}
      <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Help & Support</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted">
              <h4 className="font-medium text-foreground mb-1">Academic Exam System</h4>
              <p className="text-sm text-muted-foreground">
                A comprehensive platform for managing exams, monitoring students in real-time, 
                and generating academic reports.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <HelpCircle className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Having Issues?</p>
                  <p className="text-xs text-muted-foreground">Contact your system administrator for technical support.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Account Problems</p>
                  <p className="text-xs text-muted-foreground">Update your profile from the Profile Settings in the user menu above.</p>
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                World Mission High School — Academic System v1.0
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Announcement Panel */}
      {isStaff && <AnnouncementPanel open={showAnnouncements} onOpenChange={setShowAnnouncements} />}
    </>
  );
};
