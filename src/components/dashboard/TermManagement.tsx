import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Plus, Play, Square, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Term {
  id: string;
  name: string;
  term_number: number;
  year: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

export const TermManagement = () => {
  const { user, role } = useAuth();
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    term_number: 1,
    year: new Date().getFullYear(),
    starts_at: '',
    ends_at: '',
  });

  const canManage = role === 'teacher' || role === 'admin';

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    const { data, error } = await supabase
      .from('terms')
      .select('*')
      .order('year', { ascending: false })
      .order('term_number', { ascending: false });

    if (data && !error) {
      setTerms(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    const termData = {
      name: formData.name || `Term ${formData.term_number} - ${formData.year}`,
      term_number: formData.term_number,
      year: formData.year,
      starts_at: formData.starts_at || null,
      ends_at: formData.ends_at || null,
      created_by: user.id,
    };

    let error;
    if (editingTerm) {
      ({ error } = await supabase
        .from('terms')
        .update(termData)
        .eq('id', editingTerm.id));
    } else {
      ({ error } = await supabase
        .from('terms')
        .insert(termData));
    }

    if (error) {
      toast.error('Failed to save term');
    } else {
      toast.success(editingTerm ? 'Term updated' : 'Term created');
      setIsDialogOpen(false);
      setEditingTerm(null);
      setFormData({ name: '', term_number: 1, year: new Date().getFullYear(), starts_at: '', ends_at: '' });
      fetchTerms();
    }
  };

  const handleStartTerm = async (termId: string) => {
    // First deactivate all other terms
    await supabase
      .from('terms')
      .update({ is_active: false })
      .neq('id', termId);

    // Then activate this term
    const { error } = await supabase
      .from('terms')
      .update({ 
        is_active: true,
        starts_at: new Date().toISOString()
      })
      .eq('id', termId);

    if (error) {
      toast.error('Failed to start term');
    } else {
      toast.success('Term started successfully');
      fetchTerms();
    }
  };

  const handleEndTerm = async (termId: string) => {
    const { error } = await supabase
      .from('terms')
      .update({ 
        is_active: false,
        ends_at: new Date().toISOString()
      })
      .eq('id', termId);

    if (error) {
      toast.error('Failed to end term');
    } else {
      toast.success('Term ended and archived');
      fetchTerms();
    }
  };

  const openEditDialog = (term: Term) => {
    setEditingTerm(term);
    setFormData({
      name: term.name,
      term_number: term.term_number,
      year: term.year,
      starts_at: term.starts_at ? term.starts_at.split('T')[0] : '',
      ends_at: term.ends_at ? term.ends_at.split('T')[0] : '',
    });
    setIsDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Term Management
          </h2>
          <p className="text-muted-foreground">Create and manage academic terms</p>
        </div>
        {canManage && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingTerm(null);
              setFormData({ name: '', term_number: 1, year: new Date().getFullYear(), starts_at: '', ends_at: '' });
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Term
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingTerm ? 'Edit Term' : 'Create New Term'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Term Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., First Term 2026"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Term Number</Label>
                    <Input
                      type="number"
                      min="1"
                      max="4"
                      value={formData.term_number}
                      onChange={(e) => setFormData({ ...formData, term_number: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Input
                      type="number"
                      min="2020"
                      max="2100"
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date (Optional)</Label>
                    <Input
                      type="date"
                      value={formData.starts_at}
                      onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date (Optional)</Label>
                    <Input
                      type="date"
                      value={formData.ends_at}
                      onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  {editingTerm ? 'Update Term' : 'Create Term'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Active Term Highlight */}
      {terms.find(t => t.is_active) && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/20">
                  <Play className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Active Term</p>
                  <p className="text-lg font-bold text-primary">
                    {terms.find(t => t.is_active)?.name}
                  </p>
                </div>
              </div>
              {canManage && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => handleEndTerm(terms.find(t => t.is_active)!.id)}
                >
                  <Square className="w-4 h-4 mr-2" />
                  End Term
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Terms Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Terms</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Term #</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {terms.map((term) => (
                <TableRow key={term.id}>
                  <TableCell className="font-medium">{term.name}</TableCell>
                  <TableCell>{term.term_number}</TableCell>
                  <TableCell>{term.year}</TableCell>
                  <TableCell>
                    {term.starts_at ? format(new Date(term.starts_at), 'MMM dd, yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                    {term.ends_at ? format(new Date(term.ends_at), 'MMM dd, yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                    {term.is_active ? (
                      <Badge className="bg-primary/20 text-primary border-primary/30">Active</Badge>
                    ) : term.ends_at ? (
                      <Badge variant="secondary">Archived</Badge>
                    ) : (
                      <Badge variant="outline">Draft</Badge>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {!term.is_active && !term.ends_at && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleStartTerm(term.id)}
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
                        {term.is_active && (
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => handleEndTerm(term.id)}
                          >
                            <Square className="w-4 h-4" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => openEditDialog(term)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {terms.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No terms created yet. Create your first term to get started.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
