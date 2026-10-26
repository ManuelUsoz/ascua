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
    commitDiff: vi.fn(() => Promise.resolve({ truncated: false, files: [] })),
  };
  const commit = { sha: 'abc1234def' } as never;
  const pr = { number: 7 } as never;

  function service(): RepositorySelection {
    TestBed.configureTestingModule({
      providers: [{ provide: SourceControlStore, useValue: store }],
    });
    return TestBed.inject(RepositorySelection);
  }

  /** Loads the list and opens the first repo, as the page does via the route. */
  async function loaded(): Promise<RepositorySelection> {
    const sel = service();
    await sel.loadRepos();
    await sel.selectRepo(sel.repos()[0]);
    return sel;
  }

  it('loads the first page and exposes the first repo id', async () => {
    const sel = service();
    await sel.loadRepos();
    expect(sel.selectedRepo()).toBeUndefined();
    expect(sel.firstRepoId()).toBe('octo/a');
    expect(sel.nextPage()).toBe('c2');
    expect(sel.loadedAt()).toBeDefined();
  });

  it('loads the diff of a PR and goes back', async () => {
    const sel = await loaded();
    await sel.selectPr(pr);
    expect(store.diff).toHaveBeenCalledWith('octo/a', 7, undefined);
    expect(sel.diff()).toBeDefined();
    sel.back();
    expect(sel.selectedPr()).toBeUndefined();
    expect(sel.diff()).toBeUndefined();
  });

  it('loads the commits of a PR and the diff of one commit', async () => {
    const sel = await loaded();
    await sel.selectPr(pr);
    expect(store.commits).toHaveBeenCalledWith('octo/a', { pullRequest: 7 });
    await sel.selectCommit(commit);
    expect(store.commitDiff).toHaveBeenCalledWith(
      'octo/a',
      'abc1234def',
      undefined,
    );
    expect(sel.commitDiff()).toBeDefined();
    sel.back();
    expect(sel.prCommits()).toEqual([]);
    expect(sel.selectedCommit()).toBeUndefined();
    expect(sel.commitDiff()).toBeUndefined();
  });

  it('drops a stale commit diff after clearCommit', async () => {
    const sel = await loaded();
    let resolve!: (v: unknown) => void;
    store.commitDiff.mockReturnValueOnce(
      new Promise((r) => (resolve = r)) as never,
    );
    const pending = sel.selectCommit(commit);
    sel.clearCommit();
    resolve({ truncated: false, files: [] });
    await pending;
    expect(sel.commitDiff()).toBeUndefined();
    expect(sel.commitDiffLoading()).toBe(false);
  });

  it('preselects the default branch and reloads only commits on select', async () => {
    const sel = await loaded();
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
      state: 'all',
      branch: 'dev',
    });
  });

  it('keeps open, merged and closed PRs in provider order', async () => {
    const items = [
      { number: 3, state: 'open', merged: false },
      { number: 2, state: 'closed', merged: true },
      { number: 1, state: 'closed', merged: false },
    ];
    store.pullRequests.mockResolvedValueOnce({ items } as never);
    const sel = await loaded();
    expect(sel.prs().map((p) => p.number)).toEqual([3, 2, 1]);
  });

  it('resets the branch when the repo changes', async () => {
    const sel = await loaded();
    await sel.selectBranch('dev');
    await sel.selectRepo(repo('b'));
    expect(sel.branch()).toBe('main');
    expect(store.commits).toHaveBeenLastCalledWith('octo/b', {
      branch: 'main',
    });
  });

  it('forgets everything on reset', async () => {
    const sel = await loaded();
    sel.reset();
    expect(sel.repos()).toEqual([]);
    expect(sel.selectedRepo()).toBeUndefined();
    expect(sel.missing()).toBe(false);
  });

  describe('follow', () => {
    it('selects the repo from the loaded list', async () => {
      const sel = service();
      await sel.loadRepos();
      await sel.follow({ repoId: 'octo/b' });
      expect(sel.selectedRepo()?.id).toBe('octo/b');
      expect(sel.missing()).toBe(false);
    });

    it('fetches a PR missing from the list and selects it', async () => {
      const sel = service();
      await sel.loadRepos();
      store.pullRequests.mockClear();
      store.pullRequests.mockResolvedValue({ items: [] });
      await sel.follow({ repoId: 'octo/a' });
      store.pullRequests.mockResolvedValueOnce({
        items: [{ number: 9 }],
      } as never);
      await sel.follow({ repoId: 'octo/a', prNumber: 9 });
      expect(store.pullRequests).toHaveBeenLastCalledWith('octo/a', {
        state: 'all',
      });
      expect(sel.selectedPr()?.number).toBe(9);
    });

    it('flags an unknown repo as missing', async () => {
      const sel = service();
      await sel.loadRepos();
      store.repositories.mockResolvedValueOnce({ items: [] } as never);
      await sel.follow({ repoId: 'octo/nope' });
      expect(sel.missing()).toBe(true);
      expect(sel.selectedRepo()).toBeUndefined();
    });

    it('does not let a stale follow overwrite a newer one', async () => {
      const sel = service();
      await sel.loadRepos();
      let release!: (v: unknown) => void;
      store.repositories.mockReturnValueOnce(
        new Promise((r) => (release = r)) as never,
      );
      const slow = sel.follow({ repoId: 'octo/zzz' });
      await sel.follow({ repoId: 'octo/b' });
      release({ items: [] });
      await slow;
      expect(sel.selectedRepo()?.id).toBe('octo/b');
      expect(sel.missing()).toBe(false);
    });
  });
});
