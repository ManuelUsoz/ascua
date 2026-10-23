import type { ActivatedRouteSnapshot } from '@angular/router';
import { crumbsFrom } from './crumbs';

function node(
  params: Record<string, string>,
  data: Record<string, unknown>,
  child: ActivatedRouteSnapshot | null = null,
): ActivatedRouteSnapshot {
  return { params, data, firstChild: child } as unknown as ActivatedRouteSnapshot;
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
        { section: 'Proyecto' },
        node({ projectId: 'p1' }, { section: 'Terminales' }),
      ),
    );
    expect(crumbsFrom(tree)).toEqual({ projectId: 'p1', section: 'Terminales' });
  });

  it('keeps a section without a project', () => {
    expect(crumbsFrom(node({}, { section: 'Nuevo proyecto' }))).toEqual({
      section: 'Nuevo proyecto',
    });
  });
});
