import { expect, test } from '@playwright/test';
import { PISTAS, demoProject, useAscua } from './ascua';
import { drive } from './helpers';

const ascua = useAscua({
  projects: ({ projectDir }) => [demoProject(projectDir, PISTAS)],
});
const d = drive(ascua);

test('the room fills the display', async () => {
  await d.open();
  const win = await d.bounds();
  const display = await ascua.app.evaluate(
    ({ screen }, b) => screen.getDisplayMatching(b).bounds,
    win,
  );
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    expect(
      Math.abs(win[k] - display[k]),
      `${k} of ${JSON.stringify(win)} vs ${JSON.stringify(display)}`,
    ).toBeLessThanOrEqual(2);
  }
  await d.shot('room-01-empty');
});

test('minimize and reopen keep the shell output', async () => {
  await d.goto('#/proyectos/demo/terminales');
  await d.page.click('.as-page-head__tools >> text=Terminal');
  await d.pane('shell').waitFor();
  await d.pane('shell').locator('.xterm-screen').click();
  await d.page.keyboard.type('pwd\n', { delay: 20 });
  expect(await d.waitPaneText('shell', 'proyecto-demo')).toBe(true);

  await d.clickText('Minimizar');
  await d.page.waitForFunction(
    () => !document.body.classList.contains('is-open'),
  );
  await d.sleep(800);
  await d.open();
  expect(await d.waitPaneText('shell', 'proyecto-demo')).toBe(true);
});

test('a route change keeps the room open', async () => {
  await d.clickText('Editar proyecto');
  await d.page.waitForSelector('#pf-name');
  await d.sleep(800);
  expect(await d.isOpen()).toBe(true);
  await d.clickText('Cancelar', '#room');
  await d.page.waitForSelector('.as-term-grid');
});

test('reload while open returns to the compact window and restores the panes', async () => {
  // What Ctrl+R does (Playwright's page.reload() fails on file:// + hash URLs).
  await ascua.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.reload(),
  );
  await d.sleep(1500);
  await d.page.waitForSelector('#ascua-host', { state: 'attached' });
  await d.sleep(2500);
  const b = await d.bounds();
  expect([b.width, b.height], 'compact window').toEqual([420, 320]);
  expect(await d.isOpen()).toBe(false);
  await d.shot('room-02-after-reload');

  await d.open();
  await d.page.waitForSelector('.as-term-grid');
  expect(await d.pane('back').count()).toBe(1);
  expect(await d.pane('front').count()).toBe(1);
  expect(await d.waitPaneText('shell', 'proyecto-demo')).toBe(true);
  await d.shot('room-03-reopened');
});
