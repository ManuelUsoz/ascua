import { describe, expect, it } from 'vitest';
import { FileAccessError, friendlyFileError } from './project-files';

const errno = (code: string) => Object.assign(new Error(`${code}: raw 'C:\\x'`), { code });

describe('friendlyFileError', () => {
  it('keeps containment errors', () => {
    expect(friendlyFileError(new FileAccessError('Ese archivo está fuera del proyecto.'))).toBe(
      'Ese archivo está fuera del proyecto.',
    );
  });

  it('maps fs codes to short messages', () => {
    expect(friendlyFileError(errno('ENOENT'))).toBe('El archivo ya no existe.');
    expect(friendlyFileError(errno('EACCES'))).toBe('Sin permiso para leer el archivo.');
    expect(friendlyFileError(errno('EPERM'))).toBe('Sin permiso para leer el archivo.');
    expect(friendlyFileError(errno('EIO'))).toBe('No se pudo leer el archivo.');
  });

  it('uses write messages for writes', () => {
    expect(friendlyFileError(errno('EACCES'), 'write')).toBe(
      'Sin permiso para escribir el archivo.',
    );
    expect(friendlyFileError(errno('EIO'), 'write')).toBe(
      'No se pudo guardar el archivo.',
    );
    expect(friendlyFileError(errno('ENOENT'), 'write')).toBe('El archivo ya no existe.');
  });
});
