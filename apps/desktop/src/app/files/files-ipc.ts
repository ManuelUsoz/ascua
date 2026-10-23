import { ipcMain, shell } from 'electron';
import { IPC, encodeError, type AscuaError } from '@ascua/ipc';
import { fileError, type ProjectFiles } from './project-files';

/** Rethrow as an encoded error code instead of a raw fs error. */
async function guarded<T>(
  work: () => Promise<T>,
  action: 'read' | 'write' = 'read',
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new Error(encodeError(fileError(error, action)));
  }
}

export function registerFileIpc(files: ProjectFiles): void {
  ipcMain.handle(IPC.listDir, (_event, projectId: string, dir: string) =>
    guarded(() => files.list(projectId, dir)),
  );
  ipcMain.handle(IPC.fileIndex, (_event, projectId: string) =>
    guarded(() => files.index(projectId)),
  );
  ipcMain.handle(IPC.readFile, (_event, projectId: string, path: string) =>
    guarded(() => files.read(projectId, path)),
  );
  ipcMain.handle(
    IPC.openFile,
    async (
      _event,
      projectId: string,
      path: string,
    ): Promise<AscuaError | undefined> => {
      try {
        const { abs, openable } = await files.externalAction(projectId, path);
        if (!openable) return { code: 'file.notOpenable' };
        // `shell` is read at call time so a test driver can stub openPath.
        const detail = await shell.openPath(abs);
        return detail
          ? { code: 'file.openFailed', params: { detail } }
          : undefined;
      } catch (error) {
        return fileError(error);
      }
    },
  );
  ipcMain.handle(
    IPC.writeFile,
    (_event, projectId: string, path: string, text: string, version?: string) =>
      guarded(() => files.write(projectId, path, text, version), 'write'),
  );
  ipcMain.handle(
    IPC.revealFile,
    async (
      _event,
      projectId: string,
      path: string,
    ): Promise<AscuaError | undefined> => {
      try {
        // Read at call time so a test driver can stub showItemInFolder.
        shell.showItemInFolder(await files.resolve(projectId, path));
        return undefined;
      } catch (error) {
        return fileError(error);
      }
    },
  );
}
