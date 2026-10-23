import { describe, expect, it, vi } from 'vitest';
import { IPC, decodeError } from '@ascua/ipc';
import { FileAccessError, type ProjectFiles } from './project-files';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) =>
      handlers.set(channel, fn),
  },
  shell: {},
}));

import { registerFileIpc } from './files-ipc';

describe('registerFileIpc', () => {
  it('rejects with an Error whose message decodes to the AscuaError', async () => {
    const files = {
      read: () => Promise.reject(new FileAccessError('file.outside')),
      write: () =>
        Promise.reject(Object.assign(new Error('denied'), { code: 'EACCES' })),
    } as unknown as ProjectFiles;
    registerFileIpc(files);

    const read = handlers.get(IPC.readFile)?.({}, 'p', 'a.txt');
    await expect(read).rejects.toBeInstanceOf(Error);
    const readError = await (read as Promise<unknown>).catch((e: Error) => e);
    expect(decodeError((readError as Error).message)).toEqual({
      code: 'file.outside',
    });

    const write = handlers.get(IPC.writeFile)?.({}, 'p', 'a.txt', 'x');
    const writeError = await (write as Promise<unknown>).catch((e: Error) => e);
    expect(decodeError((writeError as Error).message)).toEqual({
      code: 'file.writeDenied',
    });
  });
});
