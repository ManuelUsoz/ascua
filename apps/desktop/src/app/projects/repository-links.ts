import { randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import type {
  CloneProjectInput,
  Project,
  RepositoryLink,
  RepositoryRef,
  Settings,
  SettingsPatch,
} from '@ascua/ipc';
import { CloneError, cloneRepository, validFolderName } from '../git/git-clone';
import { readOriginUrl, remoteMatches } from '../git/git-remote';
import { normalizeProject, ProjectInputError } from './project-input';
import type { ProjectRepository } from './project-repository';

const HOSTS: Record<string, string> = { github: 'github.com' };

export interface LinkSettings {
  get(): Promise<Settings>;
  update(patch: SettingsPatch): Promise<Settings>;
}

export interface LinkSourceControl {
  cloneSource(
    provider: RepositoryRef['provider'],
    repoId: string,
  ): Promise<{ url: string; env: Record<string, string> }>;
}

export interface LinkGit {
  readOriginUrl(dir: string): Promise<string | undefined>;
  clone(options: {
    url: string;
    target: string;
    env?: Record<string, string>;
  }): Promise<void>;
}

export const nodeGit: LinkGit = {
  readOriginUrl,
  clone: (options) => cloneRepository(options),
};

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isNonEmptyDirectory(path: string): Promise<boolean> {
  try {
    return (await readdir(path)).length > 0;
  } catch {
    return false;
  }
}

export class RepositoryLinks {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly projects: ProjectRepository,
    private readonly settings: LinkSettings,
    private readonly sourceControl: LinkSourceControl,
    private readonly git: LinkGit = nodeGit,
    private readonly home: () => string = () => '',
  ) {}

  async status(ref: RepositoryRef): Promise<RepositoryLink> {
    const projects = await this.projects.list();
    const linked = projects.find(
      (p) =>
        p.repository?.provider === ref.provider && p.repository.id === ref.id,
    );
    if (linked) return { state: 'linked', project: linked, path: linked.path };

    const unlinked = projects.filter((p) => !p.repository);
    const host = HOSTS[ref.provider] ?? '';
    for (const project of unlinked) {
      const url = await this.git.readOriginUrl(project.path);
      if (url && remoteMatches(url, ref.fullName, host)) {
        return { state: 'match', project, path: project.path };
      }
    }
    const wanted = ref.name.toLowerCase();
    const byName = unlinked.find(
      (p) => basename(p.path).toLowerCase() === wanted,
    );
    if (byName) return { state: 'match', project: byName, path: byName.path };

    const { cloneDir } = await this.settings.get();
    const path = join(cloneDir ?? this.home(), ref.name);
    return { state: 'none', path, folderExists: await isDirectory(path) };
  }

  async link(projectId: string, ref: RepositoryRef): Promise<Project> {
    const project = await this.projects.update(projectId, (current) =>
      normalizeProject({ ...current, repository: ref }, randomUUID),
    );
    if (!project) throw new ProjectInputError('project.notFound');
    return project;
  }

  async clone(input: CloneProjectInput): Promise<Project> {
    if (!validFolderName(input.folderName)) {
      throw new ProjectInputError('clone.folderNameInvalid');
    }
    if (
      typeof input.parentDir !== 'string' ||
      !isAbsolute(input.parentDir) ||
      !(await isDirectory(input.parentDir))
    ) {
      throw new ProjectInputError('clone.parentMissing');
    }
    const target = join(input.parentDir, input.folderName);
    if (this.inFlight.has(target)) throw new ProjectInputError('clone.busy');
    this.inFlight.add(target);
    try {
      if (await isNonEmptyDirectory(target)) {
        const url = await this.git.readOriginUrl(target);
        const host = HOSTS[input.repository.provider] ?? '';
        if (!url || !remoteMatches(url, input.repository.fullName, host)) {
          throw new ProjectInputError('clone.targetExists');
        }
      } else {
        const source = await this.sourceControl.cloneSource(
          input.repository.provider,
          input.repository.id,
        );
        try {
          await this.git.clone({
            url: source.url,
            target,
            env: source.env,
          });
        } catch (error) {
          if (error instanceof CloneError) {
            throw new ProjectInputError(error.code);
          }
          throw error;
        }
      }
      const project = await this.projects.save(
        normalizeProject(
          {
            name: input.name,
            path: target,
            color: input.color,
            terminals: [],
            repository: input.repository,
          },
          randomUUID,
        ),
      );
      await this.settings.update({ cloneDir: input.parentDir });
      return project;
    } finally {
      this.inFlight.delete(target);
    }
  }
}
