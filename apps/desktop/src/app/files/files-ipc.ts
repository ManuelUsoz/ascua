import { ipcMain, shell } from 'electron';
import { IPC } from '@ascua/ipc';
import { friendlyFileError, type ProjectFiles } from './project-files';

/** Rethrow with a short Spanish message instead of a raw fs error. */
async function guarded<T>(
  work: () => Promise<T>,
  action: 'read' | 'write' = 'read',
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new Error(friendlyFileError(error, action));
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
    ): Promise<string | undefined> => {
      try {
        const { abs, openable } = await files.externalAction(projectId, path);
        if (!openable) {
          return 'Ese archivo no se abre desde Ascua; usá Mostrar en carpeta.';
        }
        // `shell` is read at call time so a test driver can stub openPath.
        const error = await shell.openPath(abs);
        return error || undefined;
      } catch (error) {
        return friendlyFileError(error);
      }
    },
  );
  ipcMain.handle(
    IPC.writeFile,
    (
      _event,
      projectId: string,
      path: string,
      text: string,
      version?: string,
    ) => guarded(() => files.write(projectId, path, text, version), 'write'),
  );
  ipcMain.handle(
    IPC.revealFile,
    async (
      _event,
      projectId: string,
      path: string,
    ): Promise<string | undefined> => {
      try {
        // Read at call time so a test driver can stub showItemInFolder.
        shell.showItemInFolder(await files.resolve(projectId, path));
        return undefined;
      } catch (error) {
        return friendlyFileError(error);
      }
    },
  );
}
