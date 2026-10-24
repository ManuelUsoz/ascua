import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Repository } from '@ascua/source-control';
import { RepositorySelection } from './repository-selection';
import { SourceControlStore } from './source-control-store';

const repo = (name: string): Repository => ({
  provider: 'github',
  id: `octo/${name}`,
  name,
  owner: 'octo',
  fullName: `octo/${name}`,
  private: false,
  fork: false,
  archived: false,
  defaultBranch: 'main',
  webUrl: '',
  updatedAt: '',
});

describe('RepositorySelection', () => {
  const store = {
    status: signal<unknown>(undefined),
    repositories: vi.fn(() =>
      Promise.resolve({ items: [repo('a'), repo('b')], next: 'c2' }),
    ),
    pullRequests: vi.fn(() => Promise.resolve({ items: [] })),
    commits: vi.fn(() => Promise.resolve({ items: [] })),
    branches: vi.fn(() =>
      Promise.resolve({
        items: [
          { name: 'main', sha: 'a1', protected: true },
          { name: 'dev', sha: 'b2', protected: false },
        ],
      }),
    ),
    diff: vi.fn(() => Promise.resolve({ truncated: false, files: [] })),
  };
  const pr = { number: 7 } as never;

  function service(): RepositorySelection {
    TestBed.configureTestingModule({
      providers: [{ provide: SourceControlStore, useValue: store }],
    });
    return TestBed.inject(RepositorySelection);
  }

  it('selects the first repo after the first load', async () => {
    const sel = service();
    await sel.loadRepos();
    expect(sel.selectedRepo()?.id).toBe('octo/a');
    expect(store.pullRequests).toHaveBeenCalledWith('octo/a', {
      state: 'open',
      branch: 'main',
    });
    expect(sel.nextPage()).toBe('c2');
    expect(sel.loadedAt()).toBeDefined();
  });

  it('loads the diff of a PR and goes back', async () => {
    const sel = service();
    await sel.loadRepos();
    await sel.selectPr(pr);
    expect(store.diff).toHaveBeenCalledWith('octo/a', 7, undefined);
    expect(sel.diff()).toBeDefined();
    sel.back();
    expect(sel.selectedPr()).toBeUndefined();
    expect(sel.diff()).toBeUndefined();
  });

  it('preselects the default branch and reloads only commits on select', async () => {
    const sel = service();
    await sel.loadRepos();
    expect(sel.branch()).toBe('main');
    expect(sel.branches().length).toBe(2);
    expect(store.commits).toHaveBeenLastCalledWith('octo/a', {
      branch: 'main',
    });
    store.pullRequests.mockClear();
    await sel.selectBranch('dev');
    expect(sel.branch()).toBe('dev');
    expect(store.commits).toHaveBeenLastCalledWith('octo/a', { branch: 'dev' });
    expect(store.pullRequests).toHaveBeenLastCalledWith('octo/a', {
      state: 'open',
      branch: 'dev',
    });
  });

  it('resets the branch when the repo changes', async () => {
    const sel = service();
    await sel.loadRepos();
    await sel.selectBranch('dev');
    await sel.selectRepo(repo('b'));
    expect(sel.branch()).toBe('main');
    expect(store.commits).toHaveBeenLastCalledWith('octo/b', {
      branch: 'main',
    });
  });

  it('forgets everything on reset', async () => {
    const sel = service();
    await sel.loadRepos();
    sel.reset();
    expect(sel.repos()).toEqual([]);
    expect(sel.selectedRepo()).toBeUndefined();
  });
});
