import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FileText, Users, TrendingUp, AlertTriangle } from 'lucide-react';

interface Stats {
  totalStudents: number;
  totalTasks: number;
  totalSubmissions: number;
  averageScore: number;
  warningStats: { warnings: number; count: number }[];
  classStats: { class: string; students: number; avgScore: number }[];
  taskTypeStats: { type: string; count: number }[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))'];

export const ReportsModule = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [classes, setClasses] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, [selectedClass]);

  const fetchData = async () => {
    setLoading(true);

    // Fetch classes
    const { data: classData } = await supabase.from('classes').select('name');
    setClasses(classData?.map(c => c.name) || []);

    // Fetch students count
    let studentsQuery = supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student');
    if (selectedClass !== 'all') {
      studentsQuery = studentsQuery.eq('current_class', selectedClass);
    }
    const { count: studentCount } = await studentsQuery;

    // Fetch tasks count
    let tasksQuery = supabase.from('tasks').select('*', { count: 'exact', head: true });
    if (selectedClass !== 'all') {
      tasksQuery = tasksQuery.eq('class_name', selectedClass);
    }
    const { count: taskCount } = await tasksQuery;

    // Fetch submissions
    const { data: submissions } = await supabase.from('task_submissions').select('score, warnings, task_id, tasks(class_name)');
    
    const filteredSubmissions = selectedClass === 'all' 
      ? submissions 
      : submissions?.filter(s => (s.tasks as any)?.class_name === selectedClass);

    const avgScore = filteredSubmissions && filteredSubmissions.length > 0
      ? filteredSubmissions.filter(s => s.score !== null).reduce((a, b) => a + (b.score || 0), 0) / 
        filteredSubmissions.filter(s => s.score !== null).length
      : 0;

    // Warning distribution
    const warningCounts: { [key: number]: number } = {};
    filteredSubmissions?.forEach(s => {
      const w = s.warnings || 0;
      warningCounts[w] = (warningCounts[w] || 0) + 1;
    });
    const warningStats = Object.entries(warningCounts).map(([warnings, count]) => ({
      warnings: parseInt(warnings),
      count
    })).sort((a, b) => a.warnings - b.warnings);

    // Class stats
    const { data: profiles } = await supabase.from('profiles').select('current_class').eq('role', 'student');
    const classCounts: { [key: string]: number } = {};
    profiles?.forEach(p => {
      if (p.current_class) {
        classCounts[p.current_class] = (classCounts[p.current_class] || 0) + 1;
      }
    });
    const classStats = Object.entries(classCounts).map(([cls, students]) => ({
      class: cls,
      students,
      avgScore: 75 // Placeholder - would need more complex query
    })).slice(0, 5);

    // Task type stats
    const { data: tasks } = await supabase.from('tasks').select('task_type');
    const typeCounts: { [key: string]: number } = {};
    tasks?.forEach(t => {
      typeCounts[t.task_type] = (typeCounts[t.task_type] || 0) + 1;
    });
    const taskTypeStats = Object.entries(typeCounts).map(([type, count]) => ({ type, count }));

    setStats({
      totalStudents: studentCount || 0,
      totalTasks: taskCount || 0,
      totalSubmissions: filteredSubmissions?.length || 0,
      averageScore: avgScore,
      warningStats,
      classStats,
      taskTypeStats
    });

    setLoading(false);
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
          <h2 className="text-2xl font-bold text-foreground">Reports & Analytics</h2>
          <p className="text-muted-foreground">System-wide performance insights</p>
        </div>
        <Select value={selectedClass} onValueChange={setSelectedClass}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Students</p>
                <p className="text-2xl font-bold">{stats?.totalStudents}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-accent-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Tasks</p>
                <p className="text-2xl font-bold">{stats?.totalTasks}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-success" />
              <div>
                <p className="text-sm text-muted-foreground">Submissions</p>
                <p className="text-2xl font-bold">{stats?.totalSubmissions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-warning" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Score</p>
                <p className="text-2xl font-bold">{stats?.averageScore.toFixed(0)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Students per Class</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats?.classStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="class" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="students" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task Types Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats?.taskTypeStats}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ type, count }) => `${type}: ${count}`}
                >
                  {stats?.taskTypeStats.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Warning Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Warning Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Warnings</TableHead>
                <TableHead>Submissions</TableHead>
                <TableHead>Percentage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats?.warningStats.map((row) => (
                <TableRow key={row.warnings}>
                  <TableCell>
                    <Badge variant={row.warnings === 0 ? 'secondary' : row.warnings >= 3 ? 'destructive' : 'default'}>
                      {row.warnings} warnings
                    </Badge>
                  </TableCell>
                  <TableCell>{row.count}</TableCell>
                  <TableCell>
                    {stats.totalSubmissions > 0 
                      ? ((row.count / stats.totalSubmissions) * 100).toFixed(1)
                      : 0}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
