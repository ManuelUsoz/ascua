// Playwright Test config of the Ascua UI driver (one Electron launch per spec file).
//   node tools/ui-drive.cjs <outDir>            (wrapper, sets ASCUA_DRIVE_OUT)
//   npx playwright test -c tools/ui-drive/playwright.config.ts
// Packaged app instead: ASCUA_EXECUTABLE=<path to ascua binary>.
// Specs share the permission hook pipe: one worker, close any running Ascua first.
import { defineConfig } from '@playwright/test';
import * as path from 'node:path';

const out = path.resolve(
  process.env['ASCUA_DRIVE_OUT'] ?? path.join(__dirname, '../../dist/ui-drive'),
);

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  // Launching Electron, the pty shells and the viewport sweeps are slow on CI/Docker.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: path.join(out, 'playwright'),
});
