import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveClass } from '@/contexts/ActiveClassContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Loader2, FileSpreadsheet, Plus, Trophy, Lock, Trash2, WifiOff, Check, RotateCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useGradingEngine } from '@/grading-engine';
import { activityCellKey, termCellKey, type SaveState } from '@/grading-engine/types';

interface Term {
  id: string;
  name: string;
  term_number: number;
  year: number;
  is_active: boolean;
}

interface Subject {
  id: string;
  name: string;
  code: string | null;
  class_name: string;
  module: string | null;
  level: number | null;
  teacher_id: string | null;
}

const CellStatus = ({ state, error, onRetry }: { state?: SaveState; error?: string; onRetry: () => void }) => {
  if (!state || state === 'idle') return null;
  if (state === 'saved') return <Check className="h-3 w-3 absolute -right-1 top-0 text-success" aria-label="Saved" />;
  if (state === 'offline') return <WifiOff className="h-3 w-3 absolute -right-1 top-0 text-muted-foreground" aria-label="Waiting for connection" />;
  if (state === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        title={error || 'Save failed — click to retry'}
        aria-label={error || 'Save failed, retry'}
        className="absolute -right-1 top-0 text-destructive"
      >
        <AlertCircle className="h-3 w-3" />
      </button>
    );
  }
  if (state === 'retrying') return <RotateCw className="h-3 w-3 animate-spin absolute -right-1 top-0 text-amber-500" aria-label="Retrying" />;
  return <Loader2 className="h-3 w-3 animate-spin absolute -right-1 top-0 text-primary" aria-label="Saving" />;
};

