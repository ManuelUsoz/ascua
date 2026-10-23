export type SourceControlErrorKind =
  | 'notConnected'
  | 'authExpired'
  | 'rateLimited'
  | 'network'
  | 'denied'
  | 'codeExpired'
  | 'notFound'
  | 'forbidden'
  | 'unavailable'
  | 'rejected'
  | 'unknown';

export class SourceControlError extends Error {
  constructor(
    readonly kind: SourceControlErrorKind,
    readonly params?: Record<string, string | number>,
    message?: string,
  ) {
    super(message ?? `source-control: ${kind}`); // i18n-ignore
    this.name = 'SourceControlError';
  }
}
