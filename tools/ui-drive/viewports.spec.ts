import { expect, test } from '@playwright/test';
import { demoProject, useAscua } from './ascua';
import { drive } from './helpers';

// The terminales sweep lives in terminals.spec.ts (it needs the running panes).
const ascua = useAscua({
  projects: ({ projectDir }) => [demoProject(projectDir)],
});
const d = drive(ascua);

test('archivos: tree and viewer fit 1280x720 to 1920x1080', async () => {
  await d.open();
  await d.goto('#/proyectos/demo/archivos');
  const rows = '.as-files__scroll .as-tree__row';
  await d.page.waitForSelector(rows);
  await d.page
    .locator(rows)
    .filter({ hasText: /^\s*web\s*$/ })
    .click();
  await d.page
    .locator(rows)
    .filter({ hasText: /^\s*index\.ts\s*$/ })
    .click();
  await d.page.locator('#file-path', { hasText: 'web/index.ts' }).waitFor();
  await d.page.waitForSelector('#file-code .cm-content');

  await d.sweepViewports('archivos', async (_w, _h, tag) => {
    const m = await d.page.evaluate(() => {
      const inView = (s: string) => {
        const r = document.querySelector(s)?.getBoundingClientRect();
        return !!r && r.top >= 0 && r.bottom <= innerHeight && r.height > 0;
      };
      return {
        tree: inView('.as-files__tree'),
        viewer: inView('.as-files__viewer'),
      };
    });
    expect
      .soft(m.tree && m.viewer, `${tag}: tree and viewer fit the viewport`)
      .toBe(true);
  });
});
