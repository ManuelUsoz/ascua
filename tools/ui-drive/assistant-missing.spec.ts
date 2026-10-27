import { expect, test } from '@playwright/test';
import * as path from 'node:path';
import { useAscua } from './ascua';
import { drive } from './helpers';

// No Claude Code (the same state Docker shows without `claude`): the screen
// explains it and offers a retry, nothing crashes.
const ascua = useAscua({
  env: { ASCUA_CLAUDE_CLI: path.join(__dirname, 'does-not-exist.mjs') },
});
const d = drive(ascua);

test('a missing CLI shows the notInstalled state', async () => {
  await d.open();
  await d.goto('#/asistente');
  await d.page.locator('.as-assistant__notice').waitFor();
  expect(await d.page.locator('.as-assistant__notice').innerText()).toContain(
    'Falta Claude Code',
  );
  await d.page
    .locator('.as-assistant__notice button', { hasText: 'Reintentar' })
    .click();
  await d.page.locator('.as-assistant__notice').waitFor();
  await d.shot('assistant-missing');
});
