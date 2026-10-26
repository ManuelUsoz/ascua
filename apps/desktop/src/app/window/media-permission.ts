import type { Session } from 'electron';

type IsOwn = (url: string | undefined) => boolean;

interface RequestDetails {
  requestingUrl?: string;
  mediaTypes?: string[];
}

interface CheckDetails {
  requestingUrl?: string;
  mediaType?: string;
}

/**
 * Permission request: only the microphone (audio, never video) from our own
 * renderer, plus the clipboard write the device-code copy button needs.
 */
export function allowRequest(
  permission: string,
  details: RequestDetails,
  isOwn: IsOwn,
): boolean {
  if (!isOwn(details.requestingUrl)) return false;
  if (permission === 'clipboard-sanitized-write') return true;
  if (permission !== 'media') return false;
  const types = details.mediaTypes;
  return !!types && types.length > 0 && types.every((t) => t === 'audio');
}

/** Permission check (synchronous probe), same policy as `allowRequest`. */
export function allowCheck(
  permission: string,
  details: CheckDetails,
  isOwn: IsOwn,
): boolean {
  if (!isOwn(details.requestingUrl)) return false;
  if (permission === 'clipboard-sanitized-write') return true;
  return permission === 'media' && details.mediaType === 'audio';
}

export function grantMicrophoneOnly(session: Session, isOwn: IsOwn): void {
  session.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(allowRequest(permission, details, isOwn));
  });
  session.setPermissionCheckHandler((_wc, permission, origin, details) => {
    return allowCheck(
      permission,
      { ...details, requestingUrl: details.requestingUrl ?? origin },
      isOwn,
    );
  });
}
