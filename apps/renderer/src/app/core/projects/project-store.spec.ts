import { TestBed } from '@angular/core/testing';
import type { AscuaApi, Project } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { ProjectStore, projectInput } from './project-store';

const alpha: Project = { id: 'a', name: 'Alpha', path: '/a', terminals: [] };
const beta: Project = { id: 'b', name: 'Beta', path: '/b', terminals: [] };

function setup(api: unknown): ProjectStore {
  TestBed.configureTestingModule({
    providers: [{ provide: ASCUA_API, useValue: api }],
  });
  return TestBed.inject(ProjectStore);
}

describe('ProjectStore', () => {
  let api: Pick<
    AscuaApi,
    'listProjects' | 'saveProject' | 'deleteProject' | 'pickProjectFolder'
  >;

  beforeEach(() => {
    api = {
      listProjects: vi.fn(async () => [alpha]),
      saveProject: vi.fn(async (input) => ({
        ok: true as const,
        project: { ...input, id: input.id ?? 'b', terminals: [] },
      })),
      deleteProject: vi.fn(async () => undefined),
      pickProjectFolder: vi.fn(async () => '/picked'),
    };
  });

  it('loads the projects', async () => {
    const store = setup(api);
    await store.reload();
    expect(store.loaded()).toBe(true);
    expect(store.projects()).toEqual([alpha]);
    expect(store.byId('a')).toEqual(alpha);
    expect(store.byId('zzz')).toBeUndefined();
  });

  it('upserts on save and drops on remove', async () => {
    const store = setup(api);
    await store.reload();

    const created = await store.save({
      name: 'Beta',
      path: '/b',
      terminals: [],
    });
    expect(created.ok).toBe(true);
    expect(store.projects().map((p) => p.id)).toEqual(['a', 'b']);

    await store.save({ id: 'b', name: 'Beta 2', path: '/b', terminals: [] });
    expect(store.byId('b')?.name).toBe('Beta 2');
    expect(store.projects()).toHaveLength(2);

    await store.remove('a');
    expect(api.deleteProject).toHaveBeenCalledWith('a');
    expect(store.projects().map((p) => p.id)).toEqual(['b']);
    expect(beta.id).toBe('b');
  });

  it('does not change the list when saving fails', async () => {
    const error = { code: 'project.nameRequired' as const };
    api.saveProject = vi.fn(async () => ({ ok: false as const, error }));
    const store = setup(api);
    await store.reload();
    const result = await store.save({ name: '', path: '', terminals: [] });
    expect(result).toEqual({ ok: false, error });
    expect(store.projects()).toEqual([alpha]);
  });

  it('pista edits go to the API as-is and the store keeps what main returns', async () => {
    const first: Project = {
      ...alpha,
      terminals: [{ id: 't1', name: 'web', command: 'serve' }],
    };
    const second: Project = {
      ...alpha,
      terminals: [
        { id: 't1', name: 'web', command: 'serve' },
        { id: 't2', name: 'api', command: 'run' },
      ],
    };
    const pistaApi = {
      ...api,
      savePista: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, project: first })
        .mockResolvedValueOnce({ ok: true, project: second }),
      removePista: vi.fn(async () => ({ ok: true, project: first })),
    };
    const store = setup(pistaApi);
    await store.reload();

    const webSpec = { name: 'web', command: 'serve' };
    const apiSpec = { name: 'api', command: 'run' };
    await Promise.all([
      store.savePista('a', webSpec),
      store.savePista('a', apiSpec),
    ]);
    expect(pistaApi.savePista).toHaveBeenNthCalledWith(1, 'a', webSpec);
    expect(pistaApi.savePista).toHaveBeenNthCalledWith(2, 'a', apiSpec);
    expect(store.byId('a')).toEqual(second);

    await store.removePista('a', 't2');
    expect(pistaApi.removePista).toHaveBeenCalledWith('a', 't2');
    expect(store.byId('a')).toEqual(first);
  });

  it('picks a folder', async () => {
    const store = setup(api);
    expect(await store.pickFolder()).toBe('/picked');
    await store.pickFolder('/start');
    expect(api.pickProjectFolder).toHaveBeenLastCalledWith('/start');
  });

  it('upserts on link and clone, and projectInput keeps the repository', async () => {
    const repository = {
      provider: 'github' as const,
      id: 'o/r',
      name: 'r',
      fullName: 'o/r',
    };
    const linked: Project = { ...alpha, repository };
    const cloned: Project = { ...beta, repository };
    const store = setup({
      ...api,
      linkProjectRepository: vi.fn(async () => ({
        ok: true as const,
        project: linked,
      })),
      cloneProject: vi.fn(async () => ({
        ok: true as const,
        project: cloned,
      })),
    });
    await store.reload();
    await store.linkRepository('a', repository);
    expect(store.byId('a')?.repository).toEqual(repository);
    await store.clone({
      repository,
      name: 'Beta',
      parentDir: '/p',
      folderName: 'r',
    });
    expect(store.projects().map((p) => p.id)).toEqual(['a', 'b']);
    expect(projectInput(linked).repository).toEqual(repository);
  });

  it('link and clone fail without the bridge', async () => {
    const store = setup(undefined);
    const ref = {
      provider: 'github' as const,
      id: 'o/r',
      name: 'r',
      fullName: 'o/r',
    };
    expect((await store.linkRepository('a', ref)).ok).toBe(false);
  });

  it('stays empty but loaded in the browser preview', async () => {
    const store = setup(undefined);
    await store.reload();
    expect(store.loaded()).toBe(true);
    expect(store.projects()).toEqual([]);
    expect(await store.pickFolder()).toBeUndefined();
    await store.remove('a');
  });
});
