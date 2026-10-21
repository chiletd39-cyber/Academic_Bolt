import { describe, it, expect } from 'vitest';
import { ExamMachine } from '../state/examMachine';

describe('ExamMachine', () => {
  it('follows the happy path preparing → submitted', () => {
    const m = new ExamMachine();
    expect(m.state).toBe('preparing');
    expect(m.send({ type: 'PERMISSIONS_REQUIRED' })).toBe(true);
    expect(m.send({ type: 'PERMISSIONS_GRANTED' })).toBe(true);
    expect(m.send({ type: 'COUNTDOWN_START' })).toBe(true);
    expect(m.send({ type: 'COUNTDOWN_DONE' })).toBe(true);
    expect(m.state).toBe('running');
    expect(m.send({ type: 'SUBMIT_REQUESTED' })).toBe(true);
    expect(m.state).toBe('submitting');
    expect(m.send({ type: 'SUBMIT_SUCCESS' })).toBe(true);
    expect(m.state).toBe('submitted');
    expect(m.isTerminal).toBe(true);
  });

  it('routes force success to force_submitted', () => {
    const m = new ExamMachine();
    m.send({ type: 'PERMISSIONS_REQUIRED' });
    m.send({ type: 'PERMISSIONS_GRANTED' });
    m.send({ type: 'COUNTDOWN_START' });
    m.send({ type: 'COUNTDOWN_DONE' });
    m.send({ type: 'SUBMIT_REQUESTED', force: true });
    m.send({ type: 'SUBMIT_SUCCESS', force: true });
    expect(m.state).toBe('force_submitted');
    expect(m.isTerminal).toBe(true);
  });

  it('rejects illegal transitions', () => {
    const m = new ExamMachine();
    expect(m.send({ type: 'SUBMIT_REQUESTED' })).toBe(false);
    expect(m.state).toBe('preparing');
  });

  it('cannot leave a terminal state', () => {
    const m = new ExamMachine();
    m.send({ type: 'PERMISSIONS_REQUIRED' });
    m.send({ type: 'PERMISSIONS_GRANTED' });
    m.send({ type: 'COUNTDOWN_START' });
    m.send({ type: 'COUNTDOWN_DONE' });
    m.send({ type: 'SUBMIT_REQUESTED' });
    m.send({ type: 'SUBMIT_SUCCESS' });
    expect(m.send({ type: 'SUBMIT_REQUESTED' })).toBe(false);
    expect(m.state).toBe('submitted');
  });

  it('handles network drop/restore during running', () => {
    const m = new ExamMachine();
    m.send({ type: 'PERMISSIONS_REQUIRED' });
    m.send({ type: 'PERMISSIONS_GRANTED' });
    m.send({ type: 'COUNTDOWN_START' });
    m.send({ type: 'COUNTDOWN_DONE' });
    m.send({ type: 'NETWORK_LOST' });
    expect(m.state).toBe('reconnecting');
    m.send({ type: 'NETWORK_RESTORED' });
    expect(m.state).toBe('running');
  });
});
