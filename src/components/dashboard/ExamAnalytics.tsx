import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, Users, AlertTriangle, Target, Award, BarChart3, Activity
} from 'lucide-react';
import { DateGroupFilter, DateRange, filterByDateRange } from './DateGroupFilter';

interface ExamStat {
  task_id: string;
  task_title: string;
  class_name: string;
  task_type: string;
  total_submissions: number;
  completed_submissions: number;
  in_progress: number;
  avg_score: number | null;
  avg_warnings: number | null;
  total_warnings: number | null;
  high_warning_count: number | null;
  completion_rate: number | null;
  created_at: string;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const WARNING_COLORS = ['hsl(142, 76%, 36%)', 'hsl(48, 96%, 53%)', 'hsl(0, 84%, 60%)'];

export const ExamAnalytics = () => {
  const [examStats, setExamStats] = useState<ExamStat[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');

  useEffect(() => {
    fetchAnalytics();
  }, [selectedClass]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    
    let tasksQuery = supabase.from('tasks').select('*');
    if (selectedClass !== 'all') {
      tasksQuery = tasksQuery.eq('class_name', selectedClass);
    }
    const { data: tasks } = await tasksQuery;
    const { data: subs } = await supabase.from('task_submissions').select('*');
    
    if (tasks && subs) {
      setAllSubmissions(subs);
      
      const stats: ExamStat[] = tasks.map(task => {
        const taskSubs = subs.filter(s => s.task_id === task.id);
        const completed = taskSubs.filter(s => s.status === 'submitted');
        const inProgress = taskSubs.filter(s => s.status === 'in_progress');
        const scores = completed.map(s => s.score).filter((s): s is number => s !== null);
        const warnings = taskSubs.map(s => s.warnings).filter((w): w is number => w !== null);
        
        return {
          task_id: task.id,
          task_title: task.title,
          class_name: task.class_name,
          task_type: task.task_type,
          total_submissions: taskSubs.length,
          completed_submissions: completed.length,
          in_progress: inProgress.length,
          avg_score: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null,
          avg_warnings: warnings.length > 0 ? Math.round(warnings.reduce((a, b) => a + b, 0) / warnings.length * 10) / 10 : null,
          total_warnings: warnings.reduce((a, b) => a + b, 0),
          high_warning_count: taskSubs.filter(s => (s.warnings || 0) >= 3).length,
          completion_rate: taskSubs.length > 0 ? Math.round(completed.length / taskSubs.length * 100) : null,
          created_at: task.created_at,
        };
      });
      
      setExamStats(stats);
      const uniqueClasses = [...new Set(tasks.map(t => t.class_name))];
      setClasses(uniqueClasses);
    }
    
    setIsLoading(false);
  };

  // Apply date filter
  const filteredStats = filterByDateRange(examStats, dateRange);

  // Overall stats from filtered data
  const totalExams = filteredStats.length;
  const totalSubmissionsCount = filteredStats.reduce((a, b) => a + b.total_submissions, 0);
  const completedCount = filteredStats.reduce((a, b) => a + b.completed_submissions, 0);
  const avgCompletionRate = filteredStats.length > 0 
    ? Math.round(filteredStats.filter(e => e.completion_rate !== null).reduce((a, b) => a + (b.completion_rate || 0), 0) / Math.max(filteredStats.filter(e => e.completion_rate !== null).length, 1))
    : 0;
  const totalWarnings = filteredStats.reduce((a, b) => a + (b.total_warnings || 0), 0);

  // Warning distribution from ALL submissions of filtered tasks
  const filteredTaskIds = new Set(filteredStats.map(s => s.task_id));
  const relevantSubs = allSubmissions.filter(s => filteredTaskIds.has(s.task_id));
  
  const warningData = [
    { range: '0 Warnings', count: relevantSubs.filter(s => (s.warnings || 0) === 0).length, color: WARNING_COLORS[0] },
    { range: '1-2 Warnings', count: relevantSubs.filter(s => (s.warnings || 0) >= 1 && (s.warnings || 0) <= 2).length, color: WARNING_COLORS[1] },
    { range: '3+ Warnings', count: relevantSubs.filter(s => (s.warnings || 0) >= 3).length, color: WARNING_COLORS[2] },
  ].filter(d => d.count > 0);

  // Score distribution from all relevant submissions
  const scoredSubs = relevantSubs.filter(s => s.score !== null && s.status === 'submitted');
  const scoreDistribution = [
    { range: '0-20%', count: scoredSubs.filter(s => s.score >= 0 && s.score <= 20).length, fill: 'hsl(0, 84%, 60%)' },
    { range: '21-40%', count: scoredSubs.filter(s => s.score > 20 && s.score <= 40).length, fill: 'hsl(25, 95%, 53%)' },
    { range: '41-60%', count: scoredSubs.filter(s => s.score > 40 && s.score <= 60).length, fill: 'hsl(48, 96%, 53%)' },
    { range: '61-80%', count: scoredSubs.filter(s => s.score > 60 && s.score <= 80).length, fill: 'hsl(142, 71%, 45%)' },
    { range: '81-100%', count: scoredSubs.filter(s => s.score > 80 && s.score <= 100).length, fill: 'hsl(142, 76%, 36%)' },
  ];

  // Completion pie chart
  const completionData = [
    { name: 'Completed', value: completedCount, color: 'hsl(142, 76%, 36%)' },
    { name: 'In Progress', value: totalSubmissionsCount - completedCount, color: 'hsl(48, 96%, 53%)' },
  ].filter(d => d.value > 0);

  // Performance by exam type
  const examTypeData = ['exam', 'quiz', 'assignment', 'test'].map(type => {
    const exams = filteredStats.filter(e => e.task_type === type);
    const avgScore = exams.length > 0 
      ? exams.filter(e => e.avg_score !== null).reduce((a, b) => a + (b.avg_score || 0), 0) / Math.max(exams.filter(e => e.avg_score !== null).length, 1)
      : 0;
    return { type: type.charAt(0).toUpperCase() + type.slice(1), avgScore: Math.round(avgScore * 10) / 10, count: exams.length };
  }).filter(d => d.count > 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Exam Analytics</h2>
          <p className="text-sm text-muted-foreground">Performance insights and warning patterns</p>
        </div>
        <div className="flex gap-2">
          <DateGroupFilter value={dateRange} onChange={setDateRange} />
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Exams</p>
                <p className="text-2xl font-bold mt-1">{totalExams}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-chart-2/5 to-chart-2/10 border-chart-2/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Submissions</p>
                <p className="text-2xl font-bold mt-1">{totalSubmissionsCount}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-chart-2/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-chart-2" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-chart-3/5 to-chart-3/10 border-chart-3/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Completion</p>
                <p className="text-2xl font-bold mt-1">{avgCompletionRate}%</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-chart-3/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-chart-3" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-destructive/5 to-destructive/10 border-destructive/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Warnings</p>
                <p className="text-2xl font-bold mt-1 text-destructive">{totalWarnings}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completion Rate by Exam */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Completion Rates
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={filteredStats.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="task_title" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={70} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="completion_rate" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Completion %" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No exam data in this period</div>
            )}
          </CardContent>
        </Card>

        {/* Warning Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Warning Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {warningData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={warningData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="count" nameKey="range"
                    label={({ range, count, percent }) => `${range}: ${count} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={true}
                  >
                    {warningData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No warning data available</div>
            )}
          </CardContent>
        </Card>

        {/* Score Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4 text-chart-4" />
              Score Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {scoredSubs.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                    {scoreDistribution.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No scores recorded yet</div>
            )}
          </CardContent>
        </Card>

        {/* Completion Overview Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-chart-1" />
              Submission Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {completionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={completionData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" nameKey="name"
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={true}
                  >
                    {completionData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No submissions yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Exam Performance Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Exam Performance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Submissions</TableHead>
                  <TableHead className="text-center">Completed</TableHead>
                  <TableHead className="text-center">Avg Score</TableHead>
                  <TableHead className="text-center">Warnings</TableHead>
                  <TableHead className="text-center">Completion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStats.map(exam => (
                  <TableRow key={exam.task_id}>
                    <TableCell className="font-medium max-w-[160px] truncate">{exam.task_title}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{exam.class_name}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs capitalize">{exam.task_type}</Badge></TableCell>
                    <TableCell className="text-center">{exam.total_submissions}</TableCell>
                    <TableCell className="text-center font-medium text-chart-1">{exam.completed_submissions}</TableCell>
                    <TableCell className="text-center">{exam.avg_score !== null ? `${exam.avg_score}%` : '—'}</TableCell>
                    <TableCell className="text-center">
                      <span className={exam.avg_warnings && exam.avg_warnings >= 2 ? 'text-destructive font-medium' : ''}>
                        {exam.avg_warnings !== null ? exam.avg_warnings.toFixed(1) : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {exam.completion_rate !== null ? (
                        <Badge variant={exam.completion_rate >= 80 ? 'default' : exam.completion_rate >= 50 ? 'secondary' : 'destructive'} className="text-xs">
                          {exam.completion_rate}%
                        </Badge>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredStats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No exam data available</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
