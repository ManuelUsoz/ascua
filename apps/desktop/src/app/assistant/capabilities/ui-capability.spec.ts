import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '@ascua/assistant';
import type { UiLabels } from '@ascua/ipc';
import { uiCapability } from './ui-capability';

const ctx = { signal: new AbortController().signal };

function setup(labels: UiLabels) {
  const cap = uiCapability({ get: () => ({ labels }) });
  return new ToolRegistry([cap], { confirm: async () => false });
}

describe('uiCapability', () => {
  it('quotes the live labels', async () => {
    const registry = setup({
      'projects.page.addTerminal': 'Terminal',
      'projects.page.addPista': 'Pista',
    });
    const r = await registry.call('ui_guide', { topic: 'terminals' }, ctx);
    expect(r.ok).toBe(true);
    const text = JSON.stringify(r);
    expect(text).toContain('+ Terminal');
    expect(text).toContain('+ Pista');
  });

  it('falls back to the key when a label is missing', async () => {
    const r = await setup({}).call('ui_guide', { topic: 'terminals' }, ctx);
    expect(JSON.stringify(r)).toContain('projects.page.addTerminal');
  });

  it('returns every topic without one and rejects unknown topics', async () => {
    const registry = setup({});
    const all = await registry.call('ui_guide', {}, ctx);
    expect(all).toMatchObject({
      ok: true,
      value: { navigation: expect.any(Array), avatar: expect.any(Array) },
    });
    const bad = await registry.call('ui_guide', { topic: 'nope' }, ctx);
    expect(bad).toMatchObject({ ok: false, error: 'invalidInput' });
  });
});
