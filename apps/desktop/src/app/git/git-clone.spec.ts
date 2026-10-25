import { describe, expect, it, vi } from 'vitest';
import { cloneRepository, validFolderName, type ExecFileFn } from './git-clone';

function failing(code: string | number | undefined, stderr: string) {
  return vi.fn(((_f, _a, _o, cb) =>
    cb(Object.assign(new Error('x'), { code }), '', stderr)) as ExecFileFn);
}

describe('cloneRepository', () => {
  it('runs git with a safe argv and merged env', async () => {
    const exec = vi.fn(((_f, _a, _o, cb) => cb(null, '', '')) as ExecFileFn);
    await cloneRepository({
      url: 'https://h/a.git',
      target: 'C:/t',
      env: { SECRET: 's' },
      execFile: exec,
    });
    const [file, args, options] = exec.mock.calls[0];
    expect(file).toBe('git');
    expect(args).toEqual(['clone', '--', 'https://h/a.git', 'C:/t']);
    expect(options.env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(options.env.SECRET).toBe('s');
    expect(options.windowsHide).toBe(true);
  });

  it('maps errors to codes', async () => {
    const run = (e: ExecFileFn) =>
      cloneRepository({ url: 'u', target: 't', execFile: e });
    await expect(run(failing('ENOENT', ''))).rejects.toMatchObject({
      code: 'clone.gitMissing',
    });
    await expect(
      run(failing(128, 'fatal: Authentication failed for x')),
    ).rejects.toMatchObject({ code: 'clone.authFailed' });
    await expect(
      run(failing(128, 'fatal: could not read Username')),
    ).rejects.toMatchObject({ code: 'clone.authFailed' });
    await expect(run(failing(128, 'error: 403'))).rejects.toMatchObject({
      code: 'clone.authFailed',
    });
    await expect(run(failing(128, 'boom'))).rejects.toMatchObject({
      code: 'clone.failed',
    });
  });
});

describe('validFolderName', () => {
  it('accepts ordinary names', () => {
    expect(validFolderName('my-app.v2')).toBe(true);
  });
  it('rejects unsafe names', () => {
    for (const bad of [
      '',
      '.',
      '..',
      'a/b',
      'a\\b',
      'a:b',
      'a*b',
      'a\u0001b',
      'abc.',
      'abc ',
      'CON',
      'nul',
      'com1',
      'aux.txt',
    ]) {
      expect(validFolderName(bad), bad).toBe(false);
    }
  });
});
