import { expect, test } from '@playwright/test';
import { PISTAS, demoProject, useAscua } from './ascua';
import { drive } from './helpers';

const ascua = useAscua({
  projects: ({ projectDir }) => [demoProject(projectDir, PISTAS)],
});
const d = drive(ascua);

test('shells open in the project folder and close', async () => {
  await d.open();
  await d.goto('#/proyectos/demo/terminales');
  await d.page.click('.as-page-head__tools >> text=Terminal');
  await d.page.click('.as-page-head__tools >> text=Terminal');
  await d.pane('shell 2').waitFor();
  expect(await d.pane('shell').count()).toBe(1);
  expect(await d.pane('shell 2').count()).toBe(1);
  await d.pane('shell').locator('.xterm-screen').click();
  await d.page.keyboard.type('pwd\n', { delay: 20 });
  expect(await d.waitPaneText('shell', 'proyecto-demo')).toBe(true);
  await d.shot('terminals-01-panes');

  await d.page.click('button[aria-label="Cerrar shell 2"]');
  await d.sleep(800);
  expect(await d.pane('shell 2').count()).toBe(0);
  expect(await d.pane('shell').count()).toBe(1);
});

test('Levantar todo starts the pistas and the chip counts them', async () => {
  await d.page.click('.as-side__start');
  expect(await d.waitState('back', 'Corriendo')).toBe(true);
  expect(await d.waitState('front', 'Corriendo')).toBe(true);
  expect(await d.waitPaneText('front', '/web')).toBe(true);
  expect(await d.waitPaneText('back', 'back listo')).toBe(true);
  await d.shot('terminals-02-running');
  const chip = (await d.page.locator('.as-page-head .as-chip').innerText())
    .replace(/\s+/g, ' ')
    .trim();
  expect(chip).toBe('3 de 3 corriendo');
});

test('the terminals grid fits 1280x720 to 1920x1080', async () => {
  await d.sweepViewports('terminals', async (w, _h, tag) => {
    const m = await d.page.evaluate(() => {
      const bars = [...document.querySelectorAll('.as-term__bar')].map((e) => {
        const r = e.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      });
      const grid = document.querySelector('.as-term-grid');
      const panes = [...document.querySelectorAll('.as-term-grid .as-term')];
      const last = panes[panes.length - 1];
      return {
        bars,
        cols: grid
          ? getComputedStyle(grid).gridTemplateColumns.split(' ').length
          : 0,
        n: panes.length,
        last: last ? last.getBoundingClientRect().width : 0,
        grid: grid ? grid.clientWidth - 40 : 0,
      };
    });
    expect
      .soft(
        m.bars.length >= 3 && m.bars.every(Boolean),
        `${tag}: all ${m.bars.length} pane bars are visible`,
      )
      .toBe(true);
    expect.soft(m.cols, `${tag}: grid columns`).toBe(2);
    if (w === 1920 && m.n >= 3 && m.n % 2 === 1) {
      expect
        .soft(Math.abs(m.last - m.grid), `${tag}: odd last pane spans the grid`)
        .toBeLessThanOrEqual(6);
    }
  });
});

test('Detener todo stops the pistas', async () => {
  await d.clickText('Detener todo');
  expect(await d.waitState('back', 'Detenida')).toBe(true);
  expect(await d.waitState('front', 'Detenida')).toBe(true);
});
