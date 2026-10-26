import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PISTAS, demoProject, useAscua } from './ascua';
import { drive } from './helpers';

// Where fake-claude.mjs records every spawn (`<pid> <timestamp>`).
const starts = path.join(os.tmpdir(), `ascua-fake-starts-${process.pid}.log`);
const spawned = () =>
  fs.existsSync(starts)
    ? fs
        .readFileSync(starts, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split(' ')[0])
    : [];
fs.rmSync(starts, { force: true });

// The warm `claude` process, interrupt without respawn and the write tools
// behind the permission bubble, against the fake CLI (see fake-claude.mjs).
const ascua = useAscua({
  projects: ({ projectDir }) => [demoProject(projectDir, PISTAS)],
  env: {
    ASCUA_CLAUDE_CLI: path.join(__dirname, 'fake-claude.mjs'),
    ASCUA_FAKE_STARTS: starts,
  },
});
const d = drive(ascua);

const say = async (text: string) => {
  await d.page.fill('.as-composer__input', text);
  await d.page.keyboard.press('Enter');
};
const reply = (text: string | RegExp) =>
  d.page.locator('.as-msg[data-role="assistant"] .as-msg__text', {
    hasText: text,
  });
const pidOf = async () =>
  (
    await reply(/^pid \d+$/)
      .last()
      .innerText()
  ).trim();
const bubble = '#bubble[data-source="assistant"]';

let firstPid = '';

test('opening the assistant prewarms: the process is reused', async () => {
  await d.open();
  await d.goto('#/asistente');
  await d.page.waitForSelector('.as-composer__input');
  // The process must exist before any message is sent.
  await expect.poll(spawned, { timeout: 10_000 }).toHaveLength(1);
  const warmPid = spawned()[0];
  await say('cual es tu pid');
  await reply(/^pid \d+$/)
    .first()
    .waitFor();
  firstPid = await pidOf();
  expect(firstPid).toBe(`pid ${warmPid}`);
  expect(spawned()).toHaveLength(1);
  await d.shot('assistant-writes-01-pid');
});

test('cancelling a slow answer keeps the same process', async () => {
  await say('contame una historia');
  await d.page
    .locator('.as-composer__actions .as-btn', { hasText: 'Detener' })
    .click();
  await d.page.locator('.as-msg__note', { hasText: 'Cancelado' }).waitFor();
  await d.shot('assistant-writes-02-cancelled');
  await say('cual es tu pid');
  await reply(/^pid \d+$/)
    .nth(1)
    .waitFor();
  expect(await pidOf()).toBe(firstPid);
});

test('"levanta todo" asks in the open room and starts the pistas', async () => {
  await say('levanta todo');
  await d.page.locator(bubble).waitFor();
  expect(await d.isOpen()).toBe(true);
  await expect(d.page.locator(`${bubble} #summary`)).toContainText(
    'echo back listo',
  );
  await d.shot('assistant-writes-03-bubble');
  await d.page.click(`${bubble} button.allow`);
  await reply('Levanté todo.').waitFor();
  await d.goto('#/proyectos/demo/terminales');
  expect(await d.waitState('back', 'Corriendo')).toBe(true);
  expect(await d.waitState('front', 'Corriendo')).toBe(true);
  await d.shot('assistant-writes-04-running');
});

test('declining "abri una terminal" opens nothing', async () => {
  await d.goto('#/asistente');
  await d.page.waitForSelector('.as-composer__input');
  await say('abri una terminal');
  await d.page.locator(bubble).waitFor();
  await d.shot('assistant-writes-05-shell-bubble');
  await d.page.click(`${bubble} button.deny`);
  await reply('Quedó rechazada').waitFor();
  await d.goto('#/proyectos/demo/terminales');
  await d.sleep(600);
  expect(await d.pane('shell').count()).toBe(0);
  await d.shot('assistant-writes-06-declined');
});

test('a long terminals_write detail wraps and scrolls in the bubble', async () => {
  await d.goto('#/asistente');
  await d.page.waitForSelector('.as-composer__input');
  await say('escribi largo');
  await d.page.locator(bubble).waitFor();
  const summary = d.page.locator(`${bubble} #summary`);
  await expect(summary).toContainText('paso-1-');
  await d.shot('assistant-writes-08-long-detail');
  const box = await summary.evaluate((el) => ({
    scrolls: el.scrollHeight > el.clientHeight,
    overflowX: el.scrollWidth > el.clientWidth + 1,
  }));
  expect(box.overflowX).toBe(false);
  await d.page.click(`${bubble} button.deny`);
  await reply('Quedó rechazada, no escribí.').waitFor();
});

test('ui_guide answers with the label the user sees', async () => {
  await d.goto('#/asistente');
  await d.page.waitForSelector('.as-composer__input');
  await say('donde esta el boton de terminal');
  await reply('El botón es + Terminal.').waitFor();
  await d.shot('assistant-writes-07-ui-guide');
});
