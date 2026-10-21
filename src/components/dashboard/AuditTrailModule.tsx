import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldAlert } from 'lucide-react';

export const AuditTrailModule: React.FC = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('all');
  const [resource, setResource] = useState('all');

  useEffect(() => {
    (supabase as any).from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500)
      .then(({ data }: any) => setLogs(data || []));
  }, []);

  const filtered = useMemo(() => logs.filter(l =>
    (!actor || (l.actor_name || '').toLowerCase().includes(actor.toLowerCase())) &&
    (action === 'all' || l.action_type === action) &&
    (resource === 'all' || l.resource_type === resource)
  ), [logs, actor, action, resource]);

  if (user?.role !== 'admin') {
    return <div className="p-6 text-center text-muted-foreground">Admin only.</div>;
  }

  const actions = Array.from(new Set(logs.map(l => l.action_type))).sort();
  const resources = Array.from(new Set(logs.map(l => l.resource_type))).sort();

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold flex items-center gap-2"><ShieldAlert className="h-6 w-6" />Audit trail</h2>
      <Card>
        <CardHeader><CardTitle className="text-sm">Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input placeholder="Actor name…" value={actor} onChange={e => setActor(e.target.value)} />
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={resource} onValueChange={setResource}>
            <SelectTrigger><SelectValue placeholder="Resource" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All resources</SelectItem>
              {resources.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {filtered.length === 0 && <p className="p-4 text-sm text-muted-foreground">No matching entries.</p>}
            {filtered.map(l => (
              <div key={l.id} className="p-3 text-sm flex flex-wrap gap-2 items-center">
                <Badge variant="outline">{l.action_type}</Badge>
                <Badge>{l.resource_type}</Badge>
                <span className="font-medium">{l.actor_name || 'System'}</span>
                <Badge variant="secondary" className="text-[10px]">{l.actor_role || '—'}</Badge>
                {l.target_label && <span className="text-muted-foreground">→ {l.target_label}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
