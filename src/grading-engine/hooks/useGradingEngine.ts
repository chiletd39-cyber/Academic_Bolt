/**
 * Single React entry point for the grading sheet.
 * Owns loading, the versioned score store, the save queue, offline drafts and
 * the derived (memoized) computation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { rpcCall } from '@/exam-engine/network/RpcClient';
import { ScoreStore } from '../store/ScoreStore';
import { SaveQueue } from '../queue/SaveQueue';
import { computeRows } from '../computation';
import { toGradingError, toUserFacing } from '../errors/GradingError';
import {
  activityCellKey,
  parseCellKey,
  termCellKey,
  type ActivityColumn,
  type Cell,
  type GradingSnapshot,
  type SaveState,
  type StudentRecord,
} from '../types';

const DRAFT_PREFIX = 'wmhs:grading-draft:';

interface Params {
  className: string | null;
  subjectId: string;
  termId: string;
  enabled: boolean;
  canEdit: boolean;
}

interface EngineApi extends GradingSnapshot {
  setScore: (key: string, raw: string) => void;
  retry: (key: string) => void;
  flush: () => void;
  reload: () => Promise<void>;
  addActivity: (label: string, maxScore: number, teacherId: string) => Promise<boolean>;
  deleteActivity: (columnId: string) => Promise<boolean>;
  maxFor: (key: string) => number;
}

export function useGradingEngine({ className, subjectId, termId, enabled, canEdit }: Params): EngineApi {
  const storeRef = useRef<ScoreStore>();
  if (!storeRef.current) storeRef.current = new ScoreStore();
  const store = storeRef.current;

  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [columns, setColumns] = useState<ActivityColumn[]>([]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const columnsRef = useRef<ActivityColumn[]>([]);
  columnsRef.current = columns;
  const ctxRef = useRef({ subjectId, termId });
  ctxRef.current = { subjectId, termId };

  const draftKey = className && subjectId && termId ? `${DRAFT_PREFIX}${className}:${subjectId}:${termId}` : '';

  useEffect(() => store.subscribe(() => setCells(store.snapshot())), [store]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const maxFor = useCallback((key: string): number => {
    const ref = parseCellKey(key);
    if (ref.kind === 'term') return 100;
    return columnsRef.current.find(c => c.id === ref.columnId)?.max_score ?? 100;
  }, []);

  /** Idempotent write: both RPCs upsert on the cell's natural key. */
  const writer = useCallback(async (key: string, value: number | null) => {
    const ref = parseCellKey(key);
    const { subjectId: sid, termId: tid } = ctxRef.current;
    if (ref.kind === 'term') {
      const res = await rpcCall(
        () => supabase.rpc('upsert_term_score', {
          _student_id: ref.studentId,
          _subject_id: sid,
          _term_id: tid,
          _score: value,
          _max_score: 100,
        }),
        { key: `grade:${key}`, retries: 2, dedupe: false, timeoutMs: 15_000 },
      );
      if (res.error) throw res.error;
    } else {
      const res = await rpcCall(
        () => supabase.rpc('upsert_activity_score', {
          _column_id: ref.columnId,
          _student_id: ref.studentId,
          _score: value,
        }),
        { key: `grade:${key}`, retries: 2, dedupe: false, timeoutMs: 15_000 },
      );
      if (res.error) throw res.error;
    }
    store.clearDraft(key);
    setLastSyncedAt(Date.now());
  }, [store]);

  const queueRef = useRef<SaveQueue>();
  if (!queueRef.current) {
    queueRef.current = new SaveQueue((k, v) => writer(k, v), {
      onState: (key, state, error) => {
        setSaveStates(prev => ({ ...prev, [key]: state }));
        setErrors(prev => {
          if (state === 'error' && error) return { ...prev, [key]: error };
          if (key in prev) { const n = { ...prev }; delete n[key]; return n; }
          return prev;
        });
        if (state === 'saved') {
          setTimeout(() => setSaveStates(prev => {
            if (prev[key] !== 'saved') return prev;
            const n = { ...prev }; delete n[key]; return n;
          }), 1500);
        }
      },
      onPendingChange: setPendingCount,
    });
  }
  const queue = queueRef.current;

  useEffect(() => () => { queue.dispose(); }, [queue]);

  // Persist unsaved drafts so a refresh or a 2-minute drop never loses input.
  useEffect(() => {
    if (!draftKey) return;
    const drafts = store.drafts();
    try {
      if (Object.keys(drafts).length) localStorage.setItem(draftKey, JSON.stringify(drafts));
      else localStorage.removeItem(draftKey);
    } catch { /* storage full or unavailable — drafts stay in memory */ }
  }, [cells, draftKey, store]);

  const load = useCallback(async () => {
    if (!enabled || !className || !subjectId || !termId) return;
    setLoading(true);
    try {
      const [studentsRes, termScoresRes, columnsRes, actScoresRes] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, student_card')
          .eq('current_class', className).eq('role', 'student').order('full_name'),
        supabase.from('student_scores').select('student_id, score')
          .eq('term_id', termId).eq('subject_id', subjectId).eq('score_type', 'term').is('task_id', null),
        supabase.from('grading_columns').select('id, label, max_score, activity_date')
          .eq('subject_id', subjectId).eq('term_id', termId).order('activity_date'),
        supabase.from('activity_scores')
          .select('column_id, student_id, score, grading_columns!inner(subject_id, term_id)')
          .eq('grading_columns.subject_id', subjectId).eq('grading_columns.term_id', termId),
      ]);

      const firstError = studentsRes.error || termScoresRes.error || columnsRes.error || actScoresRes.error;
      if (firstError) throw firstError;

      const cols = (columnsRes.data ?? []) as ActivityColumn[];
      const studentList = (studentsRes.data ?? []).map(s => ({
        user_id: s.user_id,
        full_name: s.full_name,
        student_card: s.student_card ?? '',
      })) as StudentRecord[];

      const serverCells: Record<string, number | null> = {};
      for (const s of studentList) {
        serverCells[termCellKey(s.user_id)] = null;
        for (const c of cols) serverCells[activityCellKey(c.id, s.user_id)] = null;
      }
      for (const r of termScoresRes.data ?? []) {
        serverCells[termCellKey(r.student_id)] = r.score === null ? null : Number(r.score);
      }
      for (const r of (actScoresRes.data ?? []) as Array<{ column_id: string; student_id: string; score: number | null }>) {
        serverCells[activityCellKey(r.column_id, r.student_id)] = r.score === null ? null : Number(r.score);
      }

      setStudents(studentList);
      setColumns(cols);
      columnsRef.current = cols;
      store.hydrate(serverCells);

      // Freshest-wins: re-apply any locally unsaved drafts on top of server state.
      if (draftKey) {
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            const drafts = JSON.parse(raw) as Record<string, string>;
            if (drafts && Object.keys(drafts).length) {
              store.restoreDrafts(drafts);
              for (const [k, text] of Object.entries(drafts)) {
                if (canEdit) queue.enqueue(k, text === '' ? null : Number(text));
              }
            }
          }
        } catch { /* corrupt draft — ignore */ }
      }
      setLastSyncedAt(Date.now());
    } catch (err) {
      setErrors(prev => ({ ...prev, __load: toUserFacing(toGradingError(err)) }));
    } finally {
      setLoading(false);
    }
  }, [enabled, className, subjectId, termId, draftKey, store, queue, canEdit]);

  useEffect(() => { void load(); }, [load]);

  // Resync authoritative state when the connection comes back.
  useEffect(() => {
    const onRecover = () => { void load(); };
    window.addEventListener('network:recovered', onRecover);
    return () => window.removeEventListener('network:recovered', onRecover);
  }, [load]);

  const setScore = useCallback((key: string, raw: string) => {
    if (!canEdit) return;
    const trimmed = raw.trim();
    if (trimmed === '') {
      store.setLocal(key, null, '');
      queue.enqueue(key, null);
      return;
    }
    const num = Number(trimmed);
    if (Number.isNaN(num) || num < 0) {
      setErrors(prev => ({ ...prev, [key]: 'Enter a number of 0 or more.' }));
      setSaveStates(prev => ({ ...prev, [key]: 'error' }));
      return;
    }
    const max = maxFor(key);
    if (num > max) {
      setErrors(prev => ({ ...prev, [key]: `Maximum for this column is ${max}.` }));
      setSaveStates(prev => ({ ...prev, [key]: 'error' }));
      store.setLocal(key, num, trimmed);
      return;
    }
    store.setLocal(key, num, trimmed);
    queue.enqueue(key, num);
  }, [canEdit, maxFor, queue, store]);

  const retry = useCallback((key: string) => {
    const cell = store.get(key);
    queue.enqueue(key, cell?.value ?? null);
    queue.flush();
  }, [queue, store]);

  const flush = useCallback(() => queue.flush(), [queue]);

  const addActivity = useCallback(async (label: string, maxScore: number, teacherId: string) => {
    const { data, error } = await supabase.from('grading_columns').insert({
      subject_id: subjectId,
      term_id: termId,
      teacher_id: teacherId,
      label: label.trim(),
      max_score: maxScore,
      activity_date: new Date().toISOString(),
    }).select('id, label, max_score, activity_date').single();
    if (error || !data) {
      setErrors(prev => ({ ...prev, __activity: toUserFacing(toGradingError(error)) }));
      return false;
    }
    const col = data as ActivityColumn;
    setColumns(prev => {
      const next = [...prev, col];
      columnsRef.current = next;
      return next;
    });
    for (const s of students) store.applyServer(activityCellKey(col.id, s.user_id), null);
    return true;
  }, [subjectId, termId, students, store]);

  const deleteActivity = useCallback(async (columnId: string) => {
    const { error } = await supabase.from('grading_columns').delete().eq('id', columnId);
    if (error) {
      setErrors(prev => ({ ...prev, __activity: toUserFacing(toGradingError(error)) }));
      return false;
    }
    setColumns(prev => {
      const next = prev.filter(c => c.id !== columnId);
      columnsRef.current = next;
      return next;
    });
    store.removeColumnCells(`act:${columnId}:`);
    return true;
  }, [store]);

  const rows = useMemo(
    () => computeRows({ students, columns, cells }),
    [students, columns, cells],
  );

  return {
    loading,
    students,
    columns,
    rows,
    cells,
    saveStates,
    errors,
    pendingCount,
    online,
    lastSyncedAt,
    setScore,
    retry,
    flush,
    reload: load,
    addActivity,
    deleteActivity,
    maxFor,
  };
}
