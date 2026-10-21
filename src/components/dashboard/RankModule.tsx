import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, Award, Target } from 'lucide-react';
import { percentageOf, rank, type ComputedRow, type StudentRecord } from '@/grading-engine';

interface Term {
  id: string;
  name: string;
  term_number: number;
  year: number;
  is_active: boolean;
}

interface SubjectScore {
  subject_name: string;
  scores: number[];
  maxes: number[];
  total: number;
  maxTotal: number;
  average: number;
  percentage: number;
}

interface RankData {
  position: number;
  total_students: number;
  overall_average: number;
  subject_scores: SubjectScore[];
}

export const RankModule = () => {
  const { user, profile } = useAuth();
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [rankData, setRankData] = useState<RankData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTerms = async () => {
      const { data } = await supabase
        .from('terms')
        .select('*')
        .order('year', { ascending: false })
        .order('term_number', { ascending: false });

      if (data) {
        setTerms(data as Term[]);
        const activeTerm = data.find(t => t.is_active) || data[0];
        if (activeTerm) setSelectedTerm(activeTerm.id);
      }
      setLoading(false);
    };
    void fetchTerms();
  }, []);

  const fetchRankData = useCallback(async () => {
    if (!user || !profile?.current_class || !selectedTerm) return;

    // Classmates (same class) — used to rank with the shared computation.
    const { data: classmates } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .eq('current_class', profile.current_class)
      .eq('role', 'student');

    const studentIds = (classmates ?? []).map(c => c.user_id);
    if (!studentIds.includes(user.id)) studentIds.push(user.id);

    // All scores for the class in this term (RLS may limit rows to what the
    // student is allowed to see — ranking then falls back to what is visible).
    const { data: allScores } = await supabase
      .from('student_scores')
      .select('student_id, score, max_score, subject_id, subjects:subject_id (name)')
      .in('student_id', studentIds)
      .eq('term_id', selectedTerm);

    type Row = {
      student_id: string;
      score: number | string | null;
      max_score: number | string | null;
      subject_id: string;
      subjects: { name: string } | null;
    };
    const rows = (allScores ?? []) as unknown as Row[];

    const byStudent = new Map<string, Array<{ score: number | null; max: number }>>();
    for (const r of rows) {
      const list = byStudent.get(r.student_id) ?? [];
      list.push({
        score: r.score === null || r.score === undefined ? null : Number(r.score),
        max: r.max_score === null || r.max_score === undefined ? 100 : Number(r.max_score),
      });
      byStudent.set(r.student_id, list);
    }

    const base: ComputedRow[] = studentIds.map(id => {
      const parts = byStudent.get(id) ?? [];
      const graded = parts.filter(p => p.score !== null);
      const student: StudentRecord = {
        user_id: id,
        full_name: classmates?.find(c => c.user_id === id)?.full_name ?? '',
        student_card: '',
      };
      return {
        student,
        termScore: null,
        activityScores: {},
        total: graded.reduce((a, b) => a + (b.score as number), 0),
        maxTotal: graded.reduce((a, b) => a + b.max, 0),
        average: percentageOf(parts),
        gradedCount: graded.length,
        position: 0,
      };
    });

    const ranked = rank(base);
    const mine = ranked.find(r => r.student.user_id === user.id);

    // Per-subject breakdown for the signed-in student only.
    const subjectMap = new Map<string, { scores: number[]; maxes: number[] }>();
    for (const r of rows) {
      if (r.student_id !== user.id) continue;
      const name = r.subjects?.name || 'Unknown';
      const entry = subjectMap.get(name) ?? { scores: [], maxes: [] };
      entry.scores.push(Number(r.score ?? 0));
      entry.maxes.push(r.max_score === null || r.max_score === undefined ? 100 : Number(r.max_score));
      subjectMap.set(name, entry);
    }

    const subjectScores: SubjectScore[] = [];
    subjectMap.forEach((entry, subject_name) => {
      const total = entry.scores.reduce((a, b) => a + b, 0);
      const maxTotal = entry.maxes.reduce((a, b) => a + b, 0);
      subjectScores.push({
        subject_name,
        scores: entry.scores,
        maxes: entry.maxes,
        total,
        maxTotal,
        average: entry.scores.length ? total / entry.scores.length : 0,
        percentage: percentageOf(entry.scores.map((s, i) => ({ score: s, max: entry.maxes[i] }))),
      });
    });

    setRankData({
      position: mine?.position ?? 0,
      total_students: ranked.filter(r => r.gradedCount > 0).length || studentIds.length,
      overall_average: mine?.average ?? 0,
      subject_scores: subjectScores,
    });
  }, [user, profile?.current_class, selectedTerm]);

  useEffect(() => {
    if (selectedTerm && user) void fetchRankData();
  }, [selectedTerm, user, fetchRankData]);

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
          <h2 className="text-2xl font-bold text-foreground">Academic Rank</h2>
          <p className="text-muted-foreground">Your performance and position</p>
        </div>
        <Select value={selectedTerm} onValueChange={setSelectedTerm}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select Term" />
          </SelectTrigger>
          <SelectContent>
            {terms.map(term => (
              <SelectItem key={term.id} value={term.id}>
                {term.name} ({term.year})
                {term.is_active && <Badge className="ml-2" variant="secondary">Active</Badge>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/20">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Position</p>
                <p className="text-2xl font-bold text-foreground">
                  {rankData?.position ? `${rankData.position}/${rankData.total_students}` : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-accent/20">
                <TrendingUp className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overall Average</p>
                <p className="text-2xl font-bold text-foreground">
                  {(rankData?.overall_average ?? 0).toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-success/20">
                <Award className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Subjects</p>
                <p className="text-2xl font-bold text-foreground">
                  {rankData?.subject_scores.length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/50 to-secondary/30 border-secondary/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-secondary">
                <Target className="w-5 h-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Class</p>
                <p className="text-lg font-bold text-foreground truncate">
                  {profile?.current_class || 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subject Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Subject Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rankData?.subject_scores && rankData.subject_scores.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-center">Score 1</TableHead>
                  <TableHead className="text-center">Score 2</TableHead>
                  <TableHead className="text-center">Score 3</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Average</TableHead>
                  <TableHead className="text-center">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankData.subject_scores.map((subject, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{subject.subject_name}</TableCell>
                    {[0, 1, 2].map(i => (
                      <TableCell key={i} className="text-center">
                        {subject.scores[i] !== undefined ? `${subject.scores[i]}/${subject.maxes[i]}` : '-'}
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-medium">
                      {subject.total.toFixed(0)}/{subject.maxTotal.toFixed(0)}
                    </TableCell>
                    <TableCell className="text-center">{subject.average.toFixed(1)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={subject.percentage >= 50 ? 'default' : 'destructive'}>
                        {subject.percentage.toFixed(0)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No scores recorded for this term yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
