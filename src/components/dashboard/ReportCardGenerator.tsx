import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Printer, Download, User, Calendar, Award, BookOpen, GraduationCap, Users, FileText, Loader2 } from 'lucide-react';
import schoolLogo from '@/assets/school-logo.png';
import { toast } from 'sonner';

interface StudentProfile {
  user_id: string;
  full_name: string;
  student_card: string | null;
  current_class: string | null;
}

interface Term {
  id: string;
  name: string;
  year: number;
  term_number: number;
}

interface Subject {
  id: string;
  name: string;
  code: string | null;
}

interface Score {
  id: string;
  score: number | null;
  max_score: number | null;
  score_type: string | null;
  subject_id: string | null;
  term_id: string | null;
  task_id: string | null;
}

interface ReportData {
  student: StudentProfile;
  term: Term;
  subjects: Array<{
    subject: Subject;
    scores: Score[];
    average: number;
    grade: string;
  }>;
  overallAverage: number;
  overallGrade: string;
  rank?: number;
  totalStudents?: number;
}

const getGrade = (percentage: number): string => {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 50) return 'D';
  return 'F';
};

const getGradeColor = (grade: string): string => {
  if (grade.startsWith('A')) return 'text-success';
  if (grade === 'B') return 'text-primary';
  if (grade === 'C') return 'text-warning';
  return 'text-destructive';
};

// XSS Prevention: HTML escape function
const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

