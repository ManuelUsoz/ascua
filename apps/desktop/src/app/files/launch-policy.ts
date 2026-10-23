/**
 * Allowlist of document extensions that are safe to hand to `shell.openPath`.
 * Anything an OS or Git Bash may execute on open (sh, py, js, bat, cmd, ps1,
 * rb, pl, php, ...) is deliberately absent, as are files without extension.
 */
const OPENABLE = new Set([
  'md', 'markdown', 'txt', 'log', 'json', 'jsonc', 'yaml', 'yml', 'toml',
  'ini', 'xml', 'csv', 'css', 'scss', 'less', 'html', 'htm', 'ts', 'tsx',
  'mts', 'cts', 'jsx', 'vue', 'svelte', 'java', 'kt', 'go', 'rs', 'c', 'h',
  'cpp', 'hpp', 'cs',
]);

export interface LaunchInfo {
  binary: boolean;
  /** `fs.Stats.mode`. */
  mode: number;
  platform: NodeJS.Platform;
}

/** Whether a file may be opened with the default app without running code. */
export function isOpenable(rel: string, info: LaunchInfo): boolean {
  if (info.binary) return false;
  if (info.platform !== 'win32' && (info.mode & 0o111) !== 0) return false;
  // Windows ignores trailing dots and spaces ("x.cmd." still runs as .cmd).
  const name = (rel.split(/[\\/]/).pop() ?? '').replace(/[. ]+$/, '');
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return OPENABLE.has(name.slice(dot + 1).toLowerCase());
}
