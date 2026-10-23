import { expect, test } from '@playwright/test';
import { demoProject, useAscua } from './ascua';
import { drive } from './helpers';

const ascua = useAscua({
  projects: ({ projectDir }) => [demoProject(projectDir)],
});
const d = drive(ascua);

const rowSel = '.as-files__scroll .as-tree__row';
const rowNames = () =>
  d.page.$$eval(rowSel, (els) => els.map((e) => (e.textContent ?? '').trim()));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const row = (name: string) =>
  d.page
    .locator(rowSel)
    .filter({ hasText: new RegExp(`^\\s*${esc(name)}\\s*$`) });
const hasBtn = (text: string) =>
  d.page.evaluate(
    (t) =>
      [...document.querySelectorAll('.as-files__head button')].some(
        (e) => (e.textContent ?? '').trim() === t,
      ),
    text,
  );
const revealed = () =>
  ascua.app.evaluate(
    () => (globalThis as unknown as { __revealed: string[] }).__revealed,
  );
const opened = () =>
  ascua.app.evaluate(
    () => (globalThis as unknown as { __opened: string[] }).__opened,
  );

/** Selects a file and waits for the editor to show it. */
async function select(name: string) {
  await row(name).click();
  await d.page.locator('#file-path', { hasText: name }).waitFor();
  await d.page.waitForSelector('#file-code .cm-content');
  await d.sleep(300);
}

test('the tree lists the project files and hides .git', async () => {
  await d.open();
  await d.goto('#/proyectos/demo/archivos');
  await d.page.waitForSelector(rowSel);
  const names = await rowNames();
  expect(names).toContain('README.md');
  expect(names).toContain('web');
  expect(names).not.toContain('.git');
  await row('web').click();
  await row('index.ts').waitFor();
  expect(await row('index.ts').count()).toBe(1);
});

test('a text file opens in the viewer', async () => {
  await row('README.md').click();
  await d.page.waitForSelector('#file-code .cm-content');
  expect((await d.page.locator('#file-path').innerText()).trim()).toBe(
    'README.md',
  );
  expect(
    (await d.page.locator('#file-code .cm-gutters').innerText())
      .trim()
      .startsWith('1'),
  ).toBe(true);
  expect(await d.page.locator('#file-code .cm-content').innerText()).toContain(
    '# demo',
  );
});

test('a binary file offers only Mostrar en carpeta', async () => {
  await row('logo.bin').click();
  const empty = d.page.locator('.as-files__empty', {
    hasText: 'Archivo binario',
  });
  await empty.waitFor();
  expect(await empty.count()).toBe(1);
  expect(await hasBtn('Mostrar en carpeta')).toBe(true);
  expect(await hasBtn('Abrir en editor')).toBe(false);
  await d.clickText('Mostrar en carpeta', '.as-files__head');
  await d.sleep(400);
  const r = await revealed();
  expect(r).toHaveLength(1);
  expect(r[0].endsWith('logo.bin')).toBe(true);
});

test('run.cmd is revealed, never launched', async () => {
  await select('run.cmd');
  expect(await hasBtn('Mostrar en carpeta')).toBe(true);
  expect(await hasBtn('Abrir en editor')).toBe(false);
  await d.clickText('Mostrar en carpeta', '.as-files__head');
  await d.sleep(400);
  const r = await revealed();
  expect(r).toHaveLength(2);
  expect(r[1].endsWith('run.cmd')).toBe(true);
  expect(await opened()).toHaveLength(0);
});

test('an executable text file (+x) is revealed, never launched', async () => {
  test.skip(process.platform === 'win32', 'no exec bit on Windows');
  await select('notes.md');
  expect(await hasBtn('Mostrar en carpeta')).toBe(true);
  expect(await hasBtn('Abrir en editor')).toBe(false);
  await d.clickText('Mostrar en carpeta', '.as-files__head');
  await d.sleep(400);
  const r = await revealed();
  expect(r).toHaveLength(3);
  expect(r[2].endsWith('notes.md')).toBe(true);
  expect(await opened()).toHaveLength(0);
});

test('the filter lists matches and Escape clears it without collapsing the room', async () => {
  await d.page.click('#files-filter');
  await d.page.keyboard.type('index', { delay: 20 });
  await row('web/index.ts').waitFor();
  expect(await rowNames()).not.toContain('README.md');
  await row('web/index.ts').click();
  await d.page.locator('#file-path', { hasText: 'web/index.ts' }).waitFor();
  expect(await d.page.locator('#file-code .cm-content').innerText()).toContain(
    'export const x',
  );
  await d.page.focus('#files-filter');
  await d.page.keyboard.press('Escape');
  await d.sleep(500);
  expect(await d.page.inputValue('#files-filter')).toBe('');
  expect(await d.isOpen()).toBe(true);
});

test('Abrir en editor opens a plain text file', async () => {
  await select('README.md');
  await d.clickText('Abrir en editor', '.as-files__head');
  await d.sleep(500);
  const o = await opened();
  expect(o).toHaveLength(1);
  expect(o[0].endsWith('README.md')).toBe(true);
});
