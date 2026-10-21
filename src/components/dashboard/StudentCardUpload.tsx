import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileText, Trash2, Plus, Users, CheckCircle, XCircle, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface RegisteredStudent {
  id: string;
  student_card: string;
  full_name: string;
  class_name: string | null;
  is_registered: boolean;
  batch_name: string | null;
  created_at: string;
  age?: number | null;
}

interface ParsedStudent {
  student_card: string;
  full_name: string;
  class_name?: string;
  age?: number;
}

export const StudentCardUpload = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<RegisteredStudent[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [newStudent, setNewStudent] = useState({ student_card: '', full_name: '', class_name: '', age: '' });
  const [batchName, setBatchName] = useState('');
  const [parsedStudents, setParsedStudents] = useState<ParsedStudent[]>([]);
  const [uploadStep, setUploadStep] = useState<'upload' | 'parsing' | 'review'>('upload');

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  const fetchStudents = async () => {
    setIsLoading(true);
    let query = supabase.from('registered_students').select('*').order('created_at', { ascending: false });
    
    if (selectedClass !== 'all') {
      query = query.eq('class_name', selectedClass);
    }
    
    const { data, error } = await query;
    if (data && !error) {
      setStudents(data as RegisteredStudent[]);
    }
    setIsLoading(false);
  };

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('id, name');
    if (data) setClasses(data);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['csv', 'txt', 'pdf', 'doc', 'docx'];
    
    if (!allowedExtensions.includes(fileExt || '')) {
      toast.error('Please upload a CSV, TXT, PDF, or DOC file');
      return;
    }
    
    if (fileExt === 'csv' || fileExt === 'txt') {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const parsed: ParsedStudent[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim().replace(/"/g, ''));
        if (parts.length >= 2) {
          parsed.push({
            full_name: parts[0],
            student_card: parts[1],
            age: parts[2] ? parseInt(parts[2]) : undefined,
            class_name: parts[3] || '',
          });
        }
      }
      
      setParsedStudents(parsed);
      setUploadStep('review');
    } else if (fileExt === 'pdf' || fileExt === 'doc' || fileExt === 'docx') {
      setUploadStep('parsing');
      toast.info('Parsing document with AI...');
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        const { data, error } = await supabase.functions.invoke('parse-student-list', {
          body: {
            fileContent: base64,
            fileName: file.name,
            fileType: file.type,
          },
        });
        
        if (error) {
          throw new Error(error.message || 'Failed to parse document');
        }
        
        if (data?.students && data.students.length > 0) {
          setParsedStudents(data.students);
          setUploadStep('review');
          toast.success(data.message || `Found ${data.students.length} students`);
        } else {
          toast.error('No students found in document. Please check the format or add manually.');
          setUploadStep('upload');
        }
      } catch (err) {
        console.error('Parse error:', err);
        toast.error('Failed to parse document. Please try CSV format or add manually.');
        setUploadStep('upload');
      }
    }
  };

  const handleBulkUpload = async () => {
    if (parsedStudents.length === 0) return;
    
    setIsLoading(true);
    const studentsToInsert = parsedStudents.map(s => ({
      student_card: s.student_card,
      full_name: s.full_name,
      class_name: s.class_name || null,
      age: s.age || null,
      batch_name: batchName || `Batch ${new Date().toLocaleDateString()}`,
      uploaded_by: user?.id,
    }));

    const { data, error } = await supabase
      .from('registered_students')
      .insert(studentsToInsert)
      .select();

    if (error) {
      if (error.code === '23505') {
        toast.error('Some student cards already exist in the system');
      } else {
        toast.error('Failed to upload students');
      }
    } else {
      toast.success(`Successfully added ${data.length} students`);
      setParsedStudents([]);
      setUploadStep('upload');
      setShowUploadDialog(false);
      setBatchName('');
      fetchStudents();
    }
    setIsLoading(false);
  };

  const handleAddSingle = async () => {
    if (!newStudent.student_card || !newStudent.full_name) {
      toast.error('Student card and name are required');
      return;
    }

    const { error } = await supabase.from('registered_students').insert({
      student_card: newStudent.student_card,
      full_name: newStudent.full_name,
      class_name: newStudent.class_name || null,
      age: newStudent.age ? parseInt(newStudent.age) : null,
      uploaded_by: user?.id,
    });

    if (error) {
      if (error.code === '23505') {
        toast.error('This student card already exists');
      } else {
        toast.error('Failed to add student');
      }
    } else {
      toast.success('Student added successfully');
      setNewStudent({ student_card: '', full_name: '', class_name: '', age: '' });
      setShowAddDialog(false);
      fetchStudents();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('registered_students').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete student');
    } else {
      toast.success('Student removed');
      fetchStudents();
    }
  };

  const filteredStudents = students.filter(s => 
    s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.student_card.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Student Card Registry</h1>
          <p className="text-muted-foreground">Manage registered student cards for enrollment validation</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Upload className="w-4 h-4" />
                Bulk Upload
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Bulk Upload Student Cards</DialogTitle>
              </DialogHeader>
              
              {uploadStep === 'upload' && (
                <div className="space-y-4">
                  <div>
                    <Label>Batch Name (Optional)</Label>
                    <Input
                      value={batchName}
                      onChange={(e) => setBatchName(e.target.value)}
                      placeholder="e.g., Form 4 2025"
                    />
                  </div>
                  
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-2">
                      Upload a file with student data
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                      Supported formats: <strong>CSV, TXT, PDF, DOC, DOCX</strong>
                    </p>
                    <Input
                      type="file"
                      accept=".csv,.txt,.pdf,.doc,.docx"
                      onChange={handleFileUpload}
                      className="max-w-xs mx-auto"
                    />
                  </div>
                  
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm font-medium mb-2">CSV Format Example:</p>
                    <code className="text-xs text-muted-foreground">
                      Full Name,Student Card,Age,Class<br/>
                      John Doe,SC001,17,L4 SOD A<br/>
                      Jane Smith,SC002,16,L4 SOD B
                    </code>
                  </div>
                </div>
              )}
              
              {uploadStep === 'parsing' && (
                <div className="py-12 text-center">
                  <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin mb-4" />
                  <p className="font-medium text-foreground">Parsing document with AI...</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    This may take a few seconds depending on document size
                  </p>
                </div>
              )}
              
              {uploadStep === 'review' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{parsedStudents.length} students found</p>
                    <Button variant="outline" size="sm" onClick={() => setUploadStep('upload')}>
                      Upload Different File
                    </Button>
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Full Name</TableHead>
                          <TableHead>Student Card</TableHead>
                          <TableHead>Age</TableHead>
                          <TableHead>Class</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedStudents.slice(0, 10).map((s, i) => (
                          <TableRow key={i}>
                            <TableCell>{s.full_name}</TableCell>
                            <TableCell>{s.student_card}</TableCell>
                            <TableCell>{s.age || '-'}</TableCell>
                            <TableCell>{s.class_name || '-'}</TableCell>
                          </TableRow>
                        ))}
                        {parsedStudents.length > 10 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              ... and {parsedStudents.length - 10} more
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  
                  <Button onClick={handleBulkUpload} className="w-full" disabled={isLoading}>
                    {isLoading ? 'Uploading...' : `Upload ${parsedStudents.length} Students`}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
          
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Student
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Single Student</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Full Name *</Label>
                  <Input
                    value={newStudent.full_name}
                    onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })}
                    placeholder="Enter student's full name"
                  />
                </div>
                <div>
                  <Label>Student Card ID *</Label>
                  <Input
                    value={newStudent.student_card}
                    onChange={(e) => setNewStudent({ ...newStudent, student_card: e.target.value })}
                    placeholder="e.g., SC2025001"
                  />
                </div>
                <div>
                  <Label>Age</Label>
                  <Input
                    type="number"
                    value={newStudent.age}
                    onChange={(e) => setNewStudent({ ...newStudent, age: e.target.value })}
                    placeholder="e.g., 17"
                    min={10}
                    max={30}
                  />
                </div>
                <div>
                  <Label>Class</Label>
                  <Select
                    value={newStudent.class_name}
                    onValueChange={(v) => setNewStudent({ ...newStudent, class_name: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map(c => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddSingle} className="w-full">
                  Add Student
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Registered</p>
                <p className="text-2xl font-bold">{students.length}</p>
              </div>
              <Users className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Enrolled</p>
                <p className="text-2xl font-bold text-success">{students.filter(s => s.is_registered).length}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-warning">{students.filter(s => !s.is_registered).length}</p>
              </div>
              <XCircle className="w-8 h-8 text-warning" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or card number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedClass} onValueChange={(v) => { setSelectedClass(v); }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map(c => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchStudents}>Refresh</Button>
          </div>
        </CardContent>
      </Card>

      {/* Students Table */}
      <Card>
        <CardHeader>
          <CardTitle>Registered Students</CardTitle>
          <CardDescription>Students with valid cards can create accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>Student Card</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.map(student => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">{student.full_name}</TableCell>
                  <TableCell className="font-mono">{student.student_card}</TableCell>
                  <TableCell>{(student as any).age || '-'}</TableCell>
                  <TableCell>{student.class_name || '-'}</TableCell>
                  <TableCell>
                    {student.is_registered ? (
                      <Badge variant="default" className="bg-success">Enrolled</Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{student.batch_name || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(student.id)}
                      disabled={student.is_registered}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredStudents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No students found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
