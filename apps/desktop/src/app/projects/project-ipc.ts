import { randomUUID } from 'node:crypto';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { IPC } from '@ascua/ipc';
import type {
  PickTerminalFolderResult,
  Project,
  ProjectInput,
  SaveProjectResult,
  TerminalSpecInput,
} from '@ascua/ipc';
import {
  normalizeProject,
  ProjectInputError,
  relativeCwd,
  withoutPista,
  withPista,
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
          return { ok: false, error: error.error };
        }
        throw error;
      }
    },
  );

  const updateProject = async (
    projectId: string,
    change: (project: Project) => Project,
  ): Promise<SaveProjectResult> => {
    try {
      const project = await repository.update(projectId, change);
      if (!project) return { ok: false, error: { code: 'project.notFound' } };
      listener.saved(project);
      return { ok: true, project };
    } catch (error) {
      if (error instanceof ProjectInputError) {
        return { ok: false, error: error.error };
      }
      throw error;
    }
  };

  ipcMain.handle(
    IPC.savePista,
    (_event, projectId: string, spec: TerminalSpecInput) =>
      updateProject(projectId, (project) =>
        withPista(project, spec, randomUUID),
      ),
  );

  ipcMain.handle(
    IPC.removePista,
    (_event, projectId: string, terminalId: string) =>
      updateProject(projectId, (project) => withoutPista(project, terminalId)),
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
      if (!project) return { ok: false, error: { code: 'project.notFound' } };
      const picked = await showFolderDialog({
        properties: ['openDirectory'],
        defaultPath: project.path,
      });
      if (!picked) return undefined;
      const cwd = relativeCwd(project.path, picked);
      if (cwd === undefined) {
        return { ok: false, error: { code: 'project.folderOutside' } };
      }
      return { ok: true, cwd };
    },
  );
}
