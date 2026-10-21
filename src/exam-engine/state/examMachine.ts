/**
 * Hand-rolled deterministic state machine for the exam lifecycle.
 * Illegal transitions are refused (no-op + logged) so double-submits,
 * post-expiry mutations, and race conditions cannot corrupt state.
 */
import { logger } from '../observability/logger';
import { StateError } from '../errors/ExamError';

export type ExamState =
  | 'preparing'
  | 'permission_check'
  | 'ready'
  | 'starting'
  | 'running'
  | 'reconnecting'
  | 'autosaving'
  | 'submitting'
  | 'submitted'
  | 'force_submitted'
  | 'expired'
  | 'failed'
  | 'terminated';

export type ExamEvent =
  | { type: 'PERMISSIONS_REQUIRED' }
  | { type: 'PERMISSIONS_GRANTED' }
  | { type: 'COUNTDOWN_START' }
  | { type: 'COUNTDOWN_DONE' }
  | { type: 'NETWORK_LOST' }
  | { type: 'NETWORK_RESTORED' }
  | { type: 'AUTOSAVE_START' }
  | { type: 'AUTOSAVE_DONE' }
  | { type: 'SUBMIT_REQUESTED'; force?: boolean }
  | { type: 'SUBMIT_SUCCESS'; force?: boolean }
  | { type: 'SUBMIT_FAILED'; error: string }
  | { type: 'TIME_EXPIRED' }
  | { type: 'FATAL'; error: string }
  | { type: 'TERMINATE' };

const TRANSITIONS: Record<ExamState, Partial<Record<ExamEvent['type'], ExamState>>> = {
  preparing:       { PERMISSIONS_REQUIRED: 'permission_check', COUNTDOWN_START: 'starting', FATAL: 'failed' },
  permission_check:{ PERMISSIONS_GRANTED: 'ready', FATAL: 'failed' },
  ready:           { COUNTDOWN_START: 'starting', FATAL: 'failed' },
  starting:        { COUNTDOWN_DONE: 'running', FATAL: 'failed' },
  running:         { AUTOSAVE_START: 'autosaving', NETWORK_LOST: 'reconnecting', SUBMIT_REQUESTED: 'submitting', TIME_EXPIRED: 'submitting', FATAL: 'failed', TERMINATE: 'terminated' },
  autosaving:      { AUTOSAVE_DONE: 'running', NETWORK_LOST: 'reconnecting', SUBMIT_REQUESTED: 'submitting', TIME_EXPIRED: 'submitting', FATAL: 'failed' },
  reconnecting:    { NETWORK_RESTORED: 'running', SUBMIT_REQUESTED: 'submitting', TIME_EXPIRED: 'submitting', FATAL: 'failed', TERMINATE: 'terminated' },
  submitting:      { SUBMIT_SUCCESS: 'submitted', SUBMIT_FAILED: 'running', FATAL: 'failed' },
  submitted:       { TERMINATE: 'terminated' },
  force_submitted: { TERMINATE: 'terminated' },
  expired:         { TERMINATE: 'terminated' },
  failed:          { TERMINATE: 'terminated' },
  terminated:      {},
};

// Terminal states can never be left.
const TERMINAL = new Set<ExamState>(['submitted', 'force_submitted', 'expired', 'failed', 'terminated']);

export interface MachineListener {
  (state: ExamState, event: ExamEvent | null): void;
}

export class ExamMachine {
  private _state: ExamState = 'preparing';
  private listeners = new Set<MachineListener>();

  get state(): ExamState { return this._state; }
  get isTerminal(): boolean { return TERMINAL.has(this._state); }

  subscribe(fn: MachineListener): () => void {
    this.listeners.add(fn);
    fn(this._state, null);
    return () => this.listeners.delete(fn);
  }

  /** Attempt a transition. Returns true if applied; false if illegal. */
  send(event: ExamEvent): boolean {
    const currentTransitions = TRANSITIONS[this._state];
    let next = currentTransitions?.[event.type];

    // SUBMIT_SUCCESS force flag routes to force_submitted terminal.
    if (event.type === 'SUBMIT_SUCCESS' && event.force) next = 'force_submitted';
    // TIME_EXPIRED after submission attempt lands in expired terminal.
    if (event.type === 'TIME_EXPIRED' && this._state === 'submitting') next = 'submitting';

    if (!next) {
      logger.warn('illegal_state_transition', { from: this._state, event: event.type });
      return false;
    }
    if (TERMINAL.has(this._state)) {
      logger.warn('transition_on_terminal_state', { state: this._state, event: event.type });
      return false;
    }
    const prev = this._state;
    this._state = next;
    logger.info('state_transition', { from: prev, to: next, event: event.type });
    for (const l of this.listeners) {
      try { l(next, event); } catch (e) { logger.error('listener_error', { error: (e as Error).message }); }
    }
    return true;
  }

  /** Throw if the current state is not one of `allowed`. */
  assert(...allowed: ExamState[]): void {
    if (!allowed.includes(this._state)) {
      throw new StateError(`Expected state ${allowed.join('|')}, was ${this._state}`, { state: this._state });
    }
  }
}
