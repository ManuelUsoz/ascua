import { describe, expect, it, vi } from 'vitest';
import { IPC, decodeError } from '@ascua/ipc';
import { NoteAccessError, type NoteStore } from './note-store';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) =>
      handlers.set(channel, fn),
  },
}));

import { registerNotesIpc } from './notes-ipc';

describe('registerNotesIpc', () => {
  const openExternal = vi.fn(async () => undefined);
  const openPath = vi.fn(async () => '');
  const store = {
    dir: '/nonexistent-ascua/notes',
    read: () => Promise.reject(new NoteAccessError('note.nameInvalid')),
    save: () =>
      Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' })),
    remove: () => Promise.reject(new Error('boom')),
    rename: () =>
      Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' })),
  } as unknown as NoteStore;
  registerNotesIpc(store, { openExternal, openPath });

  const failure = async (promise: unknown) =>
    decodeError(
      ((await (promise as Promise<unknown>).catch((e) => e)) as Error).message,
    );

  it('encodes access errors, ENOENT and generic failures as codes', async () => {
    expect(await failure(handlers.get(IPC.readNote)?.({}, 'x'))).toEqual({
      code: 'note.nameInvalid',
    });
    expect(await failure(handlers.get(IPC.saveNote)?.({}, 'x', 'y'))).toEqual({
      code: 'note.notFound',
    });
    expect(await failure(handlers.get(IPC.deleteNote)?.({}, 'x'))).toEqual({
      code: 'note.deleteFailed',
    });
  });

  it('registers rename and maps a missing note to note.notFound', async () => {
    expect(await failure(handlers.get(IPC.renameNote)?.({}, 'a', 'b'))).toEqual(
      { code: 'note.notFound' },
    );
  });

  it('refuses links that are not http(s)', async () => {
    const open = handlers.get(IPC.openNoteLink);
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'nope']) {
      expect(await open?.({}, url)).toEqual({ code: 'note.linkRefused' });
    }
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('opens https links externally', async () => {
    const result = await handlers.get(IPC.openNoteLink)?.(
      {},
      'https://example.com/a',
    );
    expect(result).toBeUndefined();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/a');
  });
});
