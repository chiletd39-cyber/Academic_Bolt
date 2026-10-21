import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveClass } from '@/contexts/ActiveClassContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, Plus, Calendar, Clock, AlertTriangle, Users, Shield, Camera, Mic, Eye, Monitor, Maximize, MousePointerClick, Upload, FileText, HelpCircle, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { CommentThread } from '@/components/comments/CommentThread';
import { format } from 'date-fns';
import { parseQuestionDocument } from '@/lib/questionImport';
import { StructuredText } from '@/components/exam/StructuredText';

interface Task {
  id: string;
  title: string;
  description: string;
  task_type: string;
  class_name: string;
  duration_minutes: number;
  max_warnings: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  required_fields: any;
  total_marks: number;
  created_at: string;
  questions?: Question[];
  security_settings?: SecuritySettings;
}

interface TaskClass {
  id: string;
  name: string;
}

interface SubjectOption {
  id: string;
  name: string;
  code: string | null;
  class_name: string;
  teacher_id: string | null;
}

interface SecuritySettings {
  webcam: boolean;
  microphone: boolean;
  eyeTracking: boolean;
  screenProtection: boolean;
  fullscreen: boolean;
  tabSwitch: boolean;
  rightClick: boolean;
}

interface Question {
  id: string;
  text: string;
  type: 'multiple_choice' | 'short_answer' | 'essay' | 'true_false';
  options?: string[];
  correctAnswer?: string | number;
  marks: number;
  number?: string;
  section?: string;
  instructions?: string;
  optionLabels?: string[];
  importWarnings?: string[];
}

interface ParsedStudent {
  student_card: string;
  full_name: string;
  class_name?: string;
}

