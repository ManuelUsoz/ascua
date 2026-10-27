export type ChatErrorKind =
  | 'providerNotConfigured'
  | 'providerDisabled'
  | 'authRequired'
  | 'agentMissing'
  | 'notFound'
  | 'invalidInput'
  | 'invalidMethodology'
  | 'busy'
  | 'startFailed'
  | 'promptFailed'
  | 'exited'
  | 'saveFailed'
  | 'unknown';

export class ChatError extends Error {
  constructor(
    readonly kind: ChatErrorKind,
    readonly params?: Record<string, string | number>,
    message?: string,
  ) {
    super(message ?? `chat: ${kind}`); // i18n-ignore
    this.name = 'ChatError';
  }
}
