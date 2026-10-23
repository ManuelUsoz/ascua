import { decodeError, type AscuaError } from '@ascua/ipc';
import { text, type Text } from './text';

const IPC_PREFIX = /^Error invoking remote method '[^']*': (?:Error: )?/;

/** An error from the bridge as a code: decoded, or `unknown` with the raw detail. */
export function toAscuaError(error: unknown): AscuaError {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.replace(IPC_PREFIX, '');
  return (
    decodeError(message) ?? { code: 'unknown', params: { detail: message } }
  );
}

/** The catalog entry for an error: `errors.<code>`. */
export function errorText(error: AscuaError): Text {
  return text(`errors.${error.code}`, { detail: '', ...error.params });
}
