// Launches the real Ascua app for one spec file (serial tests sharing one app).
import { _electron, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const repo = path.resolve(__dirname, '../..');
const main = path.join(repo, 'dist/apps/desktop/main.js');

export interface Seed {
  /** Defaults to 'es': the scenarios assert Spanish whatever the OS language is. */
  language?: 'es' | 'en';
  /** Projects written to projects.json before launch; get the fixture folders. */
  projects?: (dirs: { projectDir: string; outside: string }) => unknown[];
}

export interface Ascua {
  readonly app: ElectronApplication;
  readonly page: Page;
  /** Temp --user-data-dir. */
  readonly data: string;
  /** Fixture project folder (inside `data`). */
  readonly projectDir: string;
  /** A folder outside the project. */
  readonly outside: string;
  /** Screenshot output folder. */
  readonly outDir: string;
  /** Closes the app and launches it again on the same user-data dir. */
  relaunch(): Promise<void>;
}

/** The seeded "Proyecto demo" (id `demo`) on the fixture folder. */
export function demoProject(projectDir: string, terminals: unknown[] = []) {
  return { id: 'demo', name: 'Proyecto demo', path: projectDir, terminals };
}

/** The two pistas the room and terminals scenarios seed. */
export const PISTAS = [
  {
    id: 'back',
    name: 'back',
    command: 'echo back listo; sleep 600',
    port: 8080,
  },
  { id: 'front', name: 'front', command: 'pwd; sleep 600', cwd: 'web' },
];

function makeFixture(projectDir: string): void {
  const w = (rel: string, content: string | Buffer) => {
    const file = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  w('README.md', '# demo\nProyecto de prueba\n');
  w('web/index.ts', 'export const x = 1;\n');
  w('web/src/app.ts', 'export const app = {};\n');
  w('.git/HEAD', 'ref: refs/heads/main\n');
  w('node_modules/pkg/index.js', 'module.exports = {};\n');
  w('run.cmd', '@echo off\r\necho hola\r\n');
  w('logo.bin', Buffer.from([0x89, 0x00, 0x01, 0x00, 0x02, 0x00, 0xff]));
  if (process.platform !== 'win32') {
    w('notes.md', '# notas\n');
    fs.chmodSync(path.join(projectDir, 'notes.md'), 0o755);
  }
}

/** Call at the top level of a spec file; the returned object is filled in `beforeAll`. */
export function useAscua(seed: Seed = {}): Ascua {
  test.describe.configure({ mode: 'serial' });

  const outDir = path.resolve(
    process.env['ASCUA_DRIVE_OUT'] ?? path.join(repo, 'dist/ui-drive'),
  );
  const state: Partial<{
    app: ElectronApplication;
    page: Page;
    data: string;
    projectDir: string;
    outside: string;
  }> = {};
  const need = <K extends keyof typeof state>(
    key: K,
  ): NonNullable<(typeof state)[K]> => {
    const value = state[key];
    if (value === undefined)
      throw new Error(`ascua.${key} is only available inside tests`);
    return value as NonNullable<(typeof state)[K]>;
  };

  const ascua: Ascua = {
    get app() {
      return need('app');
    },
    get page() {
      return need('page');
    },
    get data() {
      return need('data');
    },
    get projectDir() {
      return need('projectDir');
    },
    get outside() {
      return need('outside');
    },
    outDir,
    relaunch: () =>
      Promise.reject(
        new Error('ascua.relaunch is only available inside tests'),
      ),
  };

  test.beforeAll(async () => {
    const packaged = process.env['ASCUA_EXECUTABLE'];
    if (!packaged && !fs.existsSync(main)) {
      throw new Error(`Missing ${main}. Run: npx nx build desktop`);
    }
    fs.mkdirSync(outDir, { recursive: true });
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ascua-drive-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ascua-outside-'));
    const projectDir = path.join(data, 'proyecto-demo');
    makeFixture(projectDir);
    state.data = data;
    state.outside = outside;
    state.projectDir = projectDir;
    fs.writeFileSync(
      path.join(data, 'settings.json'),
      JSON.stringify({ version: 1, language: seed.language ?? 'es' }),
    );
    if (seed.projects) {
      fs.writeFileSync(
        path.join(data, 'projects.json'),
        JSON.stringify({
          version: 1,
          projects: seed.projects({ projectDir, outside }),
        }),
      );
    }

    await launch(data);
  });

  async function launch(data: string): Promise<void> {
    const packaged = process.env['ASCUA_EXECUTABLE'];
    const noSandbox =
      process.platform === 'linux' && process.env['ELECTRON_DISABLE_SANDBOX']
        ? ['--no-sandbox']
        : [];
    const app = await _electron.launch(
      packaged
        ? {
            executablePath: path.resolve(packaged),
            args: [`--user-data-dir=${data}`, ...noSandbox],
            timeout: 40_000,
          }
        : {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            executablePath: require('electron') as string,
            args: [`--user-data-dir=${data}`, ...noSandbox, main],
            env: { ...process.env, ASCUA_RENDERER: 'dist' } as Record<
              string,
              string
            >,
            timeout: 40_000,
          },
    );
    state.app = app;
    const page = await app.firstWindow();
    page.setDefaultTimeout(15_000);
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    await page.waitForSelector('#ascua-host', {
      state: 'attached',
      timeout: 40_000,
    });
    await page.waitForTimeout(1500);
    state.page = page;

    // dialog.showOpenDialog stub: each call shifts the next queued folder.
    await app.evaluate(({ dialog }) => {
      const g = globalThis as unknown as { __picks: string[] };
      g.__picks = [];
      dialog.showOpenDialog = (async () => {
        const next = g.__picks.shift();
        return next
          ? { canceled: false, filePaths: [next] }
          : { canceled: true, filePaths: [] };
      }) as unknown as typeof dialog.showOpenDialog;
    });
    // shell.openPath / showItemInFolder stubs: record instead of launching anything.
    await app.evaluate(({ shell }) => {
      const g = globalThis as unknown as {
        __opened: string[];
        __revealed: string[];
      };
      g.__opened = [];
      g.__revealed = [];
      shell.showItemInFolder = (p: string) => {
        g.__revealed.push(p);
      };
      shell.openPath = async (p: string) => {
        g.__opened.push(p);
        return '';
      };
    });
  }

  async function closeApp(): Promise<void> {
    const app = state.app;
    if (!app) return;
    try {
      // Running terminals make the quit guard ask first: answer "close anyway".
      await app.evaluate(({ dialog }) => {
        dialog.showMessageBox = (async () => ({
          response: 0,
          checkboxChecked: false,
        })) as unknown as typeof dialog.showMessageBox;
      });
      await Promise.race([
        app.close(),
        new Promise((r) => setTimeout(r, 20_000)),
      ]);
    } catch {
      // already closed or crashed
    }
    try {
      app.process().kill(); // only matters when close timed out
    } catch {
      // already gone
    }
  }

  ascua.relaunch = async () => {
    await closeApp();
    state.app = undefined;
    state.page = undefined;
    await launch(need('data'));
  };

  test.afterEach(async ({}, info) => {
    if (info.status !== info.expectedStatus && state.page) {
      const name = `${path.basename(info.file, '.spec.ts')}-FAIL-${info.title.replace(/\W+/g, '_')}`;
      await state.page
        .screenshot({ path: path.join(outDir, `${name}.png`) })
        .catch(() => undefined);
    }
  });

  test.afterAll(async () => {
    await closeApp();
    for (const dir of [state.data, state.outside]) {
      if (!dir) continue;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // locked temp files are not worth failing for
      }
    }
  });

  return ascua;
}
