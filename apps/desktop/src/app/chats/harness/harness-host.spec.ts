import { describe, expect, it } from 'vitest';
import { DIRECT_MODE, type ChatModeId, type HarnessContext } from '@ascua/chat';
import { HarnessHost } from './harness-host';
import { createNxyModes } from './nxy-modes';
import {
  DEFAULT_METHODOLOGY,
  type MethodologyStore,
} from './methodology-store';

const ctx = { projectPath: '/p', prompt: 'hi' } as HarnessContext;

describe('HarnessHost', () => {
  it('runs the direct mode', async () => {
    await expect(
      new HarnessHost([DIRECT_MODE]).setup('chat', ctx),
    ).resolves.toEqual({});
  });

  it('builds every nxy mode with methodology and both gates', async () => {
    const store = {
      load: async () => DEFAULT_METHODOLOGY,
    } as unknown as MethodologyStore;
    const host = new HarnessHost(createNxyModes(store));
    const noIndexer = {
      ...ctx,
      session: { projectId: 'p1' },
      mcpServers: [],
    } as unknown as HarnessContext;
    const bare = await host.setup('locate', noIndexer);
    expect(bare.agents).toBeUndefined();
    expect(bare.systemAppend).not.toContain('`searcher` subagent');
    const c = {
      ...ctx,
      session: { projectId: 'p1' },
      mcpServers: ['ascua-indexer'],
    } as unknown as HarnessContext;
    for (const id of ['chat', 'locate', 'make', 'review'] as const) {
      const s = await host.setup(id, c);
      expect(s.systemAppend).toContain(DEFAULT_METHODOLOGY.title);
      expect(s.gates?.map((g) => g.on)).toEqual(['beforeTool', 'beforeStop']);
      expect(s.agents?.map((a) => a.role)).toEqual(['searcher']);
      expect(s.systemAppend).toContain('`searcher` subagent');
    }
    expect((await host.setup('locate', c)).deniedTools).toEqual([
      'edit',
      'execute',
    ]);
  });

  it('refuses an unknown mode', async () => {
    await expect(
      new HarnessHost([DIRECT_MODE]).setup('nope' as ChatModeId, ctx),
    ).rejects.toMatchObject({ kind: 'unknown' });
  });
});
