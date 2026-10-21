/**
 * Typed error hierarchy used across the exam engine. Every catch site can
 * classify a failure and produce a user-facing message via ErrorReporter.
 */

export type ExamErrorCategory =
  | 'network'
  | 'permission'
  | 'submission'
  | 'security'
  | 'media'
  | 'server'
  | 'state'
  | 'unexpected';

export class ExamError extends Error {
  readonly category: ExamErrorCategory;
  readonly recoverable: boolean;
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;

  constructor(
    category: ExamErrorCategory,
    message: string,
    opts: { recoverable?: boolean; cause?: unknown; context?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = `ExamError:${category}`;
    this.category = category;
    this.recoverable = opts.recoverable ?? true;
    this.cause = opts.cause;
    this.context = opts.context;
  }
}

export class NetworkError extends ExamError {
  constructor(message: string, cause?: unknown) {
    super('network', message, { recoverable: true, cause });
  }
}
export class PermissionError extends ExamError {
  constructor(message: string, cause?: unknown) {
    super('permission', message, { recoverable: true, cause });
  }
}
export class SubmissionError extends ExamError {
  constructor(message: string, cause?: unknown, recoverable = true) {
    super('submission', message, { recoverable, cause });
  }
}
export class SecurityError extends ExamError {
  constructor(message: string, cause?: unknown) {
    super('security', message, { recoverable: true, cause });
  }
}
export class MediaError extends ExamError {
  constructor(message: string, cause?: unknown) {
    super('media', message, { recoverable: true, cause });
  }
}
export class ServerError extends ExamError {
  constructor(message: string, cause?: unknown) {
    super('server', message, { recoverable: false, cause });
  }
}
export class StateError extends ExamError {
  constructor(message: string, ctx?: Record<string, unknown>) {
    super('state', message, { recoverable: false, context: ctx });
  }
}

/** Map any thrown value to a user-facing description + retryability hint. */
export interface UserFacingError {
  title: string;
  message: string;
  actionable: string;
  recoverable: boolean;
  category: ExamErrorCategory;
}

const CATEGORY_COPY: Record<ExamErrorCategory, { title: string; actionable: string }> = {
  network:    { title: 'Connection issue',       actionable: 'Check your internet and we will retry automatically.' },
  permission: { title: 'Permission required',    actionable: 'Please re-grant camera/microphone access.' },
  submission: { title: 'Submission problem',     actionable: 'We will retry — do not close this page.' },
  security:   { title: 'Security warning',       actionable: 'Return to the exam window and stop the flagged action.' },
  media:      { title: 'Device unavailable',     actionable: 'Reconnect your camera/microphone and continue.' },
  server:     { title: 'Server error',           actionable: 'Please contact your teacher if this persists.' },
  state:      { title: 'Session state error',    actionable: 'Reload the page to recover.' },
  unexpected: { title: 'Unexpected error',       actionable: 'Please reload the page.' },
};

export function toUserFacing(err: unknown): UserFacingError {
  const e = err instanceof ExamError ? err : new ExamError('unexpected', (err as Error)?.message || 'Unknown error', { cause: err });
  const copy = CATEGORY_COPY[e.category];
  return { title: copy.title, message: e.message, actionable: copy.actionable, recoverable: e.recoverable, category: e.category };
}

const TRANSIENT_TOKENS = ['network', 'fetch', 'timeout', 'temporarily', 'failed to fetch', 'ECONN', 'ENETUNREACH'];

export function isTransient(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err ?? '').toLowerCase();
  return TRANSIENT_TOKENS.some(t => msg.includes(t.toLowerCase()));
}
