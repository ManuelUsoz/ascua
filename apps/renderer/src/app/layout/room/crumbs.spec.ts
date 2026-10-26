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

  it('reads the side context of notas', () => {
    expect(
      crumbsFrom(node({}, {}, node({}, { area: 'nav.notes', side: 'notes' }))),
    ).toEqual({ area: 'nav.notes', side: 'notes' });
  });

  it('reads the note name of a note route', () => {
    const notes = node(
      {},
      { area: 'nav.notes', side: 'notes' },
      node({ name: 'Ideas' }, {}),
    );
    expect(crumbsFrom(node({}, {}, notes))).toEqual({
      area: 'nav.notes',
      side: 'notes',
      note: 'Ideas',
    });
  });

  it('has no note on the notes index', () => {
    const notes = node({}, { area: 'nav.notes', side: 'notes' }, node({}, {}));
    expect(crumbsFrom(node({}, {}, notes)).note).toBeUndefined();
  });

  it('keeps a section without a project', () => {
    expect(crumbsFrom(node({}, { section: 'nav.newProject' }))).toEqual({
      section: 'nav.newProject',
    });
  });
});
