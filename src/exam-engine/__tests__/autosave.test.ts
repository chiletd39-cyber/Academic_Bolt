import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutosaveEngine, clearDraft, loadDraft } from '../autosave/AutosaveEngine';

const upsertMock = vi.fn(async () => ({ error: null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ upsert: (a: unknown, b?: unknown) => (upsertMock as unknown as (a: unknown, b?: unknown) => Promise<{ error: null }>)(a, b) }) },
}));

describe('AutosaveEngine', () => {
  beforeEach(() => { upsertMock.mockClear(); localStorage.clear(); });

  it('persists a local draft after each edit', () => {
    const e = new AutosaveEngine({ studentId: 'u', taskId: 't', isTerminal: () => false });
    e.setAnswer('q1', 'a');
    expect(loadDraft('u', 't')?.answers.q1).toBe('a');
    e.dispose();
  });

  it('flush uploads latest answers exactly once when nothing changed', async () => {
    const e = new AutosaveEngine({ studentId: 'u', taskId: 't', isTerminal: () => false });
    e.setAnswer('q1', 'a');
    await e.flush();
    await e.flush(); // no changes since ack
    expect(upsertMock).toHaveBeenCalledTimes(1);
    e.dispose();
  });

  it('does not save after terminal state', async () => {
    let terminal = false;
    const e = new AutosaveEngine({ studentId: 'u', taskId: 't', isTerminal: () => terminal });
    terminal = true;
    e.setAnswer('q1', 'x');
    await e.flush();
    expect(upsertMock).not.toHaveBeenCalled();
    e.dispose();
  });

  it('clearDraft removes local state', () => {
    const e = new AutosaveEngine({ studentId: 'u', taskId: 't', isTerminal: () => false });
    e.setAnswer('q', 1);
    clearDraft('u', 't');
    expect(loadDraft('u', 't')).toBeNull();
    e.dispose();
  });
});
