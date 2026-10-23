import { describe, expect, it } from 'vitest';
import { FileAccessError, fileError } from './project-files';

const errno = (code: string) =>
  Object.assign(new Error(`${code}: raw 'C:\\x'`), { code });

describe('fileError', () => {
  it('keeps the code of access errors', () => {
    expect(fileError(new FileAccessError('file.outside'))).toEqual({
      code: 'file.outside',
    });
    expect(fileError(new FileAccessError('project.notFound'))).toEqual({
      code: 'project.notFound',
    });
  });

  it('maps fs codes to error codes', () => {
    expect(fileError(errno('ENOENT'))).toEqual({ code: 'file.gone' });
    expect(fileError(errno('EACCES'))).toEqual({ code: 'file.readDenied' });
    expect(fileError(errno('EPERM'))).toEqual({ code: 'file.readDenied' });
    expect(fileError(errno('EIO'))).toEqual({ code: 'file.readFailed' });
  });

  it('uses write codes for writes', () => {
    expect(fileError(errno('EACCES'), 'write')).toEqual({
      code: 'file.writeDenied',
    });
    expect(fileError(errno('EIO'), 'write')).toEqual({
      code: 'file.writeFailed',
    });
    expect(fileError(errno('ENOENT'), 'write')).toEqual({ code: 'file.gone' });
  });

  it('never leaks raw fs text', () => {
    expect(JSON.stringify(fileError(errno('EIO')))).not.toContain('raw');
  });
});
