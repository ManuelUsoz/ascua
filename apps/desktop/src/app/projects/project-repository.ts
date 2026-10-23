import type { Project } from '@ascua/ipc';

/** Storage seam for projects. Nothing outside the implementation knows how they are stored. */
export interface ProjectRepository {
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | undefined>;
  save(project: Project): Promise<Project>;
  remove(id: string): Promise<void>;
}
