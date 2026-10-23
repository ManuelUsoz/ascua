import { TestBed } from '@angular/core/testing';
import type { AscuaApi, Project } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { ProjectStore } from './project-store';

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

    const created = await store.save({ name: 'Beta', path: '/b', terminals: [] });
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
    api.saveProject = vi.fn(async () => ({ ok: false as const, error: 'mal' }));
    const store = setup(api);
    await store.reload();
    const result = await store.save({ name: '', path: '', terminals: [] });
    expect(result).toEqual({ ok: false, error: 'mal' });
    expect(store.projects()).toEqual([alpha]);
  });

  it('savePista appends, replaces by id and removePista drops', async () => {
    const withPista: Project = {
      ...alpha,
      terminals: [{ id: 't1', name: 'api', command: 'run' }],
    };
    api.listProjects = vi.fn(async () => [withPista]);
    api.saveProject = vi.fn(async (input) => ({
      ok: true as const,
      project: { ...input, id: input.id ?? 'a', terminals: input.terminals as Project['terminals'] },
    }));
    const store = setup(api);
    await store.reload();

    await store.savePista('a', { name: 'web', command: 'serve' });
    expect(api.saveProject).toHaveBeenLastCalledWith({
      id: 'a',
      name: 'Alpha',
      path: '/a',
      terminals: [
        { id: 't1', name: 'api', command: 'run' },
        { name: 'web', command: 'serve' },
      ],
    });

    await store.savePista('a', { id: 't1', name: 'api2', command: 'run2' });
    expect(store.byId('a')?.terminals).toEqual([
      { id: 't1', name: 'api2', command: 'run2' },
      { name: 'web', command: 'serve' },
    ]);

    await store.removePista('a', 't1');
    expect(store.byId('a')?.terminals).toEqual([
      { name: 'web', command: 'serve' },
    ]);

    expect(await store.savePista('zzz', { name: 'x', command: 'y' })).toEqual({
      ok: false,
      error: 'No existe el proyecto.',
    });
  });

  it('picks a folder', async () => {
    const store = setup(api);
    expect(await store.pickFolder()).toBe('/picked');
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
