import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SidebarBadges {
  pendingParentLinks: number;       // admin: pending verifications
  pendingSwitchRequests: number;    // admin: pending class switches
  unreadNotifications: number;      // everyone: notifications inbox
  unreadMessages: number;           // teacher/parent: parent_messages
  pendingChildLinks: number;        // parent: own pending requests
}

const EMPTY: SidebarBadges = {
  pendingParentLinks: 0,
  pendingSwitchRequests: 0,
  unreadNotifications: 0,
  unreadMessages: 0,
  pendingChildLinks: 0,
};

export const useSidebarBadges = () => {
  const { user, role } = useAuth();
  const [badges, setBadges] = useState<SidebarBadges>(EMPTY);
  const mounted = useRef(true);

  const fetchAll = useCallback(async () => {
    if (!user?.id || !role) return;

    const tasks: Promise<unknown>[] = [];
    const next: SidebarBadges = { ...EMPTY };

    tasks.push(
      (async () => {
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false);
        next.unreadNotifications = count ?? 0;
      })()
    );

    if (role === 'admin') {
      tasks.push(
        (async () => {
          const { count } = await supabase
            .from('parent_children')
            .select('id', { count: 'exact', head: true })
            .eq('verified', false);
          next.pendingParentLinks = count ?? 0;
        })()
      );
      tasks.push(
        (async () => {
          const { count } = await supabase
            .from('class_switch_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending');
          next.pendingSwitchRequests = count ?? 0;
        })()
      );
    }

    if (role === 'teacher' || role === 'parent' || role === 'admin') {
      tasks.push(
        (async () => {
          const { count } = await supabase
            .from('parent_messages')
            .select('id', { count: 'exact', head: true })
            .eq('receiver_id', user.id)
            .eq('is_read', false);
          next.unreadMessages = count ?? 0;
        })()
      );
    }

    if (role === 'parent') {
      tasks.push(
        (async () => {
          const { count } = await supabase
            .from('parent_children')
            .select('id', { count: 'exact', head: true })
            .eq('parent_id', user.id)
            .eq('verified', false);
          next.pendingChildLinks = count ?? 0;
        })()
      );
    }

    await Promise.all(tasks);
    if (mounted.current) setBadges(next);
  }, [user?.id, role]);

  useEffect(() => {
    mounted.current = true;
    fetchAll();
    return () => { mounted.current = false; };
  }, [fetchAll]);

  // Realtime: refetch on relevant table changes
  useEffect(() => {
    if (!user?.id || !role) return;

    const channel = supabase
      .channel('sidebar-badges-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parent_children' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parent_messages', filter: `receiver_id=eq.${user.id}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_switch_requests' }, fetchAll)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, role, fetchAll]);

  // Periodic safety refresh every 60s
  useEffect(() => {
    const id = window.setInterval(fetchAll, 60_000);
    return () => window.clearInterval(id);
  }, [fetchAll]);

  return { badges, refresh: fetchAll };
};
