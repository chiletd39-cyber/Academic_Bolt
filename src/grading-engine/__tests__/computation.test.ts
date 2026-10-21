import { describe, it, expect, beforeEach } from 'vitest';
import { computeTotals, computeRows, rank, percentageOf, clearComputationCache } from '../computation';
import { activityCellKey, termCellKey, type Cell, type ComputedRow, type StudentRecord } from '../types';

const student = (id: string): StudentRecord => ({ user_id: id, full_name: id, student_card: id });
const cell = (value: number | null): Cell => ({ value, version: 1 });

describe('grading computation', () => {
  beforeEach(() => clearComputationCache());

  it('totals term + activity cells against their own maximums', () => {
    const cells: Record<string, Cell> = {
      [termCellKey('a')]: cell(80),
      [activityCellKey('c1', 'a')]: cell(20),
      [activityCellKey('c2', 'a')]: cell(null),
    };
    const columns = [
      { id: 'c1', label: 'T1', max_score: 25, activity_date: '2026-01-01' },
      { id: 'c2', label: 'T2', max_score: 50, activity_date: '2026-01-02' },
    ];
    const t = computeTotals('a', columns, cells, 100);
    expect(t.total).toBe(100);
    expect(t.maxTotal).toBe(125);
    expect(t.gradedCount).toBe(2);
    expect(t.average).toBe(80);
  });

  it('ranks by average with shared positions on ties and 0 for ungraded', () => {
    const rows = [
      { student: student('a'), average: 50, gradedCount: 1 },
      { student: student('b'), average: 90, gradedCount: 1 },
      { student: student('c'), average: 90, gradedCount: 1 },
      { student: student('d'), average: 0, gradedCount: 0 },
    ] as ComputedRow[];
    const out = rank(rows);
    const pos = Object.fromEntries(out.map(r => [r.student.user_id, r.position]));
    expect(pos.b).toBe(1);
    expect(pos.c).toBe(1);
    expect(pos.a).toBe(3);
    expect(pos.d).toBe(0);
  });

  it('memoizes identical inputs and recomputes when a value changes', () => {
    const input = {
      students: [student('a')],
      columns: [{ id: 'c1', label: 'T1', max_score: 25, activity_date: '2026-01-01' }],
      cells: { [activityCellKey('c1', 'a')]: cell(25) },
    };
    const first = computeRows(input);
    expect(computeRows(input)).toBe(first);
    const changed = computeRows({ ...input, cells: { [activityCellKey('c1', 'a')]: cell(10) } });
    expect(changed).not.toBe(first);
    expect(changed[0].average).toBe(40);
  });

  it('percentageOf ignores ungraded parts', () => {
    expect(percentageOf([{ score: 10, max: 20 }, { score: null, max: 50 }])).toBe(50);
    expect(percentageOf([])).toBe(0);
  });
});
