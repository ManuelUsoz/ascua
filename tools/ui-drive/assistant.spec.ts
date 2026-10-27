import { expect, test } from '@playwright/test';
import * as path from 'node:path';
import { demoProject, useAscua } from './ascua';
import { drive } from './helpers';

// The assistant against a fake `claude` CLI that does real HTTP to Ascua's MCP
// server and maps non-literal phrases to tools (stands in for the model).
const ascua = useAscua({
  projects: ({ projectDir }) => [demoProject(projectDir)],
  env: { ASCUA_CLAUDE_CLI: path.join(__dirname, 'fake-claude.mjs') },
});
const d = drive(ascua);

const say = async (text: string) => {
  await d.page.fill('.as-composer__input', text);
  await d.page.keyboard.press('Enter');
};

test('a free phrase calls a tool and streams the answer', async () => {
  await d.open();
  await d.goto('#/asistente');
  await d.page.waitForSelector('.as-composer__input');
  await say('qué proyectos tengo');
  await d.page
    .locator('.as-msg[data-role="assistant"] .as-chip', {
      hasText: 'Proyectos',
    })
    .waitFor();
  await d.page
    .locator('.as-msg[data-role="assistant"] .as-msg__text', {
      hasText: 'Proyecto demo',
    })
    .waitFor();
  await d.shot('assistant-01-projects');
});

test('"muéstrame los repositorios" navigates to Repositorios', async () => {
  await say('muéstrame los repositorios');
  await d.page.waitForFunction(() => location.hash === '#/repositorios');
  await d.shot('assistant-02-repositories');
});

test('"ya terminé por hoy" collapses the room', async () => {
  await d.goto('#/asistente');
  await d.page.waitForSelector('.as-composer__input');
  await say('ya terminé por hoy');
  await d.page.waitForFunction(
    () => !document.body.classList.contains('is-open'),
  );
  await d.sleep(1200);
  expect(await d.isOpen()).toBe(false);
  await d.shot('assistant-03-collapsed');
});
