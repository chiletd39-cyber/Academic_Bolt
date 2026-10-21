/**
 * Pure, memoized grading computation: totals, averages and ranking.
 * Used by the grading sheet, the report card and the rank view so every
 * screen shows identical numbers.
 */
import type { ActivityColumn, Cell, ComputedRow, StudentRecord } from './types';
import { activityCellKey, termCellKey } from './types';

export interface RowInput {
  students: StudentRecord[];
  columns: ActivityColumn[];
  cells: Record<string, Cell>;
  /** Maximum of the term column (defaults to 100). */
  termMax?: number;
}

export interface SubjectTotals {
  total: number;
  maxTotal: number;
  average: number;
  gradedCount: number;
}

/** Totals for a single student across the term cell + activity columns. */
export function computeTotals(
  studentId: string,
  columns: ActivityColumn[],
  cells: Record<string, Cell>,
  termMax = 100,
): SubjectTotals {
  let total = 0;
  let maxTotal = 0;
  let gradedCount = 0;

  const term = cells[termCellKey(studentId)]?.value;
  if (term !== null && term !== undefined) {
    total += term;
    maxTotal += termMax;
    gradedCount += 1;
  }
  for (const col of columns) {
    const v = cells[activityCellKey(col.id, studentId)]?.value;
    if (v !== null && v !== undefined) {
      total += v;
      maxTotal += col.max_score;
      gradedCount += 1;
    }
  }
  const average = maxTotal > 0 ? Math.round((total / maxTotal) * 1000) / 10 : 0;
  return { total, maxTotal, average, gradedCount };
}

/** Assign 1-based positions; ties share a position. Ungraded students get 0. */
export function rank(rows: ComputedRow[]): ComputedRow[] {
  const graded = rows.filter(r => r.gradedCount > 0).sort((a, b) => b.average - a.average);
  const positions = new Map<string, number>();
  let lastAvg: number | null = null;
  let lastPos = 0;
  graded.forEach((r, i) => {
    const pos = lastAvg !== null && r.average === lastAvg ? lastPos : i + 1;
    positions.set(r.student.user_id, pos);
    lastAvg = r.average;
    lastPos = pos;
  });
  return rows.map(r => ({ ...r, position: positions.get(r.student.user_id) ?? 0 }));
}

const cache = new Map<string, ComputedRow[]>();
const CACHE_LIMIT = 8;

function signature(input: RowInput): string {
  const parts: string[] = [String(input.termMax ?? 100)];
  for (const s of input.students) parts.push(s.user_id);
  parts.push('|');
  for (const c of input.columns) parts.push(`${c.id}:${c.max_score}`);
  parts.push('|');
  for (const s of input.students) {
    parts.push(String(input.cells[termCellKey(s.user_id)]?.value ?? ''));
    for (const c of input.columns) {
      parts.push(String(input.cells[activityCellKey(c.id, s.user_id)]?.value ?? ''));
    }
  }
  return parts.join(',');
}

/** Build ranked rows for the whole class. Memoized on the value signature. */
export function computeRows(input: RowInput): ComputedRow[] {
  const sig = signature(input);
  const hit = cache.get(sig);
  if (hit) return hit;

  const termMax = input.termMax ?? 100;
  const base: ComputedRow[] = input.students.map(student => {
    const totals = computeTotals(student.user_id, input.columns, input.cells, termMax);
    const activityScores: Record<string, number | null> = {};
    for (const c of input.columns) {
      activityScores[c.id] = input.cells[activityCellKey(c.id, student.user_id)]?.value ?? null;
    }
    return {
      student,
      termScore: input.cells[termCellKey(student.user_id)]?.value ?? null,
      activityScores,
      total: totals.total,
      maxTotal: totals.maxTotal,
      average: totals.average,
      gradedCount: totals.gradedCount,
      position: 0,
    };
  });

  const ranked = rank(base);
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(sig, ranked);
  return ranked;
}

export function clearComputationCache(): void {
  cache.clear();
}

/** Average of a list of {score, max} pairs as a 0-100 percentage. */
export function percentageOf(parts: Array<{ score: number | null; max: number }>): number {
  let total = 0;
  let max = 0;
  for (const p of parts) {
    if (p.score === null || p.score === undefined) continue;
    total += p.score;
    max += p.max;
  }
  return max > 0 ? Math.round((total / max) * 1000) / 10 : 0;
}
