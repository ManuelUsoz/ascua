import { describe, expect, it } from 'vitest';
import { DIRECT_MODE, type ChatModeId, type HarnessContext } from '@ascua/chat';
import { HarnessHost } from './harness-host';

const ctx = { projectPath: '/p', prompt: 'hi' } as HarnessContext;

describe('HarnessHost', () => {
  it('runs the direct mode', async () => {
    await expect(
      new HarnessHost([DIRECT_MODE]).setup('chat', ctx),
    ).resolves.toEqual({});
  });

  it('refuses an unknown mode', async () => {
    await expect(
      new HarnessHost([DIRECT_MODE]).setup('nope' as ChatModeId, ctx),
    ).rejects.toMatchObject({ kind: 'unknown' });
  });
});
