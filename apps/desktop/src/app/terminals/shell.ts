import { win32 } from 'node:path';

export interface Shell {
  kind: 'git-bash' | 'powershell' | 'posix';
  file: string;
}

export interface ShellCommand {
  file: string;
  args: string[];
  env: Record<string, string>;
}

type Exists = (path: string) => boolean;

const GIT_BASH = ['Git', 'bin', 'bash.exe'];

/** Never returns `System32\bash.exe`: that is the WSL launcher. */
export function findGitBash(
  env: NodeJS.ProcessEnv,
  exists: Exists,
): string | undefined {
  const roots = [
    env['ProgramFiles'],
    env['ProgramFiles(x86)'],
    env['LOCALAPPDATA'] && win32.join(env['LOCALAPPDATA'], 'Programs'),
  ];
  for (const root of roots) {
    if (!root) continue;
    const candidate = win32.join(root, ...GIT_BASH);
    if (exists(candidate)) return candidate;
  }

  const path = env['Path'] ?? env['PATH'] ?? '';
  for (const dir of path.split(';')) {
    if (!dir || !exists(win32.join(dir, 'git.exe'))) continue;
    const candidate = win32.join(dir, '..', 'bin', 'bash.exe');
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

export function resolveShell(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  exists: Exists,
): Shell {
  if (platform === 'win32') {
    const bash = findGitBash(env, exists);
    return bash
      ? { kind: 'git-bash', file: bash }
      : { kind: 'powershell', file: 'powershell.exe' };
  }
  return { kind: 'posix', file: env['SHELL'] ?? '/bin/bash' };
}

export function shellCommand(shell: Shell, command?: string): ShellCommand {
  switch (shell.kind) {
    case 'git-bash':
      return {
        file: shell.file,
        // CHERE_INVOKING keeps the login profile from cd-ing to $HOME.
        args: command ? ['--login', '-c', command] : ['--login', '-i'],
        env: { CHERE_INVOKING: '1', MSYSTEM: 'MINGW64' },
      };
    case 'powershell':
      return {
        file: shell.file,
        args: command ? ['-NoLogo', '-Command', command] : ['-NoLogo'],
        env: {},
      };
    case 'posix':
      return {
        file: shell.file,
        args: command ? ['-lc', command] : ['-l'],
        env: {},
      };
  }
}