export const GradingSheet = () => {
  const { user, role } = useAuth();
  const { activeClass } = useActiveClass();
  const [terms, setTerms] = useState<Term[]>([]);
  const [mySubjects, setMySubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [showAddActivity, setShowAddActivity] = useState(false);
  const [newActivityLabel, setNewActivityLabel] = useState('');
  const [newActivityMax, setNewActivityMax] = useState(20);
  const [addingActivity, setAddingActivity] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  const canEdit = isTeacher;

  const engine = useGradingEngine({
    className: activeClass ?? null,
    subjectId: selectedSubject,
    termId: selectedTerm,
    enabled: Boolean(activeClass && selectedSubject && selectedTerm),
    canEdit,
  });

  useEffect(() => { void fetchTerms(); }, []);

  useEffect(() => {
    setSelectedSubject('');
    if (activeClass) void fetchSubjects();
    else setLoadingMeta(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClass, user?.id]);

  const fetchTerms = async () => {
    const { data } = await supabase.from('terms').select('*').order('year', { ascending: false }).order('term_number');
    if (data) {
      setTerms(data as Term[]);
      const active = data.find(t => t.is_active);
      if (active) setSelectedTerm(active.id);
      else if (data.length > 0) setSelectedTerm(data[0].id);
    }
  };

  const fetchSubjects = async () => {
    if (!activeClass) return;
    setLoadingMeta(true);
    const { data } = await supabase.from('subjects').select('*').eq('class_name', activeClass).order('name');
    const subs = (data || []) as Subject[];
    if (isAdmin) setMySubjects(subs);
    else if (isTeacher && user?.id) setMySubjects(subs.filter(s => s.teacher_id === user.id));
    else setMySubjects([]);
    setLoadingMeta(false);
  };

  const handleAddActivity = async () => {
    if (!newActivityLabel.trim() || !user?.id) return;
    if (newActivityMax <= 0) { toast.error('Maximum score must be greater than 0'); return; }
    setAddingActivity(true);
    const ok = await engine.addActivity(newActivityLabel, newActivityMax, user.id);
    setAddingActivity(false);
    if (!ok) { toast.error(engine.errors.__activity || 'Could not add the activity'); return; }
    toast.success(`Activity "${newActivityLabel.trim()}" added (/${newActivityMax})`);
    setNewActivityLabel('');
    setNewActivityMax(20);
    setShowAddActivity(false);
  };

  const confirmDeleteActivity = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await engine.deleteActivity(deleteTarget.id);
    setDeleting(false);
    if (ok) toast.success(`Activity "${deleteTarget.label}" removed`);
    else toast.error(engine.errors.__activity || 'Could not remove the activity');
    setDeleteTarget(null);
  };

  const currentSubjectName = mySubjects.find(s => s.id === selectedSubject)?.name || '';
  const loading = engine.loading;

  if (loadingMeta && terms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            Grading Sheet
            {isAdmin && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Lock className="h-3 w-3" /> View Only
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">
            {activeClass
              ? isAdmin
                ? `${activeClass} — Viewing all subject grades (read-only)`
                : `${activeClass} — Grade your assigned subjects`
              : 'Select a class to begin'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!engine.online && (
            <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600">
              <WifiOff className="h-3 w-3" /> Offline — changes saved here
            </Badge>
          )}
          {engine.pendingCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {engine.pendingCount} unsaved
            </Badge>
          )}
          {selectedSubject && mySubjects.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setSelectedSubject('')}>
              ← All subjects
            </Button>
          )}
          {selectedSubject && mySubjects.length > 0 && (
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="w-[180px] h-9 text-sm">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {mySubjects.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} {s.code ? `(${s.code})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canEdit && selectedSubject && (
            <Dialog open={showAddActivity} onOpenChange={setShowAddActivity}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Plus className="h-3 w-3" /> Activity
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Add Activity Column</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Activity Name</Label>
                    <Input
                      value={newActivityLabel}
                      onChange={e => setNewActivityLabel(e.target.value)}
                      placeholder="e.g., Quiz 1, Assignment, Lab"
                    />
                  </div>
                  <div>
                    <Label>Maximum Score (/max)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={newActivityMax}
                      onChange={e => setNewActivityMax(Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Date/time recorded automatically. Counts toward total &amp; average.
                    </p>
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setShowAddActivity(false)} disabled={addingActivity}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddActivity} disabled={!newActivityLabel.trim() || addingActivity}>
                    {addingActivity && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Add Column
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {mySubjects.length === 0 && !loadingMeta ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {isAdmin
                ? `No subjects configured for ${activeClass || 'this class'}.`
                : 'No subjects assigned to you for this class. Ask an admin to assign subjects.'}
            </p>
          </CardContent>
        </Card>
      ) : terms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No terms found. Create a term first.</p>
          </CardContent>
        </Card>
      ) : !selectedSubject ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {isAdmin ? 'All Subjects' : 'Your Assigned Subjects'} — Click to open
            </h2>
            <Badge variant="outline">{mySubjects.length} subject{mySubjects.length !== 1 ? 's' : ''}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {mySubjects.map(s => (
              <Card
                key={s.id}
                className="cursor-pointer hover:border-primary hover:shadow-md transition-all group"
                onClick={() => setSelectedSubject(s.id)}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{s.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.code && <Badge variant="outline" className="text-[10px]">{s.code}</Badge>}
                      {s.module && <Badge variant="secondary" className="text-[10px]">{s.module}</Badge>}
                      {s.level && <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30">L{s.level}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{s.class_name}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Tabs value={selectedTerm} onValueChange={setSelectedTerm}>
          <TabsList className="flex flex-wrap gap-1 h-auto p-1">
            {terms.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="text-xs">
                {t.name} {t.is_active && <Badge className="ml-1 text-[9px] h-4 px-1">Active</Badge>}
              </TabsTrigger>
            ))}
          </TabsList>

          {terms.map(term => (
            <TabsContent key={term.id} value={term.id}>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>{term.name} — {activeClass} — {currentSubjectName}</span>
                      <Badge variant="outline" className="text-xs">
                        {engine.students.length} students • {engine.columns.length} activities
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="w-full">
                      <div className="min-w-[600px]">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="w-8 text-center sticky left-0 bg-muted/50 z-10">#</TableHead>
                              <TableHead className="min-w-[140px] sticky left-8 bg-muted/50 z-10">Student</TableHead>
                              <TableHead className="text-center min-w-[80px] text-xs">
                                <div>Term</div>
                                <div className="text-[10px] text-muted-foreground font-normal">/100</div>
                              </TableHead>
                              {engine.columns.map(col => (
                                <TableHead key={col.id} className="text-center min-w-[90px] text-xs">
                                  <div className="flex items-center justify-center gap-1">
                                    <span className="truncate max-w-[70px]" title={col.label}>{col.label}</span>
                                    {canEdit && (
                                      <button
                                        onClick={() => setDeleteTarget({ id: col.id, label: col.label })}
                                        className="text-destructive/60 hover:text-destructive"
                                        title="Delete activity"
                                        aria-label={`Delete activity ${col.label}`}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-normal">
                                    /{col.max_score} • {format(new Date(col.activity_date), 'MMM d')}
                                  </div>
                                </TableHead>
                              ))}
                              <TableHead className="text-center min-w-[70px] text-xs">
                                <div>Avg</div>
                                <div className="text-[10px] text-muted-foreground font-normal">%</div>
                              </TableHead>
                              <TableHead className="text-center min-w-[50px]">
                                <Trophy className="h-4 w-4 mx-auto" />
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {engine.rows.map((row, idx) => {
                              const tKey = termCellKey(row.student.user_id);
                              const tCell = engine.cells[tKey];
                              return (
                                <TableRow key={row.student.user_id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                                  <TableCell className="text-center text-xs text-muted-foreground sticky left-0 bg-inherit z-10">
                                    {idx + 1}
                                  </TableCell>
                                  <TableCell className="font-medium text-xs sticky left-8 bg-inherit z-10">
                                    <div className="truncate max-w-[130px]">{row.student.full_name}</div>
                                  </TableCell>
                                  <TableCell className="text-center p-1">
                                    <div className="relative">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={tCell?.draft ?? (row.termScore !== null ? String(row.termScore) : '')}
                                        onChange={(e) => engine.setScore(tKey, e.target.value)}
                                        disabled={!canEdit}
                                        aria-label={`Term score for ${row.student.full_name}`}
                                        className={cn(
                                          'h-7 text-xs text-center w-16 mx-auto px-1',
                                          engine.saveStates[tKey] === 'error' && 'border-destructive',
                                          row.termScore !== null && !tCell?.draft && 'bg-muted/30',
                                          !canEdit && 'cursor-not-allowed opacity-70',
                                        )}
                                        placeholder="-"
                                      />
                                      <CellStatus
                                        state={engine.saveStates[tKey]}
                                        error={engine.errors[tKey]}
                                        onRetry={() => engine.retry(tKey)}
                                      />
                                    </div>
                                  </TableCell>
                                  {engine.columns.map(col => {
                                    const aKey = activityCellKey(col.id, row.student.user_id);
                                    const aCell = engine.cells[aKey];
                                    const aVal = row.activityScores[col.id];
                                    return (
                                      <TableCell key={col.id} className="text-center p-1">
                                        <div className="relative">
                                          <Input
                                            type="number"
                                            min={0}
                                            max={col.max_score}
                                            value={aCell?.draft ?? (aVal !== null && aVal !== undefined ? String(aVal) : '')}
                                            onChange={(e) => engine.setScore(aKey, e.target.value)}
                                            disabled={!canEdit}
                                            aria-label={`${col.label} score for ${row.student.full_name}`}
                                            className={cn(
                                              'h-7 text-xs text-center w-16 mx-auto px-1',
                                              engine.saveStates[aKey] === 'error' && 'border-destructive',
                                              aVal !== null && aVal !== undefined && !aCell?.draft && 'bg-muted/30',
                                              !canEdit && 'cursor-not-allowed opacity-70',
                                            )}
                                            placeholder="-"
                                          />
                                          <CellStatus
                                            state={engine.saveStates[aKey]}
                                            error={engine.errors[aKey]}
                                            onRetry={() => engine.retry(aKey)}
                                          />
                                        </div>
                                      </TableCell>
                                    );
                                  })}
                                  <TableCell className="text-center text-xs font-semibold">
                                    {row.gradedCount > 0 ? `${row.average}%` : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant={row.position > 0 && row.position <= 3 ? 'default' : 'outline'} className="text-xs">
                                      {row.position > 0 ? row.position : '-'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete activity?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.label}" and every score recorded in it will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmDeleteActivity(); }} disabled={deleting}>
              {deleting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default GradingSheet;
