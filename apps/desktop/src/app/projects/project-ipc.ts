import { randomUUID } from 'node:crypto';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { IPC } from '@ascua/ipc';
import type {
  PickTerminalFolderResult,
  Project,
  ProjectInput,
  SaveProjectResult,
} from '@ascua/ipc';
import {
  normalizeProject,
  ProjectInputError,
  relativeCwd,
} from './project-input';
import type { ProjectRepository } from './project-repository';

export interface ProjectListener {
  saved(project: Project): void;
  removed(id: string): Promise<void>;
}

export interface ProjectIpcOptions {
  window: () => BrowserWindow | null;
  listener: ProjectListener;
}

export function registerProjectIpc(
  repository: ProjectRepository,
  { window, listener }: ProjectIpcOptions,
): void {
  ipcMain.handle(IPC.listProjects, () => repository.list());

  ipcMain.handle(
    IPC.saveProject,
    async (_event, input: ProjectInput): Promise<SaveProjectResult> => {
      try {
        const project = await repository.save(
          normalizeProject(input, randomUUID),
        );
        listener.saved(project);
        return { ok: true, project };
      } catch (error) {
        if (error instanceof ProjectInputError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }
    },
  );

  ipcMain.handle(IPC.deleteProject, async (_event, id: string) => {
    await listener.removed(id);
    await repository.remove(id);
  });

  const showFolderDialog = async (
    options: OpenDialogOptions,
  ): Promise<string | undefined> => {
    const parent = window();
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? undefined : result.filePaths[0];
  };

  ipcMain.handle(IPC.pickProjectFolder, () =>
    showFolderDialog({ properties: ['openDirectory'] }),
  );

  ipcMain.handle(
    IPC.pickTerminalFolder,
    async (
      _event,
      projectId: string,
    ): Promise<PickTerminalFolderResult | undefined> => {
      const project = await repository.get(projectId);
      if (!project) return { ok: false, error: 'No existe el proyecto.' };
      const picked = await showFolderDialog({
        properties: ['openDirectory'],
        defaultPath: project.path,
      });
      if (!picked) return undefined;
      const cwd = relativeCwd(project.path, picked);
      if (cwd === undefined) {
        return {
          ok: false,
          error: 'La carpeta tiene que estar dentro del proyecto.',
        };
      }
      return { ok: true, cwd };
    },
  );
}
