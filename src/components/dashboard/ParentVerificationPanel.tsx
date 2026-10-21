import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  Check, 
  X, 
  Clock,
  GraduationCap,
  UserCircle,
  Mail,
  Phone,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ParentLink {
  id: string;
  parent_id: string;
  student_id: string;
  verified: boolean;
  relationship: string | null;
  created_at: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  student_name: string;
  student_class: string | null;
  student_card: string | null;
}

export const ParentVerificationPanel = () => {
  const [links, setLinks] = useState<ParentLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'verified' | 'all'>('pending');

  useEffect(() => {
    fetchLinks();
  }, [filter]);

  const fetchLinks = async () => {
    setIsLoading(true);
    
    let query = supabase
      .from('parent_children')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter === 'pending') {
      query = query.eq('verified', false);
    } else if (filter === 'verified') {
      query = query.eq('verified', true);
    }

    const { data, error } = await query;

    if (error) {
      toast.error('Failed to load parent links');
      setIsLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setLinks([]);
      setIsLoading(false);
      return;
    }

    // Fetch parent and student profiles
    const parentIds = data.map(d => d.parent_id);
    const studentIds = data.map(d => d.student_id);

    const [{ data: parents }, { data: students }] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name, phone').in('user_id', parentIds),
      supabase.from('profiles').select('user_id, full_name, current_class, student_card').in('user_id', studentIds),
    ]);

    // Fetch parent emails from auth (via profiles user_id)
    const { data: authData } = await supabase.auth.admin?.listUsers?.() || { data: null };

    const parentMap = new Map(parents?.map(p => [p.user_id, p]) || []);
    const studentMap = new Map(students?.map(s => [s.user_id, s]) || []);

    const enrichedLinks: ParentLink[] = data.map(link => {
      const parent = parentMap.get(link.parent_id);
      const student = studentMap.get(link.student_id);
      
      return {
        id: link.id,
        parent_id: link.parent_id,
        student_id: link.student_id,
        verified: link.verified || false,
        relationship: link.relationship,
        created_at: link.created_at,
        parent_name: parent?.full_name || 'Unknown Parent',
        parent_email: '', // Would need to fetch from auth
        parent_phone: parent?.phone || null,
        student_name: student?.full_name || 'Unknown Student',
        student_class: student?.current_class || null,
        student_card: student?.student_card || null,
      };
    });

    setLinks(enrichedLinks);
    setIsLoading(false);
  };

  const handleVerify = async (linkId: string) => {
    const link = links.find(l => l.id === linkId);
    if (!link) {
      toast.error('Link not found, refreshing…');
      fetchLinks();
      return;
    }

    // Pre-flight: enforce 2-parent cap (gives a clear message before DB trigger fires)
    const { count: verifiedCount, error: countErr } = await supabase
      .from('parent_children')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', link.student_id)
      .eq('verified', true);

    if (countErr) {
      toast.error(`Failed to verify link: ${countErr.message}`);
      return;
    }
    if ((verifiedCount ?? 0) >= 2) {
      toast.error('This student already has 2 verified parents. Revoke one to approve this request.');
      return;
    }

    const { data, error } = await supabase
      .from('parent_children')
      .update({ verified: true })
      .eq('id', linkId)
      .select('id');

    if (error) {
      toast.error(`Failed to verify link: ${error.message}`);
      console.error('[ParentVerify] update error', error);
      return;
    }
    if (!data || data.length === 0) {
      toast.error('Verification did not apply — your account may lack admin permission.');
      return;
    }

    toast.success('Parent-child link verified');
    fetchLinks();
  };

  const handleReject = async (linkId: string) => {
    const { error } = await supabase
      .from('parent_children')
      .delete()
      .eq('id', linkId);

    if (error) {
      toast.error('Failed to reject link');
      return;
    }

    toast.success('Parent-child link rejected and removed');
    fetchLinks();
  };

  const handleRevoke = async (linkId: string) => {
    const { error } = await supabase
      .from('parent_children')
      .update({ verified: false })
      .eq('id', linkId);

    if (error) {
      toast.error('Failed to revoke verification');
      return;
    }

    toast.success('Verification revoked');
    fetchLinks();
  };

  const pendingCount = links.filter(l => !l.verified).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Parent Verification</h1>
          <p className="text-muted-foreground">Manage parent-child link requests</p>
        </div>
        <Button variant="outline" onClick={fetchLinks} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('pending')}
          className="gap-2"
        >
          <Clock className="h-4 w-4" />
          Pending
          {pendingCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {pendingCount}
            </Badge>
          )}
        </Button>
        <Button
          variant={filter === 'verified' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('verified')}
        >
          <Check className="h-4 w-4 mr-1" />
          Verified
        </Button>
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : links.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {filter === 'pending' ? 'No Pending Requests' : 'No Links Found'}
            </h2>
            <p className="text-muted-foreground text-center">
              {filter === 'pending' 
                ? 'All parent-child link requests have been reviewed.'
                : 'No parent-child links in the system yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {links.map(link => (
            <Card key={link.id} className={!link.verified ? 'border-yellow-500/50' : ''}>
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Parent Info */}
                  <div className="flex items-center gap-3 flex-1">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserCircle className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{link.parent_name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {link.parent_phone && (
                          <>
                            <Phone className="h-3 w-3" />
                            <span>{link.parent_phone}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="hidden lg:block text-muted-foreground">→</div>

                  {/* Student Info */}
                  <div className="flex items-center gap-3 flex-1">
                    <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                      <GraduationCap className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{link.student_name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {link.student_class && <span>{link.student_class}</span>}
                        {link.student_card && (
                          <>
                            <span>•</span>
                            <span>ID: {link.student_card}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status & Actions */}
                  <div className="flex items-center gap-2 lg:justify-end">
                    <div className="text-right mr-4 hidden sm:block">
                      <p className="text-xs text-muted-foreground">
                        Requested {format(new Date(link.created_at), 'PP')}
                      </p>
                      <Badge variant={link.verified ? 'default' : 'secondary'}>
                        {link.verified ? 'Verified' : 'Pending'}
                      </Badge>
                    </div>
                    
                    {!link.verified ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleVerify(link.id)}
                          className="gap-1"
                        >
                          <Check className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(link.id)}
                          className="gap-1"
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRevoke(link.id)}
                        className="gap-1 text-destructive hover:text-destructive"
                      >
                        <AlertTriangle className="h-4 w-4" />
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
