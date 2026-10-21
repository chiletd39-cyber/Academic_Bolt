import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

export const LiveAnalyticsModule: React.FC = () => {
  const { user } = useAuth();
  const [comments, setComments] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    (supabase as any).from('live_event_comments').select('*').then(({ data }: any) => setComments(data || []));
    (supabase as any).from('live_events').select('*').then(({ data }: any) => setEvents(data || []));
  }, []);

  const byEvent = useMemo(() => {
    const map: Record<string, { event_id: string; count: number; users: Set<string> }> = {};
    comments.forEach(c => {
      if (!map[c.event_id]) map[c.event_id] = { event_id: c.event_id, count: 0, users: new Set() };
      map[c.event_id].count++;
      map[c.event_id].users.add(c.user_id);
    });
    return Object.values(map).map(m => ({
      name: events.find(e => e.id === m.event_id)?.title?.slice(0, 24) || '—',
      comments: m.count, participants: m.users.size,
    }));
  }, [comments, events]);

  const byRole = useMemo(() => {
    const c: Record<string, number> = {};
    comments.forEach(x => { c[x.user_role || 'unknown'] = (c[x.user_role || 'unknown'] || 0) + 1; });
    return Object.entries(c).map(([role, count]) => ({ role, count }));
  }, [comments]);

  if (user?.role !== 'admin') return <div className="p-6 text-muted-foreground text-center">Admin only.</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Live event analytics</h2>
      <div className="grid md:grid-cols-3 gap-3">
        <Card><CardHeader><CardTitle className="text-sm">Total comments</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{comments.length}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Total events</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{events.length}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Unique participants</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{new Set(comments.map(c => c.user_id)).size}</CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Engagement by event</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer><BarChart data={byEvent}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="comments" fill="hsl(var(--primary))" /></BarChart></ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Participation by role</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">{byRole.map(r => <Badge key={r.role} variant="outline">{r.role}: {r.count}</Badge>)}</CardContent>
      </Card>
    </div>
  );
};
