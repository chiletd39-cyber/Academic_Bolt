import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Plus, Play, Square, Edit, BookOpen, GraduationCap, Save, Trash2 } from 'lucide-react';
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

interface Subject {
  id: string;
  name: string;
  code: string | null;
  class_name: string;
  teacher_id: string | null;
  module: string | null;
  level: number | null;
}

interface Module {
  id: string;
  name: string;
  full_name: string;
}

interface StudentProfile {
  user_id: string;
  full_name: string;
  student_card: string | null;
  current_class: string | null;
}

const LEVELS = [3, 4, 5];

export const TermAndSubjects = () => {
  const { user, role } = useAuth();
  const [terms, setTerms] = useState<Term[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [isTermDialogOpen, setIsTermDialogOpen] = useState(false);
  const [isSubjectDialogOpen, setIsSubjectDialogOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [termFormData, setTermFormData] = useState({
    name: '',
    term_number: 1,
    year: new Date().getFullYear(),
    starts_at: '',
    ends_at: '',
  });
  const [subjectFormData, setSubjectFormData] = useState({
    name: '',
    code: '',
    class_name: '',
    module: '',
    level: 3,
  });

  const isAdmin = role === 'admin';
  const canManage = role === 'teacher' || role === 'admin';

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      fetchStudents();
      fetchSubjectsForClass();
    }
  }, [selectedClass]);

  useEffect(() => {
    if (selectedSubject && selectedTerm && students.length > 0) {
      fetchScores();
    }
  }, [selectedSubject, selectedTerm, students]);

  const fetchData = async () => {
    const [termsRes, subjectsRes, classesRes, modulesRes] = await Promise.all([
      supabase.from('terms').select('*').order('year', { ascending: false }).order('term_number', { ascending: false }),
      supabase.from('subjects').select('*').order('name'),
      supabase.from('classes').select('name'),
      supabase.from('modules').select('*').order('name'),
    ]);

    if (termsRes.data) {
      setTerms(termsRes.data);
      const activeTerm = termsRes.data.find(t => t.is_active);
      if (activeTerm) setSelectedTerm(activeTerm.id);
    }
    if (subjectsRes.data) {
      setSubjects(subjectsRes.data as Subject[]);
      setAllSubjects(subjectsRes.data as Subject[]);
    }
    if (classesRes.data) setClasses(classesRes.data.map(c => c.name));
    if (modulesRes.data) setModules(modulesRes.data as Module[]);
    
    setLoading(false);
  };

  const fetchSubjectsForClass = async () => {
    const { data } = await supabase
      .from('subjects')
      .select('*')
      .eq('class_name', selectedClass)
      .order('name');
    
    if (data) setSubjects(data as Subject[]);
  };

  const fetchStudents = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('user_id, full_name, student_card, current_class')
      .eq('current_class', selectedClass)
      .eq('role', 'student')
      .order('full_name');
    
    if (data) setStudents(data);
  };

  const fetchScores = async () => {
    const { data } = await supabase
      .from('student_scores')
      .select('*')
      .eq('subject_id', selectedSubject)
      .eq('term_id', selectedTerm);
    
    const scoreMap: Record<string, number | null> = {};
    data?.forEach(score => {
      scoreMap[score.student_id] = score.score;
    });
    setScores(scoreMap);
  };

  const handleTermSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    const termData = {
      name: termFormData.name || `Term ${termFormData.term_number} - ${termFormData.year}`,
      term_number: termFormData.term_number,
      year: termFormData.year,
      starts_at: termFormData.starts_at || null,
      ends_at: termFormData.ends_at || null,
      created_by: user.id,
    };

    let error;
    if (editingTerm) {
      ({ error } = await supabase.from('terms').update(termData).eq('id', editingTerm.id));
    } else {
      ({ error } = await supabase.from('terms').insert(termData));
    }

    if (error) {
      toast.error('Failed to save term');
    } else {
      toast.success(editingTerm ? 'Term updated' : 'Term created');
      setIsTermDialogOpen(false);
      setEditingTerm(null);
      setTermFormData({ name: '', term_number: 1, year: new Date().getFullYear(), starts_at: '', ends_at: '' });
      fetchData();
    }
  };

  const handleSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !isAdmin) return;

    if (!subjectFormData.name.trim()) {
      toast.error('Subject name is required');
      return;
    }
    if (!subjectFormData.class_name) {
      toast.error('Please select a class');
      return;
    }
    if (!subjectFormData.module) {
      toast.error('Please select a module');
      return;
    }

    const subjectData = {
      name: subjectFormData.name,
      code: subjectFormData.code || null,
      class_name: subjectFormData.class_name,
      module: subjectFormData.module,
      level: subjectFormData.level,
      teacher_id: user.id,
    };

    let error;
    if (editingSubject) {
      ({ error } = await supabase.from('subjects').update(subjectData).eq('id', editingSubject.id));
    } else {
      ({ error } = await supabase.from('subjects').insert(subjectData));
    }

    if (error) {
      toast.error('Failed to save subject: ' + error.message);
    } else {
      toast.success(editingSubject ? 'Subject updated' : 'Subject created');
      setIsSubjectDialogOpen(false);
      setEditingSubject(null);
      setSubjectFormData({ name: '', code: '', class_name: '', module: '', level: 3 });
      fetchData();
      if (selectedClass) fetchSubjectsForClass();
    }
  };

  const handleDeleteSubject = async (subjectId: string, subjectName: string) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete subject "${subjectName}"? All recorded scores for this subject will be removed. This cannot be undone.`)) return;
    const { error } = await supabase.from('subjects').delete().eq('id', subjectId);
    if (error) {
      toast.error('Failed to delete subject: ' + error.message);
    } else {
      toast.success('Subject deleted');
      fetchData();
    }
  };

  const handleDeleteTerm = async (termId: string, termName: string) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete term "${termName}"? All scores recorded under this term will be removed. This cannot be undone.`)) return;
    const { error } = await supabase.from('terms').delete().eq('id', termId);
    if (error) {
      toast.error('Failed to delete term: ' + error.message);
    } else {
      toast.success('Term deleted');
      fetchData();
    }
  };

  const handleStartTerm = async (termId: string) => {
    await supabase.from('terms').update({ is_active: false }).neq('id', termId);
    const { error } = await supabase.from('terms').update({ 
      is_active: true,
      starts_at: new Date().toISOString()
    }).eq('id', termId);

    if (error) {
      toast.error('Failed to start term');
    } else {
      toast.success('Term started successfully');
      fetchData();
    }
  };

  const handleEndTerm = async (termId: string) => {
    const { error } = await supabase.from('terms').update({ 
      is_active: false,
      ends_at: new Date().toISOString()
    }).eq('id', termId);

    if (error) {
      toast.error('Failed to end term');
    } else {
      toast.success('Term ended and archived');
      fetchData();
    }
  };

  const handleScoreChange = (studentId: string, value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    setScores(prev => ({ ...prev, [studentId]: numValue }));
  };

  const saveScores = async () => {
    if (!selectedSubject || !selectedTerm) return;

    const scoreRecords = students.map(student => ({
      student_id: student.user_id,
      subject_id: selectedSubject,
      term_id: selectedTerm,
      score: scores[student.user_id] ?? null,
      max_score: 100,
      score_type: 'exam',
    }));

    await supabase.from('student_scores').delete().eq('subject_id', selectedSubject).eq('term_id', selectedTerm);
    const { error } = await supabase.from('student_scores').insert(scoreRecords.filter(r => r.score !== null));

    if (error) {
      toast.error('Failed to save scores');
    } else {
      toast.success('Scores saved successfully');
    }
  };

  const openEditTerm = (term: Term) => {
    setEditingTerm(term);
    setTermFormData({
      name: term.name,
      term_number: term.term_number,
      year: term.year,
      starts_at: term.starts_at ? term.starts_at.split('T')[0] : '',
      ends_at: term.ends_at ? term.ends_at.split('T')[0] : '',
    });
    setIsTermDialogOpen(true);
  };

  const openEditSubject = (subject: Subject) => {
    setEditingSubject(subject);
    setSubjectFormData({
      name: subject.name,
      code: subject.code || '',
      class_name: subject.class_name,
      module: subject.module || '',
      level: subject.level || 3,
    });
    setIsSubjectDialogOpen(true);
  };

  // Filter subjects by level and module
  const filteredSubjects = allSubjects.filter(s => {
    if (filterLevel !== 'all' && s.level !== parseInt(filterLevel)) return false;
    if (filterModule !== 'all' && s.module !== filterModule) return false;
    return true;
  });

  // Get unique subjects (deduplicate by name+module+level)
  const uniqueSubjects = filteredSubjects.reduce((acc, s) => {
    const key = `${s.name}-${s.module}-${s.level}`;
    if (!acc.find(x => `${x.name}-${x.module}-${x.level}` === key)) {
      acc.push(s);
    }
    return acc;
  }, [] as Subject[]);

  // Filter classes based on selected module/level for the form
  const filteredClassesForForm = classes.filter(cls => {
    if (subjectFormData.module && !cls.includes(subjectFormData.module)) return false;
    if (subjectFormData.level && !cls.includes(`L${subjectFormData.level}`)) return false;
    return true;
  });

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
            Term & Subjects
          </h2>
          <p className="text-muted-foreground">Manage academic terms, subjects, and scores</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Dialog open={isTermDialogOpen} onOpenChange={(open) => {
              setIsTermDialogOpen(open);
              if (!open) {
                setEditingTerm(null);
                setTermFormData({ name: '', term_number: 1, year: new Date().getFullYear(), starts_at: '', ends_at: '' });
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  New Term
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingTerm ? 'Edit Term' : 'Create New Term'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleTermSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Term Name</Label>
                    <Input
                      value={termFormData.name}
                      onChange={(e) => setTermFormData({ ...termFormData, name: e.target.value })}
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
                        value={termFormData.term_number}
                        onChange={(e) => setTermFormData({ ...termFormData, term_number: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Year</Label>
                      <Input
                        type="number"
                        min="2020"
                        max="2100"
                        value={termFormData.year}
                        onChange={(e) => setTermFormData({ ...termFormData, year: parseInt(e.target.value) || new Date().getFullYear() })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date (Optional)</Label>
                      <Input
                        type="date"
                        value={termFormData.starts_at}
                        onChange={(e) => setTermFormData({ ...termFormData, starts_at: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date (Optional)</Label>
                      <Input
                        type="date"
                        value={termFormData.ends_at}
                        onChange={(e) => setTermFormData({ ...termFormData, ends_at: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full">
                    {editingTerm ? 'Update Term' : 'Create Term'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            {isAdmin && (
              <Dialog open={isSubjectDialogOpen} onOpenChange={(open) => {
                setIsSubjectDialogOpen(open);
                if (!open) {
                  setEditingSubject(null);
                  setSubjectFormData({ name: '', code: '', class_name: '', module: '', level: 3 });
                }
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    New Subject
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingSubject ? 'Edit Subject' : 'Create New Subject'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubjectSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Subject Name *</Label>
                      <Input
                        value={subjectFormData.name}
                        onChange={(e) => setSubjectFormData({ ...subjectFormData, name: e.target.value })}
                        placeholder="e.g., Mathematics"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Subject Code (Optional)</Label>
                      <Input
                        value={subjectFormData.code}
                        onChange={(e) => setSubjectFormData({ ...subjectFormData, code: e.target.value })}
                        placeholder="e.g., MATH101"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Module *</Label>
                        <Select value={subjectFormData.module} onValueChange={(v) => setSubjectFormData({ ...subjectFormData, module: v, class_name: '' })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select module" />
                          </SelectTrigger>
                          <SelectContent>
                            {modules.map((mod) => (
                              <SelectItem key={mod.id} value={mod.name}>{mod.name} - {mod.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Level *</Label>
                        <Select value={String(subjectFormData.level)} onValueChange={(v) => setSubjectFormData({ ...subjectFormData, level: parseInt(v), class_name: '' })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select level" />
                          </SelectTrigger>
                          <SelectContent>
                            {LEVELS.map((lvl) => (
                              <SelectItem key={lvl} value={String(lvl)}>Level {lvl}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Class *</Label>
                      <Select value={subjectFormData.class_name} onValueChange={(v) => setSubjectFormData({ ...subjectFormData, class_name: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select class" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredClassesForForm.map((cls) => (
                            <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" className="w-full">
                      {editingSubject ? 'Update Subject' : 'Create Subject'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
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

      <Tabs defaultValue="terms" className="space-y-4">
        <TabsList>
          <TabsTrigger value="terms">Terms</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
          {canManage && <TabsTrigger value="scores">Record Scores</TabsTrigger>}
        </TabsList>

        <TabsContent value="terms">
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
                              <Button variant="outline" size="sm" onClick={() => handleStartTerm(term.id)}>
                                <Play className="w-4 h-4" />
                              </Button>
                            )}
                            {term.is_active && (
                              <Button variant="destructive" size="sm" onClick={() => handleEndTerm(term.id)}>
                                <Square className="w-4 h-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => openEditTerm(term)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            {!term.is_active && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteTerm(term.id, term.name)}
                                title="Delete term permanently"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
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
        </TabsContent>

        <TabsContent value="subjects">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Curriculum Subjects
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Level & Module Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Filter by Level</Label>
                  <Select value={filterLevel} onValueChange={setFilterLevel}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Levels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      {LEVELS.map((lvl) => (
                        <SelectItem key={lvl} value={String(lvl)}>Level {lvl}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Filter by Module</Label>
                  <Select value={filterModule} onValueChange={setFilterModule}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Modules" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Modules</SelectItem>
                      {modules.map((mod) => (
                        <SelectItem key={mod.id} value={mod.name}>{mod.name} - {mod.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Class</TableHead>
                    {isAdmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubjects.map((subject) => (
                    <TableRow key={subject.id}>
                      <TableCell className="font-medium">{subject.name}</TableCell>
                      <TableCell>
                        {subject.code ? (
                          <Badge variant="outline">{subject.code}</Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {subject.module ? (
                          <Badge variant="secondary">{subject.module}</Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {subject.level ? (
                          <Badge className="bg-primary/20 text-primary border-primary/30">L{subject.level}</Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>{subject.class_name}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditSubject(subject)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteSubject(subject.id, subject.name)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredSubjects.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No subjects found for the selected filters.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canManage && (
          <TabsContent value="scores">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5" />
                  Record Student Scores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Select Class</Label>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose class" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((cls) => (
                          <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Select Subject</Label>
                    <Select value={selectedSubject} onValueChange={setSelectedSubject} disabled={!selectedClass}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.filter(s => s.class_name === selectedClass).map((subject) => (
                          <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Select Term</Label>
                    <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose term" />
                      </SelectTrigger>
                      <SelectContent>
                        {terms.map((term) => (
                          <SelectItem key={term.id} value={term.id}>
                            {term.name}
                            {term.is_active && ' (Active)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {selectedClass && selectedSubject && selectedTerm && (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student Name</TableHead>
                          <TableHead>Student Card</TableHead>
                          <TableHead className="w-32">Score (0-100)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map((student) => (
                          <TableRow key={student.user_id}>
                            <TableCell className="font-medium">{student.full_name}</TableCell>
                            <TableCell>{student.student_card || '-'}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={scores[student.user_id] ?? ''}
                                onChange={(e) => handleScoreChange(student.user_id, e.target.value)}
                                className="w-24"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {students.length > 0 && (
                      <div className="flex justify-end">
                        <Button onClick={saveScores}>
                          <Save className="w-4 h-4 mr-2" />
                          Save All Scores
                        </Button>
                      </div>
                    )}

                    {students.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No students in this class.
                      </div>
                    )}
                  </>
                )}

                {(!selectedClass || !selectedSubject || !selectedTerm) && (
                  <div className="text-center py-8 text-muted-foreground">
                    Select a class, subject, and term to record scores.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
