export type AssistantErrorKind =
  | 'notInstalled'
  | 'notLoggedIn'
  | 'crashed'
  | 'busy'
  | 'failed'
  | 'unknown';

export class AssistantError extends Error {
  constructor(
    readonly kind: AssistantErrorKind,
    message?: string,
  ) {
    super(message ?? `assistant: ${kind}`); // i18n-ignore
    this.name = 'AssistantError';
  }
}
