import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '@ascua/assistant';
import type { Project } from '@ascua/ipc';
import { projectsCapability } from './projects-capability';

const ctx = { signal: new AbortController().signal };
const demo: Project = {
  id: 'p1',
  name: 'Demo',
  path: '/demo',
  terminals: [{ id: 't1', name: 'web', command: 'npm start', port: 4200 }],
};
const registry = new ToolRegistry(
  [
    projectsCapability({
      list: async () => [demo],
      get: async (id) => (id === 'p1' ? demo : undefined),
    }),
  ],
  { confirm: async () => false },
);

describe('projectsCapability', () => {
  it('is read only', () => {
    expect(registry.list().map((t) => [t.name, t.effect])).toEqual([
      ['projects_list', 'read'],
      ['projects_get', 'read'],
    ]);
  });

  it('lists projects with pista names', async () => {
    expect(await registry.call('projects_list', {}, ctx)).toEqual({
      ok: true,
      value: [{ id: 'p1', name: 'Demo', path: '/demo', terminals: ['web'] }],
    });
  });

  it('gets one project and rejects an unknown id', async () => {
    const ok = await registry.call('projects_get', { projectId: 'p1' }, ctx);
    expect(ok).toMatchObject({ ok: true, value: { name: 'Demo' } });
    const bad = await registry.call('projects_get', { projectId: 'zz' }, ctx);
    expect(bad).toMatchObject({ ok: false, error: 'invalidInput' });
  });
});
