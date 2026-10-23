import { describe, expect, it } from 'vitest';
import { errorMessage } from './error-message';

describe('errorMessage', () => {
  it('strips the Electron IPC wrapper', () => {
    const e = new Error("Error invoking remote method 'ascua:files:read': Error: El archivo ya no existe.");
    expect(errorMessage(e)).toBe('El archivo ya no existe.');
  });

  it('keeps plain messages and non-errors', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('texto')).toBe('texto');
  });
});
