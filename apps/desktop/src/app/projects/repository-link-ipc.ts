import { ipcMain } from 'electron';
import { IPC } from '@ascua/ipc';
import type {
  CloneProjectInput,
  Project,
  RepositoryRef,
  SaveProjectResult,
} from '@ascua/ipc';
import { SourceControlError } from '@ascua/source-control';
import { toAscuaError } from '../source-control/source-control-service';
import { ProjectInputError } from './project-input';
import type { ProjectListener } from './project-ipc';
import type { RepositoryLinks } from './repository-links';

export function registerRepositoryLinkIpc(
  links: RepositoryLinks,
  listener: Pick<ProjectListener, 'saved'>,
): void {
  const save = async (
    run: () => Promise<Project>,
  ): Promise<SaveProjectResult> => {
    try {
      const project = await run();
      listener.saved(project);
      return { ok: true, project };
    } catch (error) {
      if (error instanceof ProjectInputError) {
        return { ok: false, error: error.error };
      }
      if (error instanceof SourceControlError) {
        return { ok: false, error: toAscuaError(error) };
      }
      throw error;
    }
  };

  ipcMain.handle(IPC.repositoryLink, (_event, ref: RepositoryRef) =>
    links.status(ref),
  );
  ipcMain.handle(
    IPC.linkProjectRepository,
    (_event, projectId: string, ref: RepositoryRef) =>
      save(() => links.link(projectId, ref)),
  );
  ipcMain.handle(IPC.cloneProject, (_event, input: CloneProjectInput) =>
    save(() => links.clone(input)),
  );
}
