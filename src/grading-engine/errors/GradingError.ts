/** Typed error hierarchy for the grading engine. */

export type GradingErrorKind =
  | 'network'
  | 'permission'
  | 'validation'
  | 'server'
  | 'conflict'
  | 'unexpected';

export class GradingError extends Error {
  readonly kind: GradingErrorKind;
  readonly details?: unknown;

  constructor(kind: GradingErrorKind, message: string, details?: unknown) {
    super(message);
    this.name = 'GradingError';
    this.kind = kind;
    this.details = details;
  }
}

export class GradingNetworkError extends GradingError {
  constructor(message = 'Network unavailable', details?: unknown) {
    super('network', message, details);
  }
}

export class GradingPermissionError extends GradingError {
  constructor(message = 'Not authorized', details?: unknown) {
    super('permission', message, details);
  }
}

export class GradingValidationError extends GradingError {
  constructor(message: string, details?: unknown) {
    super('validation', message, details);
  }
}

const TRANSIENT = /(network|fetch|timeout|offline|econn|temporarily unavailable|502|503|504)/i;

export function isTransientError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
  return TRANSIENT.test(msg);
}

/** Convert any thrown value into a typed GradingError. */
export function toGradingError(err: unknown): GradingError {
  if (err instanceof GradingError) return err;
  const raw = err as { message?: string; code?: string } | undefined;
  const msg = raw?.message ?? (typeof err === 'string' ? err : 'Unexpected error');
  if (isTransientError(msg)) return new GradingNetworkError(msg, err);
  if (/not authorized|permission|rls|denied|jwt/i.test(msg)) return new GradingPermissionError(msg, err);
  if (/out of range|invalid|violates check/i.test(msg)) return new GradingValidationError(msg, err);
  if (/duplicate|conflict/i.test(msg)) return new GradingError('conflict', msg, err);
  return new GradingError('server', msg, err);
}

/** Friendly message shown to teachers/admins. */
export function toUserFacing(err: unknown): string {
  const e = toGradingError(err);
  switch (e.kind) {
    case 'network':
      return 'Connection problem — your changes are saved locally and will sync automatically.';
    case 'permission':
      return 'You are not allowed to grade this subject.';
    case 'validation':
      return e.message;
    case 'conflict':
      return 'This score was changed elsewhere. The latest value has been kept.';
    case 'server':
      return `Could not save: ${e.message}`;
    default:
      return 'Something went wrong while saving. Please try again.';
  }
}
