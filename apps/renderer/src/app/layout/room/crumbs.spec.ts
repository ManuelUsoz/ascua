import type { ActivatedRouteSnapshot } from '@angular/router';
import { crumbsFrom } from './crumbs';

function node(
  params: Record<string, string>,
  data: Record<string, unknown>,
  child: ActivatedRouteSnapshot | null = null,
): ActivatedRouteSnapshot {
  return {
    params,
    data,
    firstChild: child,
  } as unknown as ActivatedRouteSnapshot;
}

describe('crumbsFrom', () => {
  it('is empty without params or sections', () => {
    expect(crumbsFrom(node({}, {}, node({}, {})))).toEqual({});
  });

  it('reads the project id and the last section of the deepest chain', () => {
    const tree = node(
      {},
      {},
      node(
        { projectId: 'p1' },
        { section: 'nav.edit' },
        node({ projectId: 'p1' }, { section: 'nav.terminals' }),
      ),
    );
    expect(crumbsFrom(tree)).toEqual({
      projectId: 'p1',
      section: 'nav.terminals',
    });
  });

  it('reads the area of ajustes', () => {
    expect(
      crumbsFrom(
        node({}, {}, node({}, { area: 'nav.settings' }, node({}, {}))),
      ),
    ).toEqual({ area: 'nav.settings' });
  });

  it('reads the side context of repositorios', () => {
    expect(
      crumbsFrom(
        node(
          {},
          {},
          node({}, { area: 'nav.repositories', side: 'repositories' }),
        ),
      ),
    ).toEqual({ area: 'nav.repositories', side: 'repositories' });
  });

  it('reads repo, pull request and commit from nested params', () => {
    const tree = node(
      {},
      {},
      node(
        { repoId: 'octo/a' },
        {},
        node({ number: '7' }, {}, node({ sha: 'abc' }, {})),
      ),
    );
    expect(crumbsFrom(tree)).toEqual({
      repoId: 'octo/a',
      prNumber: 7,
      commitSha: 'abc',
    });
  });

  it('ignores a non-numeric pull request number', () => {
    const tree = node({ repoId: 'octo/a' }, {}, node({ number: 'x' }, {}));
    expect(crumbsFrom(tree)).toEqual({ repoId: 'octo/a' });
  });

  it('keeps a section without a project', () => {
    expect(crumbsFrom(node({}, { section: 'nav.newProject' }))).toEqual({
      section: 'nav.newProject',
    });
  });
});
