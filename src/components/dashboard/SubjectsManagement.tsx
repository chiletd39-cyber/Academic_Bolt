import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveClass } from '@/contexts/ActiveClassContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Plus, Edit, GraduationCap, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Subject {
  id: string;
  name: string;
  code: string | null;
  class_name: string;
  teacher_id: string | null;
  module: string | null;
  level: number | null;
}

interface Term {
  id: string;
  name: string;
  is_active: boolean;
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

interface TeacherProfile {
  user_id: string;
  full_name: string;
  teacher_mcode: string | null;
}

const LEVELS = [3, 4, 5];

export const SubjectsManagement = () => {
  const { user, role } = useAuth();
  const { activeClass } = useActiveClass();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [isSubjectDialogOpen, setIsSubjectDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    class_name: '',
    module: '',
    level: 3,
    teacher_id: '' as string,
  });

  const isAdmin = role === 'admin';
  const canManage = role === 'teacher' || role === 'admin';

  useEffect(() => {
    fetchData();
  }, []);

  // Sync selectedClass with activeClass from header
  useEffect(() => {
    if (activeClass && activeClass !== selectedClass) {
      setSelectedClass(activeClass);
    }
  }, [activeClass]);

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
    const [subjectsRes, termsRes, classesRes, modulesRes, teachersRes] = await Promise.all([
      supabase.from('subjects').select('*').order('name'),
      supabase.from('terms').select('*').order('year', { ascending: false }),
      supabase.from('classes').select('name'),
      supabase.from('modules').select('*').order('name'),
      supabase.from('profiles').select('user_id, full_name, teacher_mcode').eq('role', 'teacher').order('full_name'),
    ]);

    if (subjectsRes.data) setSubjects(subjectsRes.data as Subject[]);
    if (termsRes.data) {
      setTerms(termsRes.data);
      const activeTerm = termsRes.data.find(t => t.is_active);
      if (activeTerm) setSelectedTerm(activeTerm.id);
    }
    if (classesRes.data) setClasses(classesRes.data.map(c => c.name));
    if (modulesRes.data) setModules(modulesRes.data as Module[]);
    if (teachersRes.data) setTeachers(teachersRes.data as TeacherProfile[]);

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

  const handleSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !isAdmin) return;

    if (!formData.module) {
      toast.error('Please select a module');
      return;
    }

    if (!formData.teacher_id) {
      toast.error('Please assign a teacher');
      return;
    }

    const subjectData = {
      name: formData.name,
      code: formData.code || null,
      class_name: formData.class_name,
      module: formData.module,
      level: formData.level,
      teacher_id: formData.teacher_id,
    };

    let error;
    if (editingSubject) {
      ({ error } = await supabase
        .from('subjects')
        .update(subjectData)
        .eq('id', editingSubject.id));
    } else {
      ({ error } = await supabase
        .from('subjects')
        .insert(subjectData));
    }

    if (error) {
      toast.error('Failed to save subject: ' + error.message);
    } else {
      toast.success(editingSubject ? 'Subject updated & teacher assigned' : 'Subject created & teacher assigned');
      setIsSubjectDialogOpen(false);
      setEditingSubject(null);
      setFormData({ name: '', code: '', class_name: '', module: '', level: 3, teacher_id: '' });
      fetchData();
      if (selectedClass) fetchSubjectsForClass();
    }
  };

  const handleDeleteSubject = async (subjectId: string) => {
    if (!isAdmin) return;
    const { error } = await supabase.from('subjects').delete().eq('id', subjectId);
    if (error) {
      toast.error('Failed to delete subject');
    } else {
      toast.success('Subject deleted');
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

    await supabase
      .from('student_scores')
      .delete()
      .eq('subject_id', selectedSubject)
      .eq('term_id', selectedTerm);

    const { error } = await supabase
      .from('student_scores')
      .insert(scoreRecords.filter(r => r.score !== null));

    if (error) {
      toast.error('Failed to save scores');
    } else {
      toast.success('Scores saved successfully');
    }
  };

  const openEditDialog = (subject: Subject) => {
    setEditingSubject(subject);
    setFormData({
      name: subject.name,
      code: subject.code || '',
      class_name: subject.class_name,
      module: subject.module || '',
      level: subject.level || 3,
      teacher_id: subject.teacher_id || '',
    });
    setIsSubjectDialogOpen(true);
  };

  // Filter subjects
  const filteredSubjects = subjects.filter(s => {
    if (filterLevel !== 'all' && s.level !== parseInt(filterLevel)) return false;
    if (filterModule !== 'all' && s.module !== filterModule) return false;
    return true;
  });

  // Filter classes for form
  const filteredClassesForForm = classes.filter(cls => {
    if (formData.module && !cls.includes(formData.module)) return false;
    if (formData.level && !cls.includes(`L${formData.level}`)) return false;
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
            <BookOpen className="w-6 h-6" />
            Subjects & Scores
          </h2>
          <p className="text-muted-foreground">Manage subjects by module and level, record student scores</p>
        </div>
        {isAdmin && (
          <Dialog open={isSubjectDialogOpen} onOpenChange={(open) => {
            setIsSubjectDialogOpen(open);
            if (!open) {
              setEditingSubject(null);
              setFormData({ name: '', code: '', class_name: '', module: '', level: 3, teacher_id: '' });
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
                  <Label>Subject Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Mathematics"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Subject Code (Optional)</Label>
                  <Input
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="e.g., MATH101"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Module *</Label>
                    <Select value={formData.module} onValueChange={(v) => setFormData({ ...formData, module: v, class_name: '' })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select module" />
                      </SelectTrigger>
                      <SelectContent>
                        {modules.map((mod) => (
                          <SelectItem key={mod.id} value={mod.name}>{mod.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Level *</Label>
                    <Select value={String(formData.level)} onValueChange={(v) => setFormData({ ...formData, level: parseInt(v), class_name: '' })}>
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
                  <Label>Class</Label>
                  <Select value={formData.class_name} onValueChange={(v) => setFormData({ ...formData, class_name: v })}>
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
                <div className="space-y-2">
                  <Label>Assign Teacher * (by MCode)</Label>
                  <Select value={formData.teacher_id} onValueChange={(v) => setFormData({ ...formData, teacher_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">No teachers available</div>
                      )}
                      {teachers.map((t) => (
                        <SelectItem key={t.user_id} value={t.user_id}>
                          {t.full_name} {t.teacher_mcode ? `· ${t.teacher_mcode}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The selected teacher will see this subject in their Grading sheet automatically.
                  </p>
                </div>
                <Button type="submit" className="w-full">
                  {editingSubject ? 'Update Subject' : 'Create Subject'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="subjects" className="space-y-4">
        <TabsList>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
          {canManage && <TabsTrigger value="scores">Record Scores</TabsTrigger>}
        </TabsList>

        <TabsContent value="subjects">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Curriculum Subjects
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
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
                    <TableHead>Teacher</TableHead>
                    {isAdmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubjects.map((subject) => {
                    const t = teachers.find(tt => tt.user_id === subject.teacher_id);
                    return (
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
                      <TableCell>
                        {t ? (
                          <div className="text-sm">
                            <div className="font-medium">{t.full_name}</div>
                            {t.teacher_mcode && (
                              <div className="text-xs text-muted-foreground">{t.teacher_mcode}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => openEditDialog(subject)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteSubject(subject.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    );
                  })}
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
