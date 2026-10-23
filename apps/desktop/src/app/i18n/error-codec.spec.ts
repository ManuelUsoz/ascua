import { describe, expect, it } from 'vitest';
import { decodeError, encodeError } from '@ascua/ipc';

describe('encodeError / decodeError', () => {
  it('round-trips code and params', () => {
    const error = { code: 'file.openFailed', params: { detail: 'x' } } as const;
    expect(decodeError(encodeError(error))).toEqual(error);
  });

  it('decodes through an Electron IPC prefix', () => {
    const message = `Error invoking remote method 'x': Error: ${encodeError({ code: 'file.gone' })}`;
    expect(decodeError(message)).toEqual({ code: 'file.gone' });
  });

  it('returns undefined for plain, non-JSON or code-less messages', () => {
    expect(decodeError('boom')).toBeUndefined();
    expect(decodeError('ascua-error:not json')).toBeUndefined();
    expect(decodeError('ascua-error:{"params":{}}')).toBeUndefined();
    expect(decodeError('ascua-error:null')).toBeUndefined();
  });
});
