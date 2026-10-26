import { ipcMain } from 'electron';
import { mkdir } from 'node:fs/promises';
import { IPC, encodeError, type AscuaError, type ErrorCode } from '@ascua/ipc';
import { NoteAccessError, type NoteStore } from './note-store';

type Action = 'read' | 'save' | 'delete' | 'rename';

const FAILED: Record<Action, ErrorCode> = {
  read: 'note.readFailed',
  save: 'note.saveFailed',
  delete: 'note.deleteFailed',
  rename: 'note.renameFailed',
};

function noteError(error: unknown, action: Action): AscuaError {
  if (error instanceof NoteAccessError) return { code: error.code };
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return { code: 'note.notFound' };
  return { code: FAILED[action] };
}

/** Rethrow as an encoded error code instead of a raw fs error. */
async function guarded<T>(
  work: () => Promise<T>,
  action: Action = 'read',
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new Error(encodeError(noteError(error, action)));
  }
}

export interface NotesShell {
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<string>;
}

export function registerNotesIpc(store: NoteStore, shell: NotesShell): void {
  ipcMain.handle(IPC.listNotes, () => guarded(() => store.list()));
  ipcMain.handle(IPC.readNote, (_event, name: string) =>
    guarded(() => store.read(name)),
  );
  ipcMain.handle(IPC.createNote, (_event, name: string, text?: string) =>
    guarded(() => store.create(name, text), 'save'),
  );
  ipcMain.handle(
    IPC.saveNote,
    (_event, name: string, text: string, version?: string) =>
      guarded(() => store.save(name, text, version), 'save'),
  );
  ipcMain.handle(IPC.deleteNote, (_event, name: string) =>
    guarded(() => store.remove(name), 'delete'),
  );
  ipcMain.handle(IPC.renameNote, (_event, from: string, to: string) =>
    guarded(() => store.rename(from, to), 'rename'),
  );
  ipcMain.handle(IPC.revealNotes, async (): Promise<AscuaError | undefined> => {
    try {
      await mkdir(store.dir, { recursive: true });
      const detail = await shell.openPath(store.dir);
      return detail ? { code: 'note.readFailed' } : undefined;
    } catch (error) {
      return noteError(error, 'read');
    }
  });
  ipcMain.handle(
    IPC.openNoteLink,
    async (_event, url: string): Promise<AscuaError | undefined> => {
      let protocol: string;
      try {
        protocol = new URL(url).protocol;
      } catch {
        return { code: 'note.linkRefused' };
      }
      if (protocol !== 'http:' && protocol !== 'https:') {
        return { code: 'note.linkRefused' };
      }
      try {
        await shell.openExternal(url);
        return undefined;
      } catch {
        return { code: 'note.linkRefused' };
      }
    },
  );
}
