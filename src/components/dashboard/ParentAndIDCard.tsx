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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  Check, 
  X, 
  Clock,
  GraduationCap,
  UserCircle,
  Phone,
  RefreshCw,
  AlertTriangle,
  Upload,
  FileText,
  Trash2,
  Plus,
  CheckCircle,
  XCircle,
  Search,
  Loader2,
  CreditCard
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

interface RegisteredStudent {
  id: string;
  student_card: string;
  full_name: string;
  class_name: string | null;
  is_registered: boolean;
  batch_name: string | null;
  created_at: string;
}

interface ParsedStudent {
  student_card: string;
  full_name: string;
  class_name?: string;
}

export const ParentAndIDCard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('verification');
  
  // Parent verification state
  const [links, setLinks] = useState<ParentLink[]>([]);
  const [verifyFilter, setVerifyFilter] = useState<'pending' | 'verified' | 'all'>('pending');
  const [isLoadingLinks, setIsLoadingLinks] = useState(true);

  // Student card state
  const [students, setStudents] = useState<RegisteredStudent[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [newStudent, setNewStudent] = useState({ student_card: '', full_name: '', class_name: '' });
  const [batchName, setBatchName] = useState('');
  const [parsedStudents, setParsedStudents] = useState<ParsedStudent[]>([]);
  const [uploadStep, setUploadStep] = useState<'upload' | 'parsing' | 'review'>('upload');

  useEffect(() => {
    fetchLinks();
  }, [verifyFilter]);

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, [selectedClass]);

  // Parent verification functions
  const fetchLinks = async () => {
    setIsLoadingLinks(true);
    
    let query = supabase
      .from('parent_children')
      .select('*')
      .order('created_at', { ascending: false });

    if (verifyFilter === 'pending') {
      query = query.eq('verified', false);
    } else if (verifyFilter === 'verified') {
      query = query.eq('verified', true);
    }

    const { data, error } = await query;

    if (error) {
      toast.error('Failed to load parent links');
      setIsLoadingLinks(false);
      return;
    }

    if (!data || data.length === 0) {
      setLinks([]);
      setIsLoadingLinks(false);
      return;
    }

    const parentIds = data.map(d => d.parent_id);
    const studentIds = data.map(d => d.student_id);

    const [{ data: parents }, { data: studentsData }] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name, phone').in('user_id', parentIds),
      supabase.from('profiles').select('user_id, full_name, current_class, student_card').in('user_id', studentIds),
    ]);

    const parentMap = new Map(parents?.map(p => [p.user_id, p]) || []);
    const studentMap = new Map(studentsData?.map(s => [s.user_id, s]) || []);

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
        parent_email: '',
        parent_phone: parent?.phone || null,
        student_name: student?.full_name || 'Unknown Student',
        student_class: student?.current_class || null,
        student_card: student?.student_card || null,
      };
    });

    setLinks(enrichedLinks);
    setIsLoadingLinks(false);
  };

  const handleVerify = async (linkId: string) => {
    const { error } = await supabase.from('parent_children').update({ verified: true }).eq('id', linkId);
    if (error) {
      toast.error('Failed to verify link');
      return;
    }
    toast.success('Parent-child link verified successfully');
    fetchLinks();
  };

  const handleReject = async (linkId: string) => {
    const { error } = await supabase.from('parent_children').delete().eq('id', linkId);
    if (error) {
      toast.error('Failed to reject link');
      return;
    }
    toast.success('Parent-child link rejected and removed');
    fetchLinks();
  };

  const handleRevoke = async (linkId: string) => {
    const { error } = await supabase.from('parent_children').update({ verified: false }).eq('id', linkId);
    if (error) {
      toast.error('Failed to revoke verification');
      return;
    }
    toast.success('Verification revoked');
    fetchLinks();
  };

  // Student card functions
  const fetchStudents = async () => {
    setIsLoadingStudents(true);
    let query = supabase.from('registered_students').select('*').order('created_at', { ascending: false });
    
    if (selectedClass !== 'all') {
      query = query.eq('class_name', selectedClass);
    }
    
    const { data, error } = await query;
    if (data && !error) {
      setStudents(data);
    }
    setIsLoadingStudents(false);
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
            student_card: parts[0],
            full_name: parts[1],
            class_name: parts[2] || '',
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
    
    setIsLoadingStudents(true);
    const studentsToInsert = parsedStudents.map(s => ({
      student_card: s.student_card,
      full_name: s.full_name,
      class_name: s.class_name || null,
      batch_name: batchName || `Batch ${new Date().toLocaleDateString()}`,
      uploaded_by: user?.id,
    }));

    const { data, error } = await supabase.from('registered_students').insert(studentsToInsert).select();

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
    setIsLoadingStudents(false);
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
      setNewStudent({ student_card: '', full_name: '', class_name: '' });
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

  const pendingCount = links.filter(l => !l.verified).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="w-6 h-6" />
            Parent & ID Card Management
          </h1>
          <p className="text-muted-foreground">Verify parent links and manage student ID cards</p>
        </div>
        <Button variant="outline" onClick={() => { fetchLinks(); fetchStudents(); }} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="verification" className="gap-2">
            <UserCircle className="h-4 w-4" />
            Parent Verification
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="idcards" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Student ID Cards
          </TabsTrigger>
        </TabsList>

        <TabsContent value="verification" className="mt-4">
          <div className="space-y-4">
            {/* Filter Tabs */}
            <div className="flex gap-2">
              <Button
                variant={verifyFilter === 'pending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setVerifyFilter('pending')}
                className="gap-2"
              >
                <Clock className="h-4 w-4" />
                Pending
              </Button>
              <Button
                variant={verifyFilter === 'verified' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setVerifyFilter('verified')}
              >
                <Check className="h-4 w-4 mr-1" />
                Verified
              </Button>
              <Button
                variant={verifyFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setVerifyFilter('all')}
              >
                All
              </Button>
            </div>

            {isLoadingLinks ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : links.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-16 w-16 text-muted-foreground mb-4" />
                  <h2 className="text-xl font-semibold text-foreground mb-2">
                    {verifyFilter === 'pending' ? 'No Pending Requests' : 'No Links Found'}
                  </h2>
                  <p className="text-muted-foreground text-center">
                    {verifyFilter === 'pending' 
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

                        <div className="hidden lg:block text-muted-foreground">→</div>

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
                              <Button size="sm" onClick={() => handleVerify(link.id)} className="gap-1">
                                <Check className="h-4 w-4" />
                                Approve
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleReject(link.id)} className="gap-1">
                                <X className="h-4 w-4" />
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => handleRevoke(link.id)} className="gap-1 text-destructive hover:text-destructive">
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
        </TabsContent>

        <TabsContent value="idcards" className="mt-4">
          <div className="space-y-6">
            {/* Actions */}
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
                          Student Card,Full Name,Class<br/>
                          SC001,John Doe,L4 SOD A<br/>
                          SC002,Jane Smith,L4 SOD B
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
                              <TableHead>Student Card</TableHead>
                              <TableHead>Full Name</TableHead>
                              <TableHead>Class</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {parsedStudents.slice(0, 10).map((s, i) => (
                              <TableRow key={i}>
                                <TableCell>{s.student_card}</TableCell>
                                <TableCell>{s.full_name}</TableCell>
                                <TableCell>{s.class_name || '-'}</TableCell>
                              </TableRow>
                            ))}
                            {parsedStudents.length > 10 && (
                              <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground">
                                  ... and {parsedStudents.length - 10} more
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      
                      <Button onClick={handleBulkUpload} className="w-full" disabled={isLoadingStudents}>
                        {isLoadingStudents ? 'Uploading...' : `Upload ${parsedStudents.length} Students`}
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
                      <Label>Student Card Number *</Label>
                      <Input
                        value={newStudent.student_card}
                        onChange={(e) => setNewStudent({ ...newStudent, student_card: e.target.value })}
                        placeholder="e.g., SC2025001"
                      />
                    </div>
                    <div>
                      <Label>Full Name *</Label>
                      <Input
                        value={newStudent.full_name}
                        onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })}
                        placeholder="Enter student's full name"
                      />
                    </div>
                    <div>
                      <Label>Class (Optional)</Label>
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
                  <Select value={selectedClass} onValueChange={(v) => setSelectedClass(v)}>
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
                {isLoadingStudents ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student Card</TableHead>
                        <TableHead>Full Name</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-mono">{student.student_card}</TableCell>
                          <TableCell className="font-medium">{student.full_name}</TableCell>
                          <TableCell>{student.class_name || '-'}</TableCell>
                          <TableCell>
                            {student.is_registered ? (
                              <Badge variant="default" className="bg-success/20 text-success">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Enrolled
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Clock className="w-3 h-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{student.batch_name || '-'}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(student.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {!isLoadingStudents && filteredStudents.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No students found.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};