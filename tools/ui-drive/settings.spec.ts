import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PISTAS, demoProject, useAscua } from './ascua';
import { drive } from './helpers';

// Runs in Spanish (seeded settings.json), switches to English in Ajustes and
// checks the choice survives a relaunch on the same user-data dir.
const ascua = useAscua({
  projects: ({ projectDir }) => [demoProject(projectDir, PISTAS)],
});
const d = drive(ascua);

const settingsFile = () => path.join(ascua.data, 'settings.json');
const savedLanguage = () =>
  JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).language;
const rail = () => d.page.locator('.as-rail').innerText();
const tabs = () => d.page.locator('.as-tabs').innerText();

const chooseLanguage = async (language: 'es' | 'en') => {
  await d.goto('#/ajustes');
  await d.page.waitForSelector('#settings-language');
  await d.page.selectOption('#settings-language', language);
  await d.sleep(500);
};

test('picking English in Ajustes translates the screens without a reload', async () => {
  await d.open();
  await d.goto('#/proyectos/demo/terminales');
  expect(await rail()).toContain('Proyectos');
  await d.page.locator('.as-rail__item', { hasText: 'Ajustes' }).click();
  await d.page.waitForSelector('#settings-language');
  expect(await d.page.inputValue('#settings-language')).toBe('es');
  await d.page.selectOption('#settings-language', 'en');
  await d.sleep(500);
  expect(await d.page.inputValue('#settings-language')).toBe('en');
  expect(await d.page.evaluate(() => document.documentElement.lang)).toBe('en');
  expect(await rail()).toContain('Projects');
  expect(await rail()).toContain('Settings');
  await d.shot('settings-01-english');

  await d.goto('#/proyectos/demo/terminales');
  await d.page.waitForSelector('.as-tabs');
  const t = await tabs();
  expect(t).toContain('Terminals');
  expect(t).toContain('Files');
  expect(await d.page.locator('.as-side').innerText()).toContain('Start all');

  await d.page.click('.as-page-head__tools >> text=Track');
  await d.queuePick(ascua.outside);
  await d.page.click('.as-pista-form__folder');
  await d.page.waitForSelector('.as-pista-form [role="alert"]');
  expect(
    await d.page.locator('.as-pista-form [role="alert"]').innerText(),
  ).toContain('The folder must be inside the project.');
  await d.page.focus('#pista-name');
  await d.page.keyboard.press('Escape');
  await d.sleep(500);
});

test('the editor search panel follows the language', async () => {
  const searchPanel = async () => {
    await d.goto('#/proyectos/demo/archivos');
    await d.page.waitForSelector('.as-files__scroll .as-tree__row');
    await d.page
      .locator('.as-files__scroll .as-tree__row')
      .filter({ hasText: /^\s*README\.md\s*$/ })
      .click();
    await d.page.waitForSelector('#file-code .cm-content');
    await d.page.click('#file-code .cm-content');
    await d.page.keyboard.press('Control+f');
    await d.page.waitForSelector('.cm-search');
    const text = await d.page.locator('.cm-search').textContent();
    await d.page.keyboard.press('Escape');
    await d.sleep(300);
    return text;
  };

  // Spanish first: CodeMirror's own default is English, so this proves the
  // phrases come from the catalog. Ends in English for the relaunch test.
  await chooseLanguage('es');
  expect(await searchPanel()).toContain('coincidir mayúsculas');
  await chooseLanguage('en');
  expect(await searchPanel()).toContain('match case');
});

test('English survives a relaunch', async () => {
  expect(savedLanguage()).toBe('en');
  await ascua.relaunch();
  await d.open();
  expect(await rail()).toContain('Projects');
  expect(await rail()).toContain('Settings');
  await d.goto('#/proyectos/demo/terminales');
  await d.page.waitForSelector('.as-tabs');
  expect(await tabs()).toContain('Terminals');
  expect(await d.page.evaluate(() => document.documentElement.lang)).toBe('en');
  await d.shot('settings-02-relaunched');
});

test('switching back to Espanol restores the Spanish labels', async () => {
  await chooseLanguage('es');
  expect(savedLanguage()).toBe('es');
  expect(await rail()).toContain('Proyectos');
  expect(await rail()).toContain('Ajustes');
  await d.goto('#/proyectos/demo/terminales');
  await d.page.waitForSelector('.as-tabs');
  expect(await tabs()).toContain('Terminales');
  expect(await tabs()).toContain('Archivos');
  expect(await d.page.locator('.as-side').innerText()).toContain(
    'Levantar todo',
  );
  expect(await d.isOpen()).toBe(true);
});
