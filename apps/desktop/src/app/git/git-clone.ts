import { execFile as nodeExecFile } from 'node:child_process';
import type { ErrorCode } from '@ascua/ipc';

export class CloneError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'CloneError';
  }
}

export type ExecFileFn = (
  file: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv;
    windowsHide: boolean;
    maxBuffer?: number;
  },
  callback: (
    error: (Error & { code?: string | number }) | null,
    stdout: string,
    stderr: string,
  ) => void,
) => unknown;

export interface CloneOptions {
  url: string;
  target: string;
  /** Extra environment; may hold a token, so it is never logged. */
  env?: Record<string, string>;
  execFile?: ExecFileFn;
}

const AUTH_FAILURE =
  /Authentication failed|could not read Username|\b40[13]\b/i;

export function cloneRepository(options: CloneOptions): Promise<void> {
  const run = options.execFile ?? (nodeExecFile as unknown as ExecFileFn);
  return new Promise((resolve, reject) => {
    run(
      'git',
      ['clone', '--', options.url, options.target],
      {
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          ...options.env,
        },
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, _stdout, stderr) => {
        if (!error) return resolve();
        if (error.code === 'ENOENT')
          return reject(new CloneError('clone.gitMissing'));
        reject(
          new CloneError(
            AUTH_FAILURE.test(String(stderr ?? ''))
              ? 'clone.authFailed'
              : 'clone.failed',
          ),
        );
      },
    );
  });
}

// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

export function validFolderName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name === '.' || name === '..') return false;
  if (FORBIDDEN_CHARS.test(name)) return false;
  if (/[. ]$/.test(name)) return false;
  return !RESERVED.test(name);
}
