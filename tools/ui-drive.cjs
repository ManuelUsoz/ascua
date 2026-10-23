// Wrapper of the Ascua UI driver (Playwright Test scenarios in tools/ui-drive/).
//   npx nx build desktop && node tools/ui-drive.cjs <outDir> [playwright args]
// One area: node tools/ui-drive.cjs <outDir> --grep editor   (or a spec file name)
// Packaged app instead (win-unpacked ascua.exe, or the `ascua` binary of an extracted AppImage):
//   ASCUA_EXECUTABLE=dist/packages/win-unpacked/ascua.exe node tools/ui-drive.cjs <outDir>
// Close any running Ascua first: the permission hook pipe is shared.
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const main = path.join(repo, 'dist/apps/desktop/main.js');
if (!process.env.ASCUA_EXECUTABLE && !fs.existsSync(main)) {
  console.error(`Missing ${main}. Run: npx nx build desktop`);
  process.exit(1);
}

const outDir = path.resolve(
  process.argv[2] ?? path.join(repo, 'dist/ui-drive'),
);
fs.mkdirSync(outDir, { recursive: true });

const cli = path.join(
  path.dirname(require.resolve('@playwright/test/package.json')),
  'cli.js',
);
const result = spawnSync(
  process.execPath,
  [
    cli,
    'test',
    '-c',
    path.join(repo, 'tools/ui-drive/playwright.config.ts'),
    ...process.argv.slice(3),
  ],
  {
    stdio: 'inherit',
    cwd: repo,
    env: { ...process.env, ASCUA_DRIVE_OUT: outDir },
  },
);
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
