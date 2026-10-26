import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { quit: vi.fn() },
  ipcMain: { handle: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

import { openLink } from './window-ipc';

describe('openLink', () => {
  it('opens https, http and mailto links', async () => {
    const open = vi.fn();
    for (const url of [
      'https://example.com/a',
      'http://example.com/',
      'mailto:a@b.co',
    ]) {
      expect(await openLink(url, open)).toBeUndefined();
    }
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('rejects other schemes and garbage', async () => {
    const open = vi.fn();
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'ascua://x',
      'not a url',
      42,
    ]) {
      expect(await openLink(url, open)).toEqual({ code: 'invalidLink' });
    }
    expect(open).not.toHaveBeenCalled();
  });
});
