// Usage: npm run linux:check
// Builds tools/linux/Dockerfile and runs tools/linux/check.sh in it (Linux
// containers). Artifacts (AppImage, screenshots) land in dist/linux.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => spawnSync('docker', args, { cwd: root, stdio: 'inherit' });

if (run(['info']).status !== 0) {
  console.error('Start Docker Desktop (Linux containers)');
  process.exit(1);
}

const build = run(['build', '-f', 'tools/linux/Dockerfile', '-t', 'ascua-linux-check', '.']);
if (build.status !== 0) process.exit(build.status ?? 1);

const out = resolve(root, 'dist', 'linux');
mkdirSync(out, { recursive: true });
const result = run(['run', '--rm', '--shm-size=1g', '-v', `${out}:/out`, 'ascua-linux-check']);
process.exit(result.status ?? 1);
