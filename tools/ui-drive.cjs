// Drives the real Ascua app (built renderer + main from dist/) with Playwright's
// _electron and checks the terminals UI end to end.
//   npx nx build desktop && node tools/ui-drive.cjs <outDir>
// Packaged app instead (win-unpacked ascua.exe, or the `ascua` binary of an extracted AppImage):
//   ASCUA_EXECUTABLE=dist/packages/win-unpacked/ascua.exe node tools/ui-drive.cjs <outDir>
// Close any running Ascua first: the permission hook pipe is shared.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const repo = path.resolve(__dirname, '..');
const main = path.join(repo, 'dist/apps/desktop/main.js');
const packaged = process.env.ASCUA_EXECUTABLE;
if (!packaged && !fs.existsSync(main)) {
  console.error(`Missing ${main}. Run: npx nx build desktop`);
  process.exit(1);
}
const { _electron } = require('playwright-core');

const outDir = path.resolve(process.argv[2] ?? path.join(repo, 'dist/ui-drive'));
fs.mkdirSync(outDir, { recursive: true });
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ascua-drive-'));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ascua-outside-'));
const projectDir = path.join(data, 'proyecto-demo');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const check = (cond, msg) => {
  console.log(cond ? '  ok  ' : '  FAIL', msg);
  if (!cond) failures.push(msg);
};

