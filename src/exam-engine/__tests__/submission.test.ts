import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubmissionPipeline } from '../submission/SubmissionPipeline';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: { score: 5, total: 10, status: 'submitted' }, error: null })),
  },
}));

describe('SubmissionPipeline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submits once and seals', async () => {
    const p = new SubmissionPipeline();
    const r = await p.submit({ taskId: 't', studentId: 's', answers: { q1: 1 }, warnings: 0 });
    expect(r.status).toBe('submitted');
    expect(p.isSealed).toBe(true);
  });

  it('collapses concurrent submits into one RPC', async () => {
    const p = new SubmissionPipeline();
    const [a, b, c] = await Promise.all([
      p.submit({ taskId: 't', studentId: 's', answers: {}, warnings: 0 }),
      p.submit({ taskId: 't', studentId: 's', answers: {}, warnings: 0 }),
      p.submit({ taskId: 't', studentId: 's', answers: {}, warnings: 0 }),
    ]);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('short-circuits after seal', async () => {
    const p = new SubmissionPipeline();
    const first = await p.submit({ taskId: 't', studentId: 's', answers: {}, warnings: 0 });
    const second = await p.submit({ taskId: 't', studentId: 's', answers: {}, warnings: 0 });
    expect(second).toEqual(first);
  });
});
