// npm postinstall: rebuild native deps for Electron, except on Windows where
// node-pty ships N-API prebuilds and electron-builder's rebuild would compile
// from source (needs the VS Build Tools Spectre libs, MSB8040).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.platform === 'win32') {
  console.log('skip install-app-deps (node-pty ships N-API prebuilds)');
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'node_modules', '.bin', 'electron-builder');
const result = spawnSync(bin, ['install-app-deps'], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
