/** Shared types for the grading engine. */

export interface Term {
  id: string;
  name: string;
  term_number: number;
  year: number;
  is_active: boolean;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  class_name: string;
  module: string | null;
  level: number | null;
  teacher_id: string | null;
}

export interface ActivityColumn {
  id: string;
  label: string;
  max_score: number;
  activity_date: string;
}

export interface StudentRecord {
  user_id: string;
  full_name: string;
  student_card: string;
}

export type CellKind = 'term' | 'activity';

export interface CellRef {
  key: string;
  kind: CellKind;
  studentId: string;
  /** Column id for activity cells; empty string for term cells. */
  columnId: string;
}

/** A single score cell with an optimistic-concurrency version. */
export interface Cell {
  value: number | null;
  /** Monotonic per-cell version. Server responses older than this are ignored. */
  version: number;
  /** Raw text currently typed by the user (unsaved), if any. */
  draft?: string;
}

export type SaveState = 'idle' | 'pending' | 'saving' | 'retrying' | 'saved' | 'error' | 'offline';

export interface ComputedRow {
  student: StudentRecord;
  termScore: number | null;
  activityScores: Record<string, number | null>;
  /** Sum of all graded points. */
  total: number;
  /** Sum of the maximums of the graded cells only. */
  maxTotal: number;
  /** Percentage 0-100, rounded to 1 decimal. */
  average: number;
  /** 1-based rank; 0 when the student has no graded cell. */
  position: number;
  gradedCount: number;
}

export interface GradingSnapshot {
  loading: boolean;
  students: StudentRecord[];
  columns: ActivityColumn[];
  rows: ComputedRow[];
  cells: Record<string, Cell>;
  saveStates: Record<string, SaveState>;
  errors: Record<string, string>;
  pendingCount: number;
  online: boolean;
  lastSyncedAt: number | null;
}

export function termCellKey(studentId: string): string {
  return `term:${studentId}`;
}

export function activityCellKey(columnId: string, studentId: string): string {
  return `act:${columnId}:${studentId}`;
}

export function parseCellKey(key: string): CellRef {
  const parts = key.split(':');
  if (parts[0] === 'term') {
    return { key, kind: 'term', studentId: parts[1], columnId: '' };
  }
  return { key, kind: 'activity', studentId: parts[2], columnId: parts[1] };
}