function makeFixture() {
  const w = (rel, content) => {
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

let app;

async function run() {
  makeFixture();
  const noSandbox =
    process.platform === 'linux' && process.env.ELECTRON_DISABLE_SANDBOX ? ['--no-sandbox'] : [];
  app = await _electron.launch(
    packaged
      ? {
          executablePath: path.resolve(packaged),
          args: [`--user-data-dir=${data}`, ...noSandbox],
          timeout: 40000,
        }
      : {
          executablePath: require('electron'),
          args: [`--user-data-dir=${data}`, ...noSandbox, main],
          env: { ...process.env, ASCUA_RENDERER: 'dist' },
          timeout: 40000,
        },
  );
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.waitForSelector('#ascua-host', { state: 'attached', timeout: 40000 });
  await sleep(1500);

  // dialog.showOpenDialog stub: each call shifts the next queued folder.
  await app.evaluate(({ dialog }) => {
    globalThis.__picks = [];
    dialog.showOpenDialog = async () => {
      const next = globalThis.__picks.shift();
      return next ? { canceled: false, filePaths: [next] } : { canceled: true, filePaths: [] };
    };
  });
  const queuePick = (dir) => app.evaluate((_, d) => globalThis.__picks.push(d), dir);

  const shot = async (name) => {
    await sleep(600);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    console.log('  shot', name);
  };
  const bounds = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  const isOpen = () => page.evaluate(() => document.body.classList.contains('is-open'));
  const open = async () => {
    await page.dblclick('#ascua-host');
    await page.waitForFunction(() => document.body.classList.contains('is-open'));
    await sleep(1200);
  };
  const clickText = async (text, scope = 'body') => {
    const ok = await page.evaluate(
      ({ text, scope }) => {
        const root = document.querySelector(scope);
        const el = [...root.querySelectorAll('button, a')].find(
          (e) => e.textContent.trim() === text || e.getAttribute('aria-label') === text,
        );
        if (!el) return false;
        el.click();
        return true;
      },
      { text, scope },
    );
    if (!ok) throw new Error(`No button/link "${text}" in ${scope}`);
  };
  const pane = (name) =>
    page.locator('.as-term', {
      has: page.locator('b', { hasText: new RegExp(`^${name}$`) }),
    });
  const paneText = (name) => pane(name).locator('.xterm-rows').innerText();
  const waitPaneText = async (name, needle, ms = 15000) => {
    const end = Date.now() + ms;
    let text = '';
    while (Date.now() < end) {
      text = await paneText(name).catch(() => '');
      if (text.includes(needle)) return true;
      await sleep(300);
    }
    return false;
  };
  const waitState = async (name, label, ms = 15000) => {
    try {
      await pane(name).locator('.as-state', { hasText: label }).waitFor({ timeout: ms });
      return true;
    } catch {
      return false;
    }
  };
  const addPista = async (name, command, port, folder) => {
    await page.click('.v9-tools >> text=Pista');
    await page.fill('#pista-name', name);
    await page.fill('#pista-cmd', command);
    if (port) await page.fill('#pista-port', String(port));
    if (folder) {
      await queuePick(folder);
      await page.click('.pista-pop__folder');
      await sleep(400);
    }
  };

  console.log('Project');
  await open();
  const winBounds = await bounds();
  const displayBounds = await app.evaluate(
    ({ screen }, b) => screen.getDisplayMatching(b).bounds,
    winBounds,
  );
  check(
    ['x', 'y', 'width', 'height'].every((k) => Math.abs(winBounds[k] - displayBounds[k]) <= 2),
    `room fills the display (${JSON.stringify(winBounds)} vs ${JSON.stringify(displayBounds)})`,
  );
  await shot('01-room-empty');
  await queuePick(projectDir);
  await clickText('Nuevo proyecto');
  await page.waitForSelector('#pf-name');
  await page.fill('#pf-name', 'Proyecto demo');
  await clickText('Elegir carpeta');
  await sleep(400);
  await clickText('Guardar');
  await page.waitForSelector('.v9-head h1:has-text("Proyecto demo")');
  check((await page.evaluate(() => location.hash)).includes('terminales'), 'project saved, terminals tab open');
  await shot('02-project-empty');

  console.log('Pistas');
  await addPista('back', 'echo back listo; sleep 600', 8080);
  await shot('03-pista-form');
  await clickText('Guardar', '.pista-pop');
  await page.waitForSelector('.pista-pop', { state: 'detached' });
  check((await pane('back').count()) === 1, 'pista "back" pane appears');

  await addPista('front', 'pwd; sleep 600', null, path.join(projectDir, 'web'));
  const folderText = (await page.locator('.pista-pop__folder').innerText()).trim();
  check(folderText === 'web/', `folder button reads "web/" (got "${folderText}")`);
  await clickText('Guardar', '.pista-pop');
  await page.waitForSelector('.pista-pop', { state: 'detached' });
  check((await pane('front').count()) === 1, 'pista "front" pane appears');

  // Folder outside the project -> error line.
  await page.click('.v9-tools >> text=Pista');
  await queuePick(outside);
  await page.click('.pista-pop__folder');
  await page.waitForSelector('.pista-pop [role="alert"]');
  const err = await page.locator('.pista-pop [role="alert"]').innerText();
  check(/dentro del proyecto/.test(err), `outside folder shows an error ("${err.trim()}")`);
  await page.focus('#pista-name');
  await page.keyboard.press('Escape');
  await sleep(500);
  check((await page.locator('.pista-pop').count()) === 0, 'Escape closes the pista form');
  check(await isOpen(), 'Escape in the pista form does not collapse the room');

  console.log('Shells');
  await page.click('.v9-tools >> text=Terminal');
  await page.click('.v9-tools >> text=Terminal');
  await pane('shell 2').waitFor();
  check((await pane('shell').count()) === 1, 'pane "shell" exists');
  check((await pane('shell 2').count()) === 1, 'pane "shell 2" exists');
  await pane('shell').locator('.xterm-screen').click();
  await page.keyboard.type('pwd\n', { delay: 20 });
  check(await waitPaneText('shell', 'proyecto-demo'), 'pwd in "shell" prints the project folder');
  await shot('04-panes');

  await page.click('button[aria-label="Cerrar shell 2"]');
  await sleep(800);
  check((await pane('shell 2').count()) === 0, 'closing "shell 2" removes its pane');
  check((await pane('shell').count()) === 1, '"shell" stays');

  console.log('Levantar / Detener todo');
  await page.click('.as-side__start');
  check(await waitState('back', 'Corriendo'), 'back is Corriendo');
  check(await waitState('front', 'Corriendo'), 'front is Corriendo');
  check(await waitPaneText('front', '/web'), 'front output contains /web');
  check(await waitPaneText('back', 'back listo'), 'back output contains "back listo"');
  await shot('05-running');
  const chip = (await page.locator('.v9-head .as-chip').innerText()).replace(/\s+/g, ' ').trim();
  check(chip === '3 de 3 corriendo', `chip reads "3 de 3 corriendo" (got "${chip}")`);
  console.log('Viewports');
  // CDP metrics override: webContents.enableDeviceEmulation changes innerWidth but
  // Playwright screenshots then show the unemulated layout cropped.
  const viewports = async (name, extra) => {
    const cdp = await page.context().newCDPSession(page);
    for (const [w, h] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) {
      const tag = `${w}x${h}`;
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await sleep(900);
      const c = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const sw = (s) => {
          const e = q(s);
          return e ? e.scrollWidth <= e.clientWidth : false;
        };
        const visible = (s) => {
          const r = q(s)?.getBoundingClientRect();
          return !!r && r.top >= 0 && r.bottom <= innerHeight && r.height > 0;
        };
        return {
          iw: innerWidth,
          ih: innerHeight,
          noX: sw('#room') && sw('.v9-main') && sw('.as-side'),
          pageScroll: document.documentElement.scrollHeight > innerHeight,
          h1: visible('.v9-head h1'),
          tabs: visible('.as-tabs'),
          wisp: !!q('.as-rail__ascua svg'),
        };
      });
      check(c.iw === w && c.ih === h, `${tag}: viewport is ${c.iw}x${c.ih}`);
      check(c.noX, `${tag}: no horizontal overflow in #room, .v9-main, .as-side`);
      check(!c.pageScroll, `${tag}: page does not scroll vertically`);
      check(c.h1 && c.tabs, `${tag}: head title and tabs are visible`);
      check(c.wisp, `${tag}: rail shows the wisp`);
      await extra(w, h, tag);
      await shot(`${name}-${tag}`);
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await sleep(600);
  };
  await viewports('terminales', async (w, h, tag) => {
    const m = await page.evaluate(() => {
      const bars = [...document.querySelectorAll('.as-term__bar')].map((e) => {
        const r = e.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      });
      const grid = document.querySelector('.as-term-grid');
      return {
        bars,
        cols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        lastSpan: (() => {
          const panes = [...document.querySelectorAll('.as-term-grid .as-term')];
          const last = panes[panes.length - 1];
          return {
            n: panes.length,
            last: last ? last.getBoundingClientRect().width : 0,
            grid: grid ? grid.clientWidth - 40 : 0,
          };
        })(),
      };
    });
    check(m.bars.length >= 3 && m.bars.every(Boolean), `${tag}: all ${m.bars.length} pane bars are visible`);
    check(m.cols === 2, `${tag}: grid has 2 columns (got ${m.cols})`);
    if (w === 1920 && m.lastSpan.n >= 3 && m.lastSpan.n % 2 === 1) {
      check(
        Math.abs(m.lastSpan.last - m.lastSpan.grid) <= 6,
        `${tag}: odd last pane spans the grid (${m.lastSpan.last} vs ${m.lastSpan.grid})`,
      );
    }
  });

  await clickText('Detener todo');
  check(await waitState('back', 'Detenida'), 'back is Detenida after Detener todo');
  check(await waitState('front', 'Detenida'), 'front is Detenida after Detener todo');

  console.log('Minimize / reopen');
  await clickText('Minimize');
  await page.waitForFunction(() => !document.body.classList.contains('is-open'));
  await sleep(800);
  await open();
  check(await waitPaneText('shell', 'proyecto-demo'), 'shell output survives minimize + reopen');

  console.log('Hash navigation while open');
  await clickText('Editar proyecto');
  await page.waitForSelector('#pf-name');
  await sleep(800);
  check(await isOpen(), 'a route change does not collapse the room');
  await clickText('Cancelar', '#room');
  await page.waitForSelector('.as-term-grid');

  console.log('Reload while open');
  // What Ctrl+R does (Playwright's page.reload() fails on file:// + hash URLs).
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.reload());
  await sleep(1500);
  await page.waitForSelector('#ascua-host', { state: 'attached' });
  await sleep(2500);
  const b = await bounds();
  check(b.width === 420 && b.height === 320, `window back to compact 420x320 (got ${b.width}x${b.height})`);
  check(!(await isOpen()), 'no is-open after reload');
  await shot('06-after-reload');
  await open();
  await page.waitForSelector('.as-term-grid');
  check((await pane('back').count()) === 1 && (await pane('front').count()) === 1, 'pistas are back after reload');
  check(await waitPaneText('shell', 'proyecto-demo'), 'shell output is back after reload');
  await shot('07-reopened');

  console.log('Archivos');
  await app.evaluate(({ shell }) => {
    globalThis.__opened = [];
    globalThis.__revealed = [];
    shell.showItemInFolder = (p) => {
      globalThis.__revealed.push(p);
    };
    shell.openPath = async (p) => {
      globalThis.__opened.push(p);
      return '';
    };
  });
  const rowSel = '.files__scroll .as-tree__row';
  const rowNames = () => page.$$eval(rowSel, (els) => els.map((e) => e.textContent.trim()));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const row = (name) => page.locator(rowSel).filter({ hasText: new RegExp(`^\\s*${esc(name)}\\s*$`) });
  await clickText('Archivos', '.as-tabs');
  await page.waitForSelector(rowSel);
  let names = await rowNames();
  check(names.includes('README.md') && names.includes('web'), 'tree shows README.md and web');
  check(!names.includes('.git'), 'tree hides .git');
  await row('web').click();
  await row('index.ts').waitFor();
  check((await row('index.ts').count()) === 1, 'expanding web shows index.ts');
  await row('README.md').click();
  await page.waitForSelector('#file-code .cm-content');
  check((await page.locator('#file-path').innerText()).trim() === 'README.md', 'viewer header shows README.md');
  check((await page.locator('#file-code .cm-gutters').innerText()).trim().startsWith('1'), 'gutter starts at 1');
  check((await page.locator('#file-code .cm-content').innerText()).includes('# demo'), 'editor shows "# demo"');
  await row('logo.bin').click();
  await page.locator('.files__empty', { hasText: 'Archivo binario' }).waitFor();
  check((await page.locator('.files__empty', { hasText: 'Archivo binario' }).count()) === 1, 'logo.bin shows "Archivo binario"');
  const hasBtn = (text) =>
    page.evaluate(
      (t) => [...document.querySelectorAll('.files__head button')].some((e) => e.textContent.trim() === t),
      text,
    );
  check((await hasBtn('Mostrar en carpeta')) && !(await hasBtn('Abrir en editor')), 'logo.bin offers only "Mostrar en carpeta"');
  await clickText('Mostrar en carpeta', '.files__head');
  await sleep(400);
  let revealed = await app.evaluate(() => globalThis.__revealed);
  check(revealed.length === 1 && revealed[0].endsWith('logo.bin'), `Mostrar en carpeta reveals logo.bin (${revealed})`);
  await row('run.cmd').click();
  await page.locator('#file-path', { hasText: 'run.cmd' }).waitFor();
  await page.waitForSelector('#file-code .cm-content');
  await sleep(300);
  check((await hasBtn('Mostrar en carpeta')) && !(await hasBtn('Abrir en editor')), 'run.cmd offers only "Mostrar en carpeta"');
  await clickText('Mostrar en carpeta', '.files__head');
  await sleep(400);
  revealed = await app.evaluate(() => globalThis.__revealed);
  check(revealed.length === 2 && revealed[1].endsWith('run.cmd'), `Mostrar en carpeta reveals run.cmd (${revealed})`);
  check((await app.evaluate(() => globalThis.__opened.length)) === 0, 'run.cmd was never launched');
  if (process.platform !== 'win32') {
    // Exec bit (0o755) on a text file: launch-policy must still refuse to open it.
    await row('notes.md').click();
    await page.locator('#file-path', { hasText: 'notes.md' }).waitFor();
    await page.waitForSelector('#file-code .cm-content');
    await sleep(300);
    check((await hasBtn('Mostrar en carpeta')) && !(await hasBtn('Abrir en editor')), 'notes.md (+x) offers only "Mostrar en carpeta"');
    await clickText('Mostrar en carpeta', '.files__head');
    await sleep(400);
    revealed = await app.evaluate(() => globalThis.__revealed);
    check(revealed.length === 3 && revealed[2].endsWith('notes.md'), `Mostrar en carpeta reveals notes.md (${revealed})`);
    check((await app.evaluate(() => globalThis.__opened.length)) === 0, 'notes.md was never launched');
  }

  await page.click('#files-filter');
  await page.keyboard.type('index', { delay: 20 });
  await row('web/index.ts').waitFor();
  names = await rowNames();
  check(!names.includes('README.md'), 'filter "index" does not list README.md');
  await row('web/index.ts').click();
  await page.locator('#file-path', { hasText: 'web/index.ts' }).waitFor();
  check((await page.locator('#file-code .cm-content').innerText()).includes('export const x'), 'clicking a result opens it');
  await page.focus('#files-filter');
  await page.keyboard.press('Escape');
  await sleep(500);
  check((await page.inputValue('#files-filter')) === '', 'Escape clears the filter');
  check(await isOpen(), 'Escape in the filter does not collapse the room');

  await row('README.md').click();
  await page.locator('#file-path', { hasText: 'README.md' }).waitFor();
  await page.waitForSelector('#file-code .cm-content');
  await sleep(300);
  await clickText('Abrir en editor', '.files__head');
  await sleep(500);
  const opened = await app.evaluate(() => globalThis.__opened);
  check(opened.length === 1 && opened[0].endsWith('README.md'), `Abrir en editor opens README.md (${opened})`);

  console.log('Editor');
  const readme = path.join(projectDir, 'README.md');
  const dirtyDot = () => page.locator('.files__dirty').count();
  const banner = (text) => page.locator('.files__banner', { hasText: text }).count();
  const typeAtEnd = async (text) => {
    await page.click('#file-code .cm-content');
    await page.keyboard.press('Control+End');
    await page.keyboard.type(text, { delay: 20 });
  };
  const editorText = () => page.locator('#file-code .cm-content').innerText();
  check((await dirtyDot()) === 0, 'no dirty dot while clean');
  await typeAtEnd('EDIT1');
  await sleep(300);
  check((await dirtyDot()) === 1, 'typing shows the dirty dot');
  await page.keyboard.press('Escape');
  await sleep(500);
  check(await isOpen(), 'Escape in the editor does not collapse the room');
  await page.keyboard.press('Control+s');
  await sleep(800);
  check(fs.readFileSync(readme, 'utf8').includes('Proyecto de prueba\nEDIT1'), 'Ctrl+S writes README.md on disk');
  check((await dirtyDot()) === 0, 'saving clears the dirty dot');

  fs.writeFileSync(readme, 'externo\n');
  await typeAtEnd('Z');
  await page.keyboard.press('Control+s');
  await page.locator('.files__banner', { hasText: 'El archivo cambió en disco.' }).waitFor();
  check(fs.readFileSync(readme, 'utf8') === 'externo\n', 'a conflicting save leaves the disk text alone');
  await shot('08-conflict');
  await clickText('Recargar', '.files__banner');
  await sleep(800);
  check((await banner('cambió en disco')) === 0, 'Recargar clears the conflict banner');
  check((await editorText()).includes('externo') && !(await editorText()).includes('Z'), 'Recargar shows the disk text');
  check((await dirtyDot()) === 0, 'Recargar leaves the editor clean');

  fs.writeFileSync(readme, 'externo2\n');
  await typeAtEnd('Q');
  await page.keyboard.press('Control+s');
  await page.locator('.files__banner', { hasText: 'El archivo cambió en disco.' }).waitFor();
  await clickText('Sobrescribir', '.files__banner');
  await sleep(800);
  check(fs.readFileSync(readme, 'utf8') === 'externo\nQ', `Sobrescribir writes the editor text (${JSON.stringify(fs.readFileSync(readme, 'utf8'))})`);
  check((await dirtyDot()) === 0 && (await banner('cambió en disco')) === 0, 'Sobrescribir clears dot and banner');

  await typeAtEnd('W');
  await sleep(300);
  await clickText('Terminales', '.as-tabs');
  await page.locator('.files__banner', { hasText: 'Tenés cambios sin guardar.' }).waitFor();
  check((await page.evaluate(() => location.hash)).includes('archivos'), 'dirty: the Terminales tab asks first and stays');
  await clickText('Seguir editando', '.files__banner');
  await sleep(500);
  check((await banner('Tenés cambios')) === 0 && (await dirtyDot()) === 1, 'Seguir editando keeps the edits');
  await clickText('Terminales', '.as-tabs');
  await page.locator('.files__banner', { hasText: 'Tenés cambios sin guardar.' }).waitFor();
  await clickText('Descartar', '.files__banner');
  await page.waitForSelector('.as-term-grid');
  check((await page.evaluate(() => location.hash)).includes('terminales'), 'Descartar leaves for Terminales');
  check(fs.readFileSync(readme, 'utf8') === 'externo\nQ', 'Descartar does not write the edits');
  await clickText('Archivos', '.as-tabs');
  await page.waitForSelector(rowSel);
  await row('web').click();
  await row('index.ts').click();
  await page.locator('#file-path', { hasText: 'web/index.ts' }).waitFor();
  await page.waitForSelector('#file-code .cm-content');

  await viewports('archivos', async (w, h, tag) => {
    const m = await page.evaluate(() => {
      const inView = (s) => {
        const r = document.querySelector(s)?.getBoundingClientRect();
        return !!r && r.top >= 0 && r.bottom <= innerHeight && r.height > 0;
      };
      return { tree: inView('.files__tree'), viewer: inView('.files__viewer') };
    });
    check(m.tree && m.viewer, `${tag}: tree and viewer fit the viewport`);
  });
}

run()
  .catch(async (e) => {
    console.error('DRIVER ERROR', e);
    failures.push(`driver error: ${e.message}`);
  })
  .finally(async () => {
    if (app) {
      try {
        await app.close();
      } catch {
        // already closed or crashed
      }
    }
    for (const dir of [data, outside]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // locked temp files are not worth failing for
      }
    }
    if (failures.length) {
      console.error(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
      process.exit(1);
    }
    console.log('\nui-drive: all checks passed');
    process.exit(0);
  });
