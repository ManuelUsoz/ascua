import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '@ascua/assistant';
import type { Project } from '@ascua/ipc';
import { windowCapability, type RoomControl } from './window-capability';

const ctx = { signal: new AbortController().signal };
const project = {
  id: 'p1',
  name: 'Demo',
  path: '/x',
  terminals: [],
} as Project;

function setup(open = false) {
  const state = { open };
  const room: RoomControl = {
    isOpen: () => state.open,
    open: vi.fn(() => {
      state.open = true;
    }),
    collapse: vi.fn(() => {
      state.open = false;
    }),
    navigate: vi.fn(),
  };
  const projects = {
    get: async (id: string) => (id === 'p1' ? project : undefined),
  };
  const cap = windowCapability({
    room,
    projects,
    context: {
      get: () => ({
        labels: {},
        route: { screen: 'project', projectId: 'p1', tab: 'files' },
      }),
    },
  });
  const registry = new ToolRegistry([cap], { confirm: async () => false });
  return { room, registry, cap };
}

describe('windowCapability', () => {
  it('declares the tools with their effects, no confirmation needed', () => {
    const { registry } = setup();
    const byName = Object.fromEntries(registry.list().map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual([
      'window_collapse_room',
      'window_navigate',
      'window_open_room',
      'window_state',
    ]);
    expect(byName['window_state'].effect).toBe('read');
    for (const n of [
      'window_collapse_room',
      'window_navigate',
      'window_open_room',
    ]) {
      expect(byName[n].effect).toBe('write');
      expect(byName[n].needsConfirmation).toBe(false);
    }
  });

  it('describes window tools with Spanish and English examples', () => {
    const { cap } = setup();
    for (const t of cap.tools.filter((x) => x.name !== 'window_state')) {
      expect(t.description).toMatch(
        /[áéíóúñ]|llévame|muéstrame|ya terminé|abre/i,
      );
      expect(t.description).toMatch(
        /show me|go to|let me see|that's all|open up/i,
      );
    }
  });

  it('window_state reports the current route', async () => {
    const { registry } = setup(true);
    const r = await registry.call('window_state', {}, ctx);
    expect(r).toMatchObject({
      ok: true,
      value: { open: true, screen: 'project', projectId: 'p1', tab: 'files' },
    });
  });

  it('open and collapse are idempotent', async () => {
    const { room, registry } = setup(false);
    await registry.call('window_collapse_room', {}, ctx);
    expect(room.collapse).not.toHaveBeenCalled();
    await registry.call('window_open_room', {}, ctx);
    await registry.call('window_open_room', {}, ctx);
    expect(room.open).toHaveBeenCalledTimes(1);
    await registry.call('window_collapse_room', {}, ctx);
    expect(room.collapse).toHaveBeenCalledTimes(1);
  });

  it('navigate opens the room first only when collapsed', async () => {
    const closed = setup(false);
    const a = await closed.registry.call(
      'window_navigate',
      { screen: 'settings' },
      ctx,
    );
    expect(a).toEqual({
      ok: true,
      value: { opened: true, screen: 'settings' },
    });
    expect(closed.room.open).toHaveBeenCalledTimes(1);
    expect(closed.room.navigate).toHaveBeenCalledWith({ screen: 'settings' });

    const open = setup(true);
    await open.registry.call(
      'window_navigate',
      { screen: 'repositories' },
      ctx,
    );
    expect(open.room.open).not.toHaveBeenCalled();
  });

  it('navigates to a project with a tab', async () => {
    const { room, registry } = setup(true);
    await registry.call(
      'window_navigate',
      { screen: 'project', projectId: 'p1', tab: 'files' },
      ctx,
    );
    expect(room.navigate).toHaveBeenCalledWith({
      screen: 'project',
      projectId: 'p1',
      tab: 'files',
    });
  });

  it('rejects an unknown project and cross-field misuse', async () => {
    const { room, registry } = setup(true);
    const unknown = await registry.call(
      'window_navigate',
      { screen: 'project', projectId: 'nope' },
      ctx,
    );
    expect(unknown).toMatchObject({ ok: false, error: 'invalidInput' });
    const noId = await registry.call(
      'window_navigate',
      { screen: 'project' },
      ctx,
    );
    expect(noId).toMatchObject({ ok: false, error: 'invalidInput' });
    const tabOnly = await registry.call(
      'window_navigate',
      { screen: 'settings', tab: 'files' },
      ctx,
    );
    expect(tabOnly).toMatchObject({ ok: false, error: 'invalidInput' });
    const idOnly = await registry.call(
      'window_navigate',
      { screen: 'settings', projectId: 'p1' },
      ctx,
    );
    expect(idOnly).toMatchObject({ ok: false, error: 'invalidInput' });
    expect(room.navigate).not.toHaveBeenCalled();
  });
});
