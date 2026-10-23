import { describe, expect, it } from 'vitest';
import { findGitBash, resolveShell, shellCommand } from './shell';

const files = (...paths: string[]) => {
  const set = new Set(paths);
  return (path: string) => set.has(path);
};

describe('findGitBash', () => {
  it('finds Git under ProgramFiles', () => {
    const bash = 'C:\\Program Files\\Git\\bin\\bash.exe';
    expect(
      findGitBash({ ProgramFiles: 'C:\\Program Files' }, files(bash)),
    ).toBe(bash);
  });

  it('derives bash from the PATH dir holding git.exe', () => {
    const bash = 'D:\\tools\\Git\\bin\\bash.exe';
    const exists = files('D:\\tools\\Git\\cmd\\git.exe', bash);
    expect(findGitBash({ Path: 'C:\\x;D:\\tools\\Git\\cmd' }, exists)).toBe(
      bash,
    );
  });

  it('ignores System32 bash (WSL)', () => {
    const exists = files('C:\\Windows\\System32\\bash.exe');
    expect(
      findGitBash({ Path: 'C:\\Windows\\System32' }, exists),
    ).toBeUndefined();
  });
});

describe('resolveShell', () => {
  it('falls back to PowerShell on Windows', () => {
    expect(resolveShell('win32', {}, () => false)).toEqual({
      kind: 'powershell',
      file: 'powershell.exe',
    });
  });

  it('uses Git Bash on Windows when found', () => {
    const bash = 'C:\\Program Files\\Git\\bin\\bash.exe';
    expect(
      resolveShell('win32', { ProgramFiles: 'C:\\Program Files' }, files(bash)),
    ).toEqual({ kind: 'git-bash', file: bash });
  });

  it('uses SHELL on Unix, defaulting to /bin/bash', () => {
    expect(resolveShell('linux', { SHELL: '/bin/zsh' }, () => false)).toEqual({
      kind: 'posix',
      file: '/bin/zsh',
    });
    expect(resolveShell('linux', {}, () => false).file).toBe('/bin/bash');
  });
});

describe('shellCommand', () => {
  it('builds git-bash args and env', () => {
    const shell = { kind: 'git-bash', file: 'bash.exe' } as const;
    expect(shellCommand(shell, 'npm start')).toEqual({
      file: 'bash.exe',
      args: ['--login', '-c', 'npm start'],
      env: { CHERE_INVOKING: '1', MSYSTEM: 'MINGW64' },
    });
    expect(shellCommand(shell).args).toEqual(['--login', '-i']);
  });

  it('builds powershell args', () => {
    const shell = { kind: 'powershell', file: 'powershell.exe' } as const;
    expect(shellCommand(shell, 'dir').args).toEqual([
      '-NoLogo',
      '-Command',
      'dir',
    ]);
    expect(shellCommand(shell).args).toEqual(['-NoLogo']);
  });

  it('builds posix args', () => {
    const shell = { kind: 'posix', file: '/bin/bash' } as const;
    expect(shellCommand(shell, 'ls').args).toEqual(['-lc', 'ls']);
    expect(shellCommand(shell).args).toEqual(['-l']);
  });
});
