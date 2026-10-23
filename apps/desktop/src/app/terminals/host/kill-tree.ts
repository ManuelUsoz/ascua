import { execFile } from 'node:child_process';

/** Kills a pty child and everything it spawned. */
export function killTree(pid: number, fallback: () => void): void {
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], (error) => {
      if (error) fallback();
    });
    return;
  }
  try {
    // node-pty runs the child under setsid, so -pid is its process group.
    process.kill(-pid, 'SIGTERM');
  } catch {
    fallback();
    return;
  }
  setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }, 3000).unref();
}
