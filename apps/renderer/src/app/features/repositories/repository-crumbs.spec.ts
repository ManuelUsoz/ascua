import type { Commit, PullRequest, Repository } from '@ascua/source-control';
import { repositoryItems } from './repository-crumbs';

describe('repositoryItems', () => {
  const repo = { id: 'octo/hello' } as Repository;
  const commit = { sha: 'abcdef1234', title: 'First' } as Commit;
  const pr = { number: 7, sourceBranch: 'fix' } as PullRequest;

  it('is undefined while neither a PR nor a commit is open', () => {
    expect(
      repositoryItems(
        { repo, pr: undefined, commit: undefined },
        'Repositorios',
        vi.fn(),
      ),
    ).toBeUndefined();
  });

  it('shows repo > commit for a commit-only trail', () => {
    const items = repositoryItems(
      { repo, pr: undefined, commit },
      'Repositorios',
      vi.fn(),
    );
    expect(items?.map((i) => i.label)).toEqual([
      'Repositorios',
      'abcdef1 First',
    ]);
  });

  it('shows repo > branch > commit and navigates from the crumbs', () => {
    const navigate = vi.fn();
    const items = repositoryItems(
      { repo, pr, commit },
      'Repositorios',
      navigate,
    );
    expect(items?.map((i) => i.label)).toEqual([
      'Repositorios',
      'fix',
      'abcdef1 First',
    ]);
    expect(items?.[1].mono).toBe(true);
    items?.[0].go?.();
    expect(navigate).toHaveBeenLastCalledWith(['/repositorios', 'octo/hello']);
    items?.[1].go?.();
    expect(navigate).toHaveBeenLastCalledWith([
      '/repositorios',
      'octo/hello',
      'prs',
      7,
    ]);
  });

  it('leaves the branch crumb as current when no commit is open', () => {
    const items = repositoryItems(
      { repo, pr, commit: undefined },
      'Repositorios',
      vi.fn(),
    );
    expect(items?.[1].go).toBeUndefined();
  });

  it('falls back to the root when no repo is selected', () => {
    const navigate = vi.fn();
    const items = repositoryItems(
      { repo: undefined, pr, commit: undefined },
      'Repositorios',
      navigate,
    );
    items?.[0].go?.();
    expect(navigate).toHaveBeenLastCalledWith(['/repositorios']);
  });
});
