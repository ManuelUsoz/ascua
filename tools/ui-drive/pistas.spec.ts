import { expect, test } from '@playwright/test';
import * as path from 'node:path';
import { demoProject, useAscua } from './ascua';
import { drive } from './helpers';

const ascua = useAscua({
  projects: ({ projectDir }) => [demoProject(projectDir)],
});
const d = drive(ascua);

test('add a pista with a port', async () => {
  await d.open();
  await d.goto('#/proyectos/demo/terminales');
  await d.addPista('back', 'echo back listo; sleep 600', 8080);
  await d.shot('pistas-01-form');
  await d.clickText('Guardar', '.as-pista-form');
  await d.page.waitForSelector('.as-pista-form', { state: 'detached' });
  expect(await d.pane('back').count()).toBe(1);
});

test('add a pista with a folder inside the project', async () => {
  await d.addPista(
    'front',
    'pwd; sleep 600',
    null,
    path.join(ascua.projectDir, 'web'),
  );
  const folder = (
    await d.page.locator('.as-pista-form__folder').innerText()
  ).trim();
  expect(folder).toBe('web/');
  await d.clickText('Guardar', '.as-pista-form');
  await d.page.waitForSelector('.as-pista-form', { state: 'detached' });
  expect(await d.pane('front').count()).toBe(1);
});

test('a folder outside the project shows an error and Escape closes the form only', async () => {
  await d.page.click('.as-page-head__tools >> text=Pista');
  await d.queuePick(ascua.outside);
  await d.page.click('.as-pista-form__folder');
  await d.page.waitForSelector('.as-pista-form [role="alert"]');
  expect(
    await d.page.locator('.as-pista-form [role="alert"]').innerText(),
  ).toMatch(/dentro del proyecto/);
  await d.page.focus('#pista-name');
  await d.page.keyboard.press('Escape');
  await d.sleep(500);
  expect(await d.page.locator('.as-pista-form').count()).toBe(0);
  expect(
    await d.isOpen(),
    'Escape in the pista form does not collapse the room',
  ).toBe(true);
});
