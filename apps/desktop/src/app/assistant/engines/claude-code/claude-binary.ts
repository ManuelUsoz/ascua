import { posix, win32 } from 'node:path';

export interface ClaudeCommand {
  file: string;
  /** Arguments that go before the claude arguments (a script path). */
  prefixArgs: string[];
  /** Extra environment on top of the process one. */
  env: Record<string, string>;
  /** `.cmd` shims need a shell on Windows. */
  shell: boolean;
}

type Exists = (path: string) => boolean;

const SCRIPT = /\.(?:m|c)?js$/i;

/**
 * Finds the user's own Claude Code CLI. `ASCUA_CLAUDE_CLI` comes first: a
 * `.js/.mjs/.cjs` path runs under Electron-as-node (the ui-drive test seam).
 * An override that does not exist still resolves, so spawn reports ENOENT.
 */
export function resolveClaude(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  exists: Exists,
  execPath: string = process.execPath,
): ClaudeCommand | undefined {
  const override = env['ASCUA_CLAUDE_CLI'];
  if (override) {
    if (SCRIPT.test(override) && exists(override)) {
      return {
        file: execPath,
        prefixArgs: [override],
        env: { ELECTRON_RUN_AS_NODE: '1' },
        shell: false,
      };
    }
    return {
      file: override,
      prefixArgs: [],
      env: {},
      shell: platform === 'win32' && /\.cmd$/i.test(override),
    };
  }

  if (platform === 'win32') {
    const path = env['Path'] ?? env['PATH'] ?? '';
    for (const dir of path.split(';')) {
      if (!dir) continue;
      const exe = win32.join(dir, 'claude.exe');
      if (exists(exe)) return plain(exe, false);
      const cmd = win32.join(dir, 'claude.cmd');
      if (exists(cmd)) return plain(cmd, true);
    }
    const home = env['USERPROFILE'];
    if (home) {
      const local = win32.join(home, '.local', 'bin', 'claude.exe');
      if (exists(local)) return plain(local, false);
    }
    return undefined;
  }

  const path = env['PATH'] ?? '';
  for (const dir of path.split(':')) {
    if (!dir) continue;
    const bin = posix.join(dir, 'claude');
    if (exists(bin)) return plain(bin, false);
  }
  const home = env['HOME'];
  if (home) {
    const local = posix.join(home, '.local', 'bin', 'claude');
    if (exists(local)) return plain(local, false);
  }
  return undefined;
}

function plain(file: string, shell: boolean): ClaudeCommand {
  return { file, prefixArgs: [], env: {}, shell };
}
