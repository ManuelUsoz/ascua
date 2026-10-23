import type { ProviderId } from './models';

export type SourceControlErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'rate-limited'
  | 'network'
  | 'auth-expired'
  | 'auth-denied'
  | 'cancelled'
  | 'unknown';

export class SourceControlError extends Error {
  override name = 'SourceControlError';

  constructor(
    readonly code: SourceControlErrorCode,
    readonly provider: ProviderId,
    message: string,
  ) {
    super(message);
  }
}

export function isSourceControlError(
  value: unknown,
): value is SourceControlError {
  return value instanceof SourceControlError;
}