// Question Editor Component
const QuestionEditor = memo(({ 
  questions, 
  onQuestionsChange 
}: { 
  questions: Question[]; 
  onQuestionsChange: (q: Question[]) => void;
}) => {
  const addQuestion = useCallback((type: Question['type']) => {
    const newQuestion: Question = {
      id: crypto.randomUUID(),
      text: '',
      type,
      marks: 1,
      options: type === 'multiple_choice' ? ['', '', '', ''] : undefined,
      correctAnswer: type === 'true_false' ? 0 : undefined,
    };
    onQuestionsChange([...questions, newQuestion]);
  }, [questions, onQuestionsChange]);

  const updateQuestion = useCallback((id: string, updates: Partial<Question>) => {
    onQuestionsChange(questions.map(q => q.id === id ? { ...q, ...updates } : q));
  }, [questions, onQuestionsChange]);

  const removeQuestion = useCallback((id: string) => {
    onQuestionsChange(questions.filter(q => q.id !== id));
  }, [questions, onQuestionsChange]);

  const updateOption = useCallback((qId: string, optIndex: number, value: string) => {
    onQuestionsChange(questions.map(q => {
      if (q.id === qId && q.options) {
        const newOptions = [...q.options];
        newOptions[optIndex] = value;
        return { ...q, options: newOptions };
      }
      return q;
    }));
  }, [questions, onQuestionsChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-foreground">Questions</h4>
          <p className="text-xs text-muted-foreground">
            {questions.length} questions • {questions.reduce((a, q) => a + q.marks, 0)} total marks
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" type="button" onClick={() => addQuestion('multiple_choice')}>
            + MCQ
          </Button>
          <Button variant="outline" size="sm" type="button" onClick={() => addQuestion('short_answer')}>
            + Short
          </Button>
          <Button variant="outline" size="sm" type="button" onClick={() => addQuestion('true_false')}>
            + T/F
          </Button>
          <Button variant="outline" size="sm" type="button" onClick={() => addQuestion('essay')}>
            + Essay
          </Button>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <HelpCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No questions yet. Add manually or import from file.</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {questions.map((q, idx) => (
            <div key={q.id} className="border rounded-lg p-4 bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <GripVertical className="w-4 h-4" />
                  <span className="text-sm font-medium">Q{idx + 1}</span>
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex gap-2">
                    <Textarea
                      value={q.text}
                      onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                      placeholder="Enter question text..."
                      className="flex-1 min-h-[60px] font-mono text-sm"
                    />
                    <Input
                      type="number"
                      value={q.marks}
                      onChange={(e) => updateQuestion(q.id, { marks: Number(e.target.value) })}
                      className="w-20"
                      min={1}
                    />
                    <Badge variant="outline" className="capitalize whitespace-nowrap">
                      {q.type.replace('_', ' ')}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      type="button"
                      onClick={() => removeQuestion(q.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {(q.section !== undefined || q.instructions !== undefined) && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={q.section ?? ''} onChange={(e) => updateQuestion(q.id, { section: e.target.value })} placeholder="Section heading" className="h-8 text-sm" />
                      <Input value={q.instructions ?? ''} onChange={(e) => updateQuestion(q.id, { instructions: e.target.value })} placeholder="Section instructions" className="h-8 text-sm" />
                    </div>
                  )}
                  {q.importWarnings && q.importWarnings.length > 0 && (
                    <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs space-y-1">
                      {q.importWarnings.map((w, wi) => (
                        <p key={wi} className="flex gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}</p>
                      ))}
                    </div>
                  )}
                  {q.type === 'multiple_choice' && q.options && (
                    <div className="grid grid-cols-2 gap-2">
                      {q.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            checked={q.correctAnswer === i}
                            onChange={() => updateQuestion(q.id, { correctAnswer: i })}
                            className="accent-primary"
                          />
                          <Input
                            value={opt}
                            onChange={(e) => updateOption(q.id, i, e.target.value)}
                            placeholder={`Option ${q.optionLabels?.[i] ?? String.fromCharCode(65 + i)}`}
                            className="flex-1 h-8 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {q.type === 'true_false' && (
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`tf-${q.id}`}
                          checked={q.correctAnswer === 0}
                          onChange={() => updateQuestion(q.id, { correctAnswer: 0 })}
                          className="accent-primary"
                        />
                        <span className="text-sm">True</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`tf-${q.id}`}
                          checked={q.correctAnswer === 1}
                          onChange={() => updateQuestion(q.id, { correctAnswer: 1 })}
                          className="accent-primary"
                        />
                        <span className="text-sm">False</span>
                      </label>
                    </div>
                  )}

                  {q.type === 'short_answer' && (
                    <Input
                      value={q.correctAnswer as string || ''}
                      onChange={(e) => updateQuestion(q.id, { correctAnswer: e.target.value })}
                      placeholder="Expected answer (for auto-grading)"
                      className="text-sm"
                    />
                  )}

                  <details className="rounded-md border border-border bg-background/50 p-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Preview as student</summary>
                    <div className="mt-2 space-y-2 text-sm">
                      {q.section && <p className="font-semibold">{q.section}</p>}
                      {q.instructions && <p className="italic text-muted-foreground whitespace-pre-wrap">{q.instructions}</p>}
                      <StructuredText text={`${q.number ? `${q.number}. ` : ''}${q.text}`} />
                      {q.type === 'multiple_choice' && (q.options ?? []).map((o, oi) => (
                        <p key={oi} className="whitespace-pre-wrap pl-3">{q.optionLabels?.[oi] ?? String.fromCharCode(65 + oi)}. {o}</p>
                      ))}
                      {q.type === 'true_false' && <p className="pl-3">True / False</p>}
                    </div>
                  </details>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
QuestionEditor.displayName = 'QuestionEditor';

export const TasksModule = () => {
  const { user } = useAuth();
  const { activeClass } = useActiveClass();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [classes, setClasses] = useState<TaskClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [createStep, setCreateStep] = useState<'basic' | 'questions' | 'security' | 'students'>('basic');
  const [userRole, setUserRole] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState('exam');
  const [allSubjects, setAllSubjects] = useState<SubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [duration, setDuration] = useState(60);
  const [maxWarnings, setMaxWarnings] = useState(3);
  const [totalMarks, setTotalMarks] = useState(100);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [requireName, setRequireName] = useState(true);
  const [requireClass, setRequireClass] = useState(true);
  const [requireEmail, setRequireEmail] = useState(false);
  
  // Questions state
  const [questions, setQuestions] = useState<Question[]>([]);
  
  // Security settings
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    webcam: true,
    microphone: true,
    eyeTracking: true,
    screenProtection: true,
    fullscreen: true,
    tabSwitch: true,
    rightClick: true,
  });
  
  // Student import state (optional)
  const [parsedStudents, setParsedStudents] = useState<ParsedStudent[]>([]);
  const [uploadStep, setUploadStep] = useState<'idle' | 'parsing' | 'review'>('idle');
  const [batchName, setBatchName] = useState('');

  useEffect(() => {
    fetchTasks();
    fetchClasses();
    fetchSubjects();
  }, [user, activeClass]);

  const fetchTasks = useCallback(async () => {
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    setUserRole(profile?.role || null);

    let query = supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (profile?.role !== 'admin') {
      query = query.eq('created_by', user.id);
    }

    if (activeClass) {
      query = query.eq('class_name', activeClass);
    }

    const { data } = await query;

    const mappedTasks = (data || []).map(task => ({
      ...task,
      questions: task.questions as unknown as Question[] | undefined,
      security_settings: task.security_settings as unknown as SecuritySettings | undefined,
    })) as Task[];
    
    setTasks(mappedTasks);
    setLoading(false);
  }, [user, activeClass]);

  const fetchClasses = useCallback(async () => {
    const { data } = await supabase.from('classes').select('id, name');
    setClasses((data as TaskClass[]) || []);
  }, []);

  const fetchSubjects = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('subjects').select('id, name, code, class_name, teacher_id');
    setAllSubjects((data as SubjectOption[]) || []);
  }, [user]);

  // Filter subjects by role
  const visibleSubjects = userRole === 'admin'
    ? allSubjects
    : allSubjects.filter(s => s.teacher_id === user?.id);

  // When subject changes: auto-fill class for teacher; for admin keep multi-select but limited to subject's class
  const handleSubjectChange = useCallback((subjectId: string) => {
    setSelectedSubjectId(subjectId);
    const subj = allSubjects.find(s => s.id === subjectId);
    if (subj) {
      // Both teachers & admins: default selected class to the subject's class
      setSelectedClasses([subj.class_name]);
    } else {
      setSelectedClasses([]);
    }
  }, [allSubjects]);


  // Handle file upload for questions — structure-preserving import.
  const [importingQuestions, setImportingQuestions] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const handleQuestionFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv', 'txt', 'md', 'docx', 'pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      toast.error('Unsupported file. Use .docx, .pdf, .txt, .md, .csv or an image.');
      input.value = ''; return;
    }
    if (file.size > 10 * 1024 * 1024) { toast.error('File too large (max 10MB)'); input.value = ''; return; }
    setImportingQuestions(true);
    setImportWarnings([]);
    try {
      let text: string;
      const serverWarnings: string[] = [];
      if (['csv', 'txt', 'md'].includes(ext)) {
        text = await file.text();
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const { data, error } = await supabase.functions.invoke('parse-question-file', {
          body: { fileContent: btoa(bin), fileName: file.name, fileType: file.type },
        });
        if (error || !data?.success) throw new Error(data?.error || error?.message || 'Failed to read the document');
        text = data.text as string;
        serverWarnings.push(...((data.warnings as string[]) ?? []));
      }
      const result = parseQuestionDocument(text);
      const all = [...serverWarnings, ...result.warnings];
      if (result.preamble) all.unshift(`Paper header kept for reference (not a question): ${result.preamble.slice(0, 160)}${result.preamble.length > 160 ? '…' : ''}`);
      setImportWarnings(all);
      if (result.questions.length > 0) {
        setQuestions(prev => [...prev, ...result.questions]);
        toast.success(`Imported ${result.questions.length} questions — review them below before saving`);
      } else {
        toast.error('No questions found in file');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import questions');
    } finally {
      setImportingQuestions(false);
      input.value = '';
    }
  }, []);

  // Handle file upload for student import — always uses backend parser (real, no mock)
  const handleStudentFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedExtensions = ['csv', 'tsv', 'txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'webp'];

    if (!allowedExtensions.includes(fileExt)) {
      toast.error('Supported: CSV, TSV, TXT, XLSX, PDF, DOCX, image');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)');
      return;
    }

    setUploadStep('parsing');
    toast.info('Parsing file…');

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Chunked base64 to avoid call stack overflow on large files
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const base64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke('parse-student-list', {
        body: {
          fileContent: base64,
          fileName: file.name,
          fileType: file.type,
        },
      });

      if (error) throw new Error(error.message || 'Failed to parse file');
      if (data?.error) throw new Error(data.error);

      if (data?.students && data.students.length > 0) {
        // Apply selected class as fallback if file omitted it
        const fallback = selectedClasses[0] || '';
        setParsedStudents(
          data.students.map((s: ParsedStudent) => ({
            ...s,
            class_name: s.class_name || fallback,
          }))
        );
        setUploadStep('review');
        toast.success(`Extracted ${data.students.length} students from real file`);
      } else {
        toast.warning('No students found in file');
        setUploadStep('idle');
      }
    } catch (err) {
      console.error('Parse error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to parse file');
      setUploadStep('idle');
    }
  }, [selectedClasses]);

  const handleImportStudents = useCallback(async () => {
    if (parsedStudents.length === 0) {
      toast.error('No students to import');
      return;
    }

    const studentsToInsert = parsedStudents.map(s => ({
      student_card: s.student_card,
      full_name: s.full_name,
      class_name: s.class_name || selectedClasses[0] || null,
      batch_name: batchName || `Task: ${title} - ${new Date().toLocaleDateString()}`,
      uploaded_by: user?.id,
    }));

    const { error } = await supabase.from('registered_students').insert(studentsToInsert);

    if (error) {
      if (error.code === '23505') {
        toast.error('Some student cards already exist');
      } else {
        toast.error('Failed to import students');
      }
    } else {
      toast.success(`Imported ${parsedStudents.length} students`);
      setParsedStudents([]);
      setUploadStep('idle');
    }
  }, [parsedStudents, selectedClasses, batchName, title, user?.id]);

  const creatingRef = useRef(false);

  const handleCreateTask = useCallback(async () => {
    if (!title.trim() || selectedClasses.length === 0) {
      toast.error('Title and at least one class are required');
      return;
    }

    // Prevent duplicate creation from double-clicks
    if (creatingRef.current) return;
    creatingRef.current = true;

    try {
      const tasksToInsert = selectedClasses.map(cls => ({
        title,
        description,
        task_type: taskType,
        class_name: cls,
        subject_id: selectedSubjectId || null,
        duration_minutes: duration,
        max_warnings: maxWarnings,
        total_marks: questions.length > 0 ? questions.reduce((a, q) => a + q.marks, 0) : totalMarks,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        is_active: false,
        required_fields: { name: requireName, class: requireClass, email: requireEmail } as Record<string, boolean>,
        security_settings: securitySettings as unknown as Record<string, boolean>,
        questions: questions as unknown as Record<string, any>[],
        created_by: user?.id || ''
      }));
      
      const { error } = await supabase.from('tasks').insert(tasksToInsert);

      if (error) {
        console.error('Task creation error:', error);
        toast.error('Failed to create task: ' + error.message);
      } else {
        toast.success(`Task created for ${selectedClasses.length} class(es)`);
        setIsDialogOpen(false);
        resetForm();
        fetchTasks();
      }
    } finally {
      creatingRef.current = false;
    }
  }, [title, description, taskType, selectedSubjectId, selectedClasses, duration, maxWarnings, totalMarks, startsAt, endsAt, requireName, requireClass, requireEmail, securitySettings, questions, user?.id, fetchTasks]);

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setTaskType('exam');
    setSelectedSubjectId('');
    setSelectedClasses([]);
    setDuration(60);
    setMaxWarnings(3);
    setTotalMarks(100);
    setStartsAt('');
    setEndsAt('');
    setRequireName(true);
    setRequireClass(true);
    setRequireEmail(false);
    setQuestions([]);
    setSecuritySettings({
      webcam: true,
      microphone: true,
      eyeTracking: true,
      screenProtection: true,
      fullscreen: true,
      tabSwitch: true,
      rightClick: true,
    });
    setParsedStudents([]);
    setUploadStep('idle');
    setBatchName('');
    setCreateStep('basic');
  }, []);

  const toggleTaskActive = useCallback(async (taskId: string, currentState: boolean) => {
    const { error } = await supabase
      .from('tasks')
      .update({ is_active: !currentState })
      .eq('id', taskId);

    if (!error) {
      toast.success(`Task ${!currentState ? 'activated' : 'deactivated'}`);
      fetchTasks();
    }
  }, [fetchTasks]);

  const handleDeleteTask = useCallback(async (taskId: string, taskTitle: string) => {
    if (!window.confirm(`Delete task "${taskTitle}"? This will also remove all submissions and scores. This cannot be undone.`)) {
      return;
    }
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) {
      toast.error('Failed to delete task: ' + error.message);
    } else {
      toast.success('Task deleted');
      setTasks(prev => prev.filter(t => t.id !== taskId));
    }
  }, []);

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
          <h2 className="text-2xl font-bold text-foreground">Tasks Management</h2>
          <p className="text-muted-foreground">Create and manage exams, tests, and assignments</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Task
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
            </DialogHeader>
            
            <Tabs value={createStep} onValueChange={(v) => setCreateStep(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">Basic</span>
                </TabsTrigger>
                <TabsTrigger value="questions" className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Questions</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  <span className="hidden sm:inline">Security</span>
                </TabsTrigger>
                <TabsTrigger value="students" className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span className="hidden sm:inline">Students</span>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={taskType} onValueChange={setTaskType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exam">Exam</SelectItem>
                        <SelectItem value="test">Test</SelectItem>
                        <SelectItem value="assignment">Assignment</SelectItem>
                        <SelectItem value="quiz">Quiz</SelectItem>
                        <SelectItem value="work">Work</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Task description" />
                </div>

                <div className="space-y-2">
                  <Label>Subject * (pick first to filter classes)</Label>
                  {visibleSubjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {userRole === 'admin' ? 'No subjects exist yet — create one in Subjects Management.' : 'No subjects assigned to you.'}
                    </p>
                  ) : (
                    <Select value={selectedSubjectId} onValueChange={handleSubjectChange}>
                      <SelectTrigger><SelectValue placeholder="Select a subject" /></SelectTrigger>
                      <SelectContent>
                        {visibleSubjects.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} {s.code ? `(${s.code})` : ''} — {s.class_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Classes * {userRole === 'admin' && selectedSubjectId ? '(filtered by subject)' : '(auto-set from subject)'}</Label>
                  {(() => {
                    const subj = allSubjects.find(s => s.id === selectedSubjectId);
                    const filtered = userRole === 'admin'
                      ? (subj ? classes.filter(c => c.name === subj.class_name) : classes)
                      : (subj ? classes.filter(c => c.name === subj.class_name) : []);
                    if (!selectedSubjectId) {
                      return <p className="text-xs text-muted-foreground">Select a subject above first.</p>;
                    }
                    if (filtered.length === 0) {
                      return <p className="text-sm text-muted-foreground">No matching class found for this subject.</p>;
                    }
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                        {filtered.map(c => {
                          const isSelected = selectedClasses.includes(c.name);
                          return (
                            <label
                              key={c.id}
                              className={`flex items-center gap-2 p-2 rounded-md cursor-pointer border transition-colors ${
                                isSelected ? 'bg-primary/10 border-primary' : 'border-border hover:bg-muted'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedClasses(prev =>
                                    isSelected ? prev.filter(n => n !== c.name) : [...prev, c.name]
                                  );
                                }}
                                className="accent-primary"
                              />
                              <span className="text-sm font-medium text-foreground">{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {selectedClasses.length > 0 && (
                    <p className="text-xs text-muted-foreground">{selectedClasses.length} class(es) selected</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Total Marks</Label>
                  <Input type="number" value={totalMarks} onChange={(e) => setTotalMarks(Number(e.target.value))} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Duration (minutes)</Label>
                    <Input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Warnings</Label>
                    <Input type="number" value={maxWarnings} onChange={(e) => setMaxWarnings(Number(e.target.value))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Opens At</Label>
                    <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Deadline</Label>
                    <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Required Student Fields</Label>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch checked={requireName} onCheckedChange={setRequireName} />
                      <Label>Name</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={requireClass} onCheckedChange={setRequireClass} />
                      <Label>Class</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={requireEmail} onCheckedChange={setRequireEmail} />
                      <Label>Email</Label>
                    </div>
                  </div>
                </div>

                <Button type="button" onClick={() => setCreateStep('questions')} className="w-full">
                  Next: Add Questions
                </Button>
              </TabsContent>
              
              <TabsContent value="questions" className="space-y-4 mt-4">
                <div className="bg-muted/50 rounded-lg p-4 border border-border">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                      <Upload className="w-5 h-5 text-primary" />
                      Import Questions from File
                    </h4>
                    <Input
                      type="file"
                      accept=".docx,.pdf,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
                      onChange={handleQuestionFileUpload}
                      disabled={importingQuestions}
                      className="max-w-xs"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {importingQuestions ? 'Reading document…' : 'Word (.docx), PDF, text or image. Numbering, sections, instructions, A/B/C/D choices, blanks, tables and marks are kept. Put "Answer: B" after a question to set the correct answer. The old CSV template still works.'}
                  </p>
                  {importWarnings.length > 0 && (
                    <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs space-y-1">
                      {importWarnings.map((w, i) => <p key={i} className="flex gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}</p>)}
                    </div>
                  )}
                </div>

                <QuestionEditor questions={questions} onQuestionsChange={setQuestions} />

                <div className="flex gap-2">
                  <Button variant="outline" type="button" onClick={() => setCreateStep('basic')} className="flex-1">
                    Back
                  </Button>
                  <Button type="button" onClick={() => setCreateStep('security')} className="flex-1">
                    Next: Security Settings
                  </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="security" className="space-y-4 mt-4">
                <div className="bg-muted/50 rounded-lg p-4 border border-border">
                  <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    Exam Security Features
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure which security features are enabled for this exam.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Camera className="w-5 h-5 text-primary" />
                        <div>
                          <Label className="font-medium">Webcam Monitoring</Label>
                          <p className="text-xs text-muted-foreground">Record and analyze student video</p>
                        </div>
                      </div>
                      <Switch 
                        checked={securitySettings.webcam} 
                        onCheckedChange={(v) => setSecuritySettings(prev => ({ ...prev, webcam: v }))} 
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Mic className="w-5 h-5 text-primary" />
                        <div>
                          <Label className="font-medium">Microphone Analysis</Label>
                          <p className="text-xs text-muted-foreground">Detect suspicious sounds</p>
                        </div>
                      </div>
                      <Switch 
                        checked={securitySettings.microphone} 
                        onCheckedChange={(v) => setSecuritySettings(prev => ({ ...prev, microphone: v }))} 
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Eye className="w-5 h-5 text-primary" />
                        <div>
                          <Label className="font-medium">Eye Tracking</Label>
                          <p className="text-xs text-muted-foreground">Detect eye deviation & head position</p>
                        </div>
                      </div>
                      <Switch 
                        checked={securitySettings.eyeTracking} 
                        onCheckedChange={(v) => setSecuritySettings(prev => ({ ...prev, eyeTracking: v }))} 
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Monitor className="w-5 h-5 text-primary" />
                        <div>
                          <Label className="font-medium">Screen Protection</Label>
                          <p className="text-xs text-muted-foreground">Block HDMI, projectors, casting</p>
                        </div>
                      </div>
                      <Switch 
                        checked={securitySettings.screenProtection} 
                        onCheckedChange={(v) => setSecuritySettings(prev => ({ ...prev, screenProtection: v }))} 
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Maximize className="w-5 h-5 text-primary" />
                        <div>
                          <Label className="font-medium">Fullscreen Mode</Label>
                          <p className="text-xs text-muted-foreground">Force fullscreen during exam</p>
                        </div>
                      </div>
                      <Switch 
                        checked={securitySettings.fullscreen} 
                        onCheckedChange={(v) => setSecuritySettings(prev => ({ ...prev, fullscreen: v }))} 
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-primary" />
                        <div>
                          <Label className="font-medium">Tab Switch Detection</Label>
                          <p className="text-xs text-muted-foreground">Warn when switching tabs/apps</p>
                        </div>
                      </div>
                      <Switch 
                        checked={securitySettings.tabSwitch} 
                        onCheckedChange={(v) => setSecuritySettings(prev => ({ ...prev, tabSwitch: v }))} 
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="flex items-center gap-3">
                        <MousePointerClick className="w-5 h-5 text-primary" />
                        <div>
                          <Label className="font-medium">Disable Right Click</Label>
                          <p className="text-xs text-muted-foreground">Prevent copy/paste context menu</p>
                        </div>
                      </div>
                      <Switch 
                        checked={securitySettings.rightClick} 
                        onCheckedChange={(v) => setSecuritySettings(prev => ({ ...prev, rightClick: v }))} 
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" type="button" onClick={() => setCreateStep('questions')} className="flex-1">
                    Back
                  </Button>
                  <Button type="button" onClick={() => setCreateStep('students')} className="flex-1">
                    Next: Import Students (Optional)
                  </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="students" className="space-y-4 mt-4">
                <div className="bg-muted/50 rounded-lg p-4 border border-border">
                  <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Upload className="w-5 h-5 text-primary" />
                    Import Students (Optional)
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Optionally upload a student list. Skip this step if students are already registered.
                  </p>
                  
                  {uploadStep === 'idle' && (
                    <div className="space-y-4">
                      <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mb-2">Upload CSV, TXT, PDF, or DOC file</p>
                        <Input
                          type="file"
                          accept=".csv,.tsv,.txt,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                          onChange={handleStudentFileUpload}
                          className="max-w-xs mx-auto"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        Format: student_card, full_name, class_name (one per line)
                      </p>
                    </div>
                  )}
                  
                  {uploadStep === 'parsing' && (
                    <div className="flex flex-col items-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                      <p className="text-muted-foreground">Parsing document with AI...</p>
                    </div>
                  )}
                  
                  {uploadStep === 'review' && parsedStudents.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{parsedStudents.length} students found</Badge>
                        <Button variant="outline" size="sm" type="button" onClick={() => { setParsedStudents([]); setUploadStep('idle'); }}>
                          Clear
                        </Button>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Batch Name</Label>
                        <Input 
                          value={batchName} 
                          onChange={(e) => setBatchName(e.target.value)} 
                          placeholder={`Task: ${title || 'New Task'}`}
                        />
                      </div>
                      
                      <div className="max-h-40 overflow-y-auto border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Card</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Class</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {parsedStudents.slice(0, 5).map((s, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-xs">{s.student_card}</TableCell>
                                <TableCell>{s.full_name}</TableCell>
                                <TableCell>{s.class_name || selectedClasses[0] || '-'}</TableCell>
                              </TableRow>
                            ))}
                            {parsedStudents.length > 5 && (
                              <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground text-sm">
                                  ... and {parsedStudents.length - 5} more
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      
                      <Button type="button" onClick={handleImportStudents} className="w-full" variant="outline">
                        <Upload className="w-4 h-4 mr-2" />
                        Import {parsedStudents.length} Students
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" type="button" onClick={() => setCreateStep('security')} className="flex-1">
                    Back
                  </Button>
                  <Button type="button" onClick={handleCreateTask} className="flex-1" disabled={!title.trim() || selectedClasses.length === 0}>
                    Create Task
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tasks Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Your Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-center">Questions</TableHead>
                  <TableHead className="text-center">Duration</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead>Comments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{task.task_type}</Badge>
                    </TableCell>
                    <TableCell>{task.class_name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">
                        {task.questions?.length || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{task.duration_minutes}m</TableCell>
                    <TableCell>
                      {task.starts_at && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Opens: </span>
                          {format(new Date(task.starts_at), 'MMM dd, HH:mm')}
                        </div>
                      )}
                      {task.ends_at && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Ends: </span>
                          {format(new Date(task.ends_at), 'MMM dd, HH:mm')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={task.is_active ? 'default' : 'secondary'}>
                        {task.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant={task.is_active ? 'destructive' : 'default'} 
                          size="sm"
                          onClick={() => toggleTaskActive(task.id, task.is_active)}
                        >
                          {task.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteTask(task.id, task.title)}
                          title="Delete task permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <CommentThread parentType="task" parentId={task.id} compact />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">No tasks created yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};