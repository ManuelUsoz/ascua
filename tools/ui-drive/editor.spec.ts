import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PISTAS, demoProject, useAscua } from './ascua';
import { drive } from './helpers';

// Seeded pistas give the terminals tab a grid to land on.
const ascua = useAscua({
  projects: ({ projectDir }) => [demoProject(projectDir, PISTAS)],
});
const d = drive(ascua);

const rowSel = '.as-files__scroll .as-tree__row';
const dirtyDot = () => d.page.locator('.as-files__dirty').count();
const banner = (text: string) =>
  d.page.locator('.as-files__banner', { hasText: text }).count();
const editorText = () => d.page.locator('#file-code .cm-content').innerText();
const readme = () => path.join(ascua.projectDir, 'README.md');
const typeAtEnd = async (text: string) => {
  await d.page.click('#file-code .cm-content');
  await d.page.keyboard.press('Control+End');
  await d.page.keyboard.type(text, { delay: 20 });
};

test('typing marks the file dirty and Ctrl+S writes it', async () => {
  await d.open();
  await d.goto('#/proyectos/demo/archivos');
  await d.page.waitForSelector(rowSel);
  await d.page
    .locator(rowSel)
    .filter({ hasText: /^\s*README\.md\s*$/ })
    .click();
  await d.page.locator('#file-path', { hasText: 'README.md' }).waitFor();
  await d.page.waitForSelector('#file-code .cm-content');
  await d.sleep(300);

  expect(await dirtyDot()).toBe(0);
  await typeAtEnd('EDIT1');
  await d.sleep(300);
  expect(await dirtyDot()).toBe(1);
  await d.page.keyboard.press('Escape');
  await d.sleep(500);
  expect(await d.isOpen()).toBe(true);
  await d.page.keyboard.press('Control+s');
  await d.sleep(800);
  expect(fs.readFileSync(readme(), 'utf8')).toContain(
    'Proyecto de prueba\nEDIT1',
  );
  expect(await dirtyDot()).toBe(0);
});

test('a conflicting save can be reloaded', async () => {
  fs.writeFileSync(readme(), 'externo\n');
  await typeAtEnd('Z');
  await d.page.keyboard.press('Control+s');
  await d.page
    .locator('.as-files__banner', { hasText: 'El archivo cambió en disco.' })
    .waitFor();
  expect(fs.readFileSync(readme(), 'utf8')).toBe('externo\n');
  await d.shot('editor-01-conflict');
  await d.clickText('Recargar', '.as-files__banner');
  await d.sleep(800);
  expect(await banner('cambió en disco')).toBe(0);
  expect(await editorText()).toContain('externo');
  expect(await editorText()).not.toContain('Z');
  expect(await dirtyDot()).toBe(0);
});

test('a conflicting save can be overwritten', async () => {
  fs.writeFileSync(readme(), 'externo2\n');
  await typeAtEnd('Q');
  await d.page.keyboard.press('Control+s');
  await d.page
    .locator('.as-files__banner', { hasText: 'El archivo cambió en disco.' })
    .waitFor();
  await d.clickText('Sobrescribir', '.as-files__banner');
  await d.sleep(800);
  expect(fs.readFileSync(readme(), 'utf8')).toBe('externo\nQ');
  expect(await dirtyDot()).toBe(0);
  expect(await banner('cambió en disco')).toBe(0);
});

test('unsaved edits are guarded when changing tab', async () => {
  await typeAtEnd('W');
  await d.sleep(300);
  await d.clickText('Terminales', '.as-tabs');
  await d.page
    .locator('.as-files__banner', { hasText: 'Tenés cambios sin guardar.' })
    .waitFor();
  expect(await d.page.evaluate(() => location.hash)).toContain('archivos');
  await d.clickText('Seguir editando', '.as-files__banner');
  await d.sleep(500);
  expect(await banner('Tenés cambios')).toBe(0);
  expect(await dirtyDot()).toBe(1);

  await d.clickText('Terminales', '.as-tabs');
  await d.page
    .locator('.as-files__banner', { hasText: 'Tenés cambios sin guardar.' })
    .waitFor();
  await d.clickText('Descartar', '.as-files__banner');
  await d.page.waitForSelector('.as-term-grid');
  expect(await d.page.evaluate(() => location.hash)).toContain('terminales');
  expect(fs.readFileSync(readme(), 'utf8')).toBe('externo\nQ');
});