export const ReportCardGenerator = () => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedStudent && selectedTerm) {
      generateReport();
    }
  }, [selectedStudent, selectedTerm]);

  const fetchInitialData = async () => {
    const [studentsRes, termsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'student'),
      supabase.from('terms').select('*').order('year', { ascending: false }).order('term_number', { ascending: false }),
    ]);

    if (studentsRes.data) {
      setStudents(studentsRes.data);
      const uniqueClasses = [...new Set(studentsRes.data.map(s => s.current_class).filter(Boolean))] as string[];
      setClasses(uniqueClasses);
    }
    if (termsRes.data) setTerms(termsRes.data);
  };

  const generateReport = async () => {
    if (!selectedStudent || !selectedTerm) return;
    
    setIsLoading(true);
    
    const student = students.find(s => s.user_id === selectedStudent);
    const term = terms.find(t => t.id === selectedTerm);
    
    if (!student || !term) {
      setIsLoading(false);
      return;
    }

    // Fetch subjects for student's class
    const { data: subjects } = await supabase
      .from('subjects')
      .select('*')
      .eq('class_name', student.current_class || '');

    // Fetch scores for this student and term
    const { data: scores } = await supabase
      .from('student_scores')
      .select('*')
      .eq('student_id', selectedStudent)
      .eq('term_id', selectedTerm);

    // Also fetch task submissions for this term
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, total_marks')
      .eq('class_name', student.current_class || '');

    const { data: submissions } = await supabase
      .from('task_submissions')
      .select('*')
      .eq('student_id', selectedStudent)
      .eq('status', 'submitted');

    // Compile subject data
    const subjectData = (subjects || []).map(subject => {
      const subjectScores = (scores || []).filter(s => s.subject_id === subject.id);
      
      // Also include task submissions as scores
      const taskScores = (submissions || [])
        .filter(sub => {
          const task = tasks?.find(t => t.id === sub.task_id);
          return task !== undefined;
        })
        .map(sub => ({
          id: sub.id,
          score: sub.score,
          max_score: tasks?.find(t => t.id === sub.task_id)?.total_marks || 100,
          score_type: 'task',
          subject_id: subject.id,
          term_id: selectedTerm,
          task_id: sub.task_id,
        }));

      const allScores = [...subjectScores, ...taskScores];
      
      // Calculate average
      const validScores = allScores.filter(s => s.score !== null && s.max_score !== null);
      const average = validScores.length > 0
        ? validScores.reduce((sum, s) => sum + ((s.score || 0) / (s.max_score || 100) * 100), 0) / validScores.length
        : 0;

      return {
        subject,
        scores: allScores,
        average: Math.round(average * 10) / 10,
        grade: getGrade(average),
      };
    });

    // Calculate overall average
    const subjectsWithScores = subjectData.filter(s => s.scores.length > 0);
    const overallAverage = subjectsWithScores.length > 0
      ? subjectsWithScores.reduce((sum, s) => sum + s.average, 0) / subjectsWithScores.length
      : 0;

    // Calculate rank among classmates
    const classmates = students.filter(s => s.current_class === student.current_class);
    
    setReportData({
      student,
      term,
      subjects: subjectData,
      overallAverage: Math.round(overallAverage * 10) / 10,
      overallGrade: getGrade(overallAverage),
      totalStudents: classmates.length,
    });

    setIsLoading(false);
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent || !reportData) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // XSS Prevention: Escape user-controlled data
    const safeStudentName = escapeHtml(reportData.student.full_name || '');
    const safeStudentCard = escapeHtml(reportData.student.student_card || 'N/A');
    const safeClassName = escapeHtml(reportData.student.current_class || 'N/A');
    const safeTermName = escapeHtml(reportData.term.name || '');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Report Card - ${safeStudentName}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; color: #2d3748; }
            img { max-width: 80px !important; max-height: 80px !important; width: 80px !important; height: 80px !important; object-fit: contain; display: block; margin: 0 auto 10px; }
            .header { text-align: center; margin-bottom: 30px; }
            h1 { margin: 0; font-size: 24px; color: #1a365d; }
            h2 { margin: 5px 0; font-size: 18px; color: #2d3748; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
            th { background: #edf2f7; font-weight: 600; }
            .grade-A { color: #38a169; font-weight: 600; }
            .grade-B { color: #3182ce; font-weight: 600; }
            .grade-C { color: #d69e2e; font-weight: 600; }
            .grade-D, .grade-F { color: #e53e3e; font-weight: 600; }
            @page { size: A4; margin: 12mm; }
            @media print {
              body { padding: 0; max-width: 100%; }
              img { max-width: 70px !important; max-height: 70px !important; width: 70px !important; height: 70px !important; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.print();
  };

  // Generate report for a single student (helper for bulk)
  const generateReportForStudent = async (studentId: string, termId: string): Promise<ReportData | null> => {
    const student = students.find(s => s.user_id === studentId);
    const term = terms.find(t => t.id === termId);
    
    if (!student || !term) return null;

    const { data: subjects } = await supabase
      .from('subjects')
      .select('*')
      .eq('class_name', student.current_class || '');

    const { data: scores } = await supabase
      .from('student_scores')
      .select('*')
      .eq('student_id', studentId)
      .eq('term_id', termId);

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, total_marks')
      .eq('class_name', student.current_class || '');

    const { data: submissions } = await supabase
      .from('task_submissions')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'submitted');

    const subjectData = (subjects || []).map(subject => {
      const subjectScores = (scores || []).filter(s => s.subject_id === subject.id);
      const taskScores = (submissions || [])
        .filter(sub => tasks?.find(t => t.id === sub.task_id))
        .map(sub => ({
          id: sub.id,
          score: sub.score,
          max_score: tasks?.find(t => t.id === sub.task_id)?.total_marks || 100,
          score_type: 'task',
          subject_id: subject.id,
          term_id: termId,
          task_id: sub.task_id,
        }));

      const allScores = [...subjectScores, ...taskScores];
      const validScores = allScores.filter(s => s.score !== null && s.max_score !== null);
      const average = validScores.length > 0
        ? validScores.reduce((sum, s) => sum + ((s.score || 0) / (s.max_score || 100) * 100), 0) / validScores.length
        : 0;

      return {
        subject,
        scores: allScores,
        average: Math.round(average * 10) / 10,
        grade: getGrade(average),
      };
    });

    const subjectsWithScores = subjectData.filter(s => s.scores.length > 0);
    const overallAverage = subjectsWithScores.length > 0
      ? subjectsWithScores.reduce((sum, s) => sum + s.average, 0) / subjectsWithScores.length
      : 0;

    const classmates = students.filter(s => s.current_class === student.current_class);

    return {
      student,
      term,
      subjects: subjectData,
      overallAverage: Math.round(overallAverage * 10) / 10,
      overallGrade: getGrade(overallAverage),
      totalStudents: classmates.length,
    };
  };

  // Generate single report card HTML
  const generateReportCardHtml = (data: ReportData, logoDataUrl: string): string => {
    const safeStudentName = escapeHtml(data.student.full_name || '');
    const safeStudentCard = escapeHtml(data.student.student_card || 'N/A');
    const safeClassName = escapeHtml(data.student.current_class || 'N/A');
    const safeTermName = escapeHtml(data.term.name || '');

    const subjectsHtml = data.subjects.map(subjectData => `
      <tr>
        <td style="font-weight: 500;">${escapeHtml(subjectData.subject.name)}</td>
        <td style="text-align: center; color: #718096;">${escapeHtml(subjectData.subject.code || '-')}</td>
        <td style="text-align: center;">${subjectData.scores.length}</td>
        <td style="text-align: center;">${subjectData.scores.length > 0 ? `${subjectData.average}%` : '-'}</td>
        <td style="text-align: center;">
          ${subjectData.scores.length > 0 ? `<span class="grade-${subjectData.grade.charAt(0)}">${subjectData.grade}</span>` : '-'}
        </td>
      </tr>
    `).join('');

    return `
      <div class="report-card" style="page-break-after: always; margin-bottom: 40px;">
        <div class="header" style="text-align: center; margin-bottom: 30px;">
          <img src="${logoDataUrl}" alt="School Logo" style="width: 80px; height: 80px; margin-bottom: 10px; object-fit: contain;" />
          <h1 style="margin: 0; font-size: 24px; color: #1a365d;">WORLD MISSION HIGH SCHOOL</h1>
          <h2 style="margin: 5px 0; font-size: 18px; color: #2d3748;">Student Report Card</h2>
          <p style="color: #718096; margin: 5px 0;">${safeTermName} - Academic Year ${data.term.year}</p>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 15px; background: #f7fafc; border-radius: 8px; margin-bottom: 20px;">
          <div style="text-align: center;">
            <p style="font-size: 12px; color: #718096; margin: 0;">Student Name</p>
            <p style="font-weight: 600; margin: 5px 0;">${safeStudentName}</p>
          </div>
          <div style="text-align: center;">
            <p style="font-size: 12px; color: #718096; margin: 0;">Student ID</p>
            <p style="font-weight: 600; margin: 5px 0;">${safeStudentCard}</p>
          </div>
          <div style="text-align: center;">
            <p style="font-size: 12px; color: #718096; margin: 0;">Class</p>
            <p style="font-weight: 600; margin: 5px 0;">${safeClassName}</p>
          </div>
          <div style="text-align: center;">
            <p style="font-size: 12px; color: #718096; margin: 0;">Term</p>
            <p style="font-weight: 600; margin: 5px 0;">Term ${data.term.term_number}</p>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="border: 1px solid #e2e8f0; padding: 12px; text-align: left; background: #edf2f7; font-weight: 600;">Subject</th>
              <th style="border: 1px solid #e2e8f0; padding: 12px; text-align: center; background: #edf2f7; font-weight: 600;">Code</th>
              <th style="border: 1px solid #e2e8f0; padding: 12px; text-align: center; background: #edf2f7; font-weight: 600;">Assessments</th>
              <th style="border: 1px solid #e2e8f0; padding: 12px; text-align: center; background: #edf2f7; font-weight: 600;">Average (%)</th>
              <th style="border: 1px solid #e2e8f0; padding: 12px; text-align: center; background: #edf2f7; font-weight: 600;">Grade</th>
            </tr>
          </thead>
          <tbody>
            ${subjectsHtml || '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #718096;">No subjects found</td></tr>'}
          </tbody>
        </table>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 20px; background: #ebf8ff; border-radius: 8px; margin-bottom: 20px;">
          <div style="text-align: center;">
            <p style="font-size: 14px; color: #718096; margin: 0;">Overall Average</p>
            <p style="font-size: 28px; font-weight: bold; color: #3182ce; margin: 5px 0;">${data.overallAverage}%</p>
          </div>
          <div style="text-align: center;">
            <p style="font-size: 14px; color: #718096; margin: 0;">Overall Grade</p>
            <p class="grade-${data.overallGrade.charAt(0)}" style="font-size: 28px; font-weight: bold; margin: 5px 0;">${data.overallGrade}</p>
          </div>
          <div style="text-align: center;">
            <p style="font-size: 14px; color: #718096; margin: 0;">Class Size</p>
            <p style="font-size: 28px; font-weight: bold; color: #718096; margin: 5px 0;">${data.totalStudents}</p>
          </div>
        </div>

        <div style="background: #f7fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="font-size: 14px; font-weight: 500; margin: 0 0 8px 0;">Grading Scale:</p>
          <p style="font-size: 12px; color: #718096; margin: 0;">
            <strong>A+:</strong> 90-100% | <strong>A:</strong> 80-89% | <strong>B:</strong> 70-79% | 
            <strong>C:</strong> 60-69% | <strong>D:</strong> 50-59% | <strong>F:</strong> Below 50%
          </p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; margin-top: 60px;">
          <div style="text-align: center;">
            <div style="border-top: 1px solid #000; margin-top: 50px; padding-top: 8px;">Class Teacher</div>
          </div>
          <div style="text-align: center;">
            <div style="border-top: 1px solid #000; margin-top: 50px; padding-top: 8px;">Principal</div>
          </div>
          <div style="text-align: center;">
            <div style="border-top: 1px solid #000; margin-top: 50px; padding-top: 8px;">Parent/Guardian</div>
          </div>
        </div>
      </div>
    `;
  };

  // Bulk generate report cards for entire class
  const handleBulkGenerate = async () => {
    if (!selectedTerm || selectedClass === 'all') {
      toast.error('Please select a specific class and term for bulk generation');
      return;
    }

    const classStudents = students.filter(s => s.current_class === selectedClass);
    if (classStudents.length === 0) {
      toast.error('No students found in this class');
      return;
    }

    setIsBulkGenerating(true);
    setBulkProgress(0);

    try {
      // Convert logo to data URL for embedding in PDF
      const logoResponse = await fetch(schoolLogo);
      const logoBlob = await logoResponse.blob();
      const logoDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(logoBlob);
      });

      const reportCards: string[] = [];
      
      for (let i = 0; i < classStudents.length; i++) {
        const student = classStudents[i];
        const report = await generateReportForStudent(student.user_id, selectedTerm);
        
        if (report) {
          reportCards.push(generateReportCardHtml(report, logoDataUrl));
        }
        
        setBulkProgress(Math.round(((i + 1) / classStudents.length) * 100));
      }

      // Open print window with all report cards
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('Please allow pop-ups to generate bulk report cards');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Bulk Report Cards - ${escapeHtml(selectedClass)}</title>
            <style>
              * { box-sizing: border-box; }
              body { font-family: Arial, sans-serif; padding: 20px; margin: 0; color: #2d3748; }
              img { max-width: 80px !important; max-height: 80px !important; width: 80px !important; height: 80px !important; object-fit: contain; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #e2e8f0; padding: 10px; }
              th { background: #edf2f7; font-weight: 600; }
              .grade-A { color: #38a169; font-weight: 600; }
              .grade-B { color: #3182ce; font-weight: 600; }
              .grade-C { color: #d69e2e; font-weight: 600; }
              .grade-D, .grade-F { color: #e53e3e; font-weight: 600; }
              @page { size: A4; margin: 12mm; }
              @media print {
                body { padding: 0; }
                .report-card { page-break-after: always; }
                .report-card:last-child { page-break-after: auto; }
                img { max-width: 70px !important; max-height: 70px !important; width: 70px !important; height: 70px !important; }
              }
            </style>
          </head>
          <body>
            ${reportCards.join('')}
          </body>
        </html>
      `);

      printWindow.document.close();
      
      toast.success(`Generated ${reportCards.length} report cards for ${selectedClass}`);
      
      // Trigger print dialog after a short delay
      setTimeout(() => {
        printWindow.print();
      }, 500);

    } catch (error) {
      console.error('Error generating bulk reports:', error);
      toast.error('Failed to generate bulk report cards');
    } finally {
      setIsBulkGenerating(false);
      setBulkProgress(0);
    }
  };

  const filteredStudents = selectedClass === 'all' 
    ? students 
    : students.filter(s => s.current_class === selectedClass);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Report Card Generator</h1>
          <p className="text-muted-foreground">Generate printable student report cards</p>
        </div>
        <div className="flex gap-2">
          {selectedClass !== 'all' && selectedTerm && (
            <Button 
              onClick={handleBulkGenerate} 
              variant="outline" 
              className="gap-2"
              disabled={isBulkGenerating}
            >
              {isBulkGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Users className="w-4 h-4" />
              )}
              {isBulkGenerating ? `${bulkProgress}%` : 'Bulk Generate Class'}
            </Button>
          )}
          {reportData && (
            <Button onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" />
              Print Report Card
            </Button>
          )}
        </div>
      </div>

      {/* Bulk Progress */}
      {isBulkGenerating && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <FileText className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Generating report cards for {selectedClass}...</p>
                <Progress value={bulkProgress} className="mt-2" />
              </div>
              <span className="text-sm font-medium">{bulkProgress}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selection Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Student & Term</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Filter by Class</label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger>
                  <SelectValue placeholder="All classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Student</label>
              <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                <SelectTrigger>
                  <SelectValue placeholder="Select student" />
                </SelectTrigger>
                <SelectContent>
                  {filteredStudents.map(s => (
                    <SelectItem key={s.user_id} value={s.user_id}>
                      {s.full_name} ({s.student_card || 'No ID'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Term</label>
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Report Card Preview */}
      {reportData && !isLoading && (
        <Card>
          <CardContent className="p-6">
            <div ref={printRef}>
              {/* Header */}
              <div className="text-center mb-8">
                <img src={schoolLogo} alt="School Logo" className="w-20 h-20 mx-auto mb-3 object-contain" />
                <h1 className="text-2xl font-bold text-primary">WORLD MISSION HIGH SCHOOL</h1>
                <h2 className="text-lg text-muted-foreground">Student Report Card</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {reportData.term.name} - Academic Year {reportData.term.year}
                </p>
              </div>

              {/* Student Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-secondary/30 rounded-lg mb-6">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <User className="w-3 h-3" /> Student Name
                  </p>
                  <p className="font-semibold">{reportData.student.full_name}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <GraduationCap className="w-3 h-3" /> Student ID
                  </p>
                  <p className="font-semibold">{reportData.student.student_card || 'N/A'}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <BookOpen className="w-3 h-3" /> Class
                  </p>
                  <p className="font-semibold">{reportData.student.current_class || 'N/A'}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Calendar className="w-3 h-3" /> Term
                  </p>
                  <p className="font-semibold">Term {reportData.term.term_number}</p>
                </div>
              </div>

              {/* Subject Scores Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-center">Code</TableHead>
                    <TableHead className="text-center">Assessments</TableHead>
                    <TableHead className="text-center">Average (%)</TableHead>
                    <TableHead className="text-center">Grade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.subjects.map(subjectData => (
                    <TableRow key={subjectData.subject.id}>
                      <TableCell className="font-medium">{subjectData.subject.name}</TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {subjectData.subject.code || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {subjectData.scores.length}
                      </TableCell>
                      <TableCell className="text-center">
                        {subjectData.scores.length > 0 ? `${subjectData.average}%` : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {subjectData.scores.length > 0 ? (
                          <Badge className={`${getGradeColor(subjectData.grade)}`}>
                            {subjectData.grade}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {reportData.subjects.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No subjects found for this class
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <Separator className="my-6" />

              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-primary/5 rounded-lg mb-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Overall Average</p>
                  <p className="text-3xl font-bold text-primary">{reportData.overallAverage}%</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Overall Grade</p>
                  <p className={`text-3xl font-bold ${getGradeColor(reportData.overallGrade)}`}>
                    {reportData.overallGrade}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Class Size</p>
                  <p className="text-3xl font-bold text-muted-foreground">
                    {reportData.totalStudents}
                  </p>
                </div>
              </div>

              {/* Grade Legend */}
              <div className="bg-secondary/30 p-4 rounded-lg mb-6">
                <p className="text-sm font-medium mb-2">Grading Scale:</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span><strong>A+:</strong> 90-100%</span>
                  <span><strong>A:</strong> 80-89%</span>
                  <span><strong>B:</strong> 70-79%</span>
                  <span><strong>C:</strong> 60-69%</span>
                  <span><strong>D:</strong> 50-59%</span>
                  <span><strong>F:</strong> Below 50%</span>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-8 mt-12">
                <div className="text-center">
                  <div className="border-t border-foreground pt-2 mt-12">
                    <p className="text-sm">Class Teacher</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="border-t border-foreground pt-2 mt-12">
                    <p className="text-sm">Principal</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="border-t border-foreground pt-2 mt-12">
                    <p className="text-sm">Parent/Guardian</p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center mt-8 text-xs text-muted-foreground">
                <p>Generated on {new Date().toLocaleDateString()}</p>
                <p>This is a computer-generated document.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!reportData && !isLoading && selectedStudent && selectedTerm && (
        <Card>
          <CardContent className="p-12 text-center">
            <Award className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No data found for the selected student and term.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
