import { TestBed } from '@angular/core/testing';
import { i18nTesting } from '../../testing/i18n';
import { Breadcrumb, CrumbItem, visibleCrumbs } from './breadcrumb';

const make = (n: number): CrumbItem[] =>
  Array.from({ length: n }, (_, i) => ({ label: `L${i}` }));

describe('visibleCrumbs', () => {
  it('returns every level up to four, without a more entry', () => {
    for (let n = 1; n <= 4; n++) {
      const r = visibleCrumbs(make(n), false);
      expect(r).toHaveLength(n);
      expect(r.some((e) => e.kind === 'more')).toBe(false);
    }
  });

  it('folds the middle past four levels', () => {
    const r = visibleCrumbs(make(6), false);
    expect(r.map((e) => (e.kind === 'more' ? '…' : e.item.label))).toEqual([
      'L0',
      '…',
      'L4',
      'L5',
    ]);
  });

  it('returns all when expanded', () => {
    expect(visibleCrumbs(make(6), true)).toHaveLength(6);
  });
});

describe('Breadcrumb', () => {
  function render(items: CrumbItem[]) {
    TestBed.configureTestingModule({ imports: [Breadcrumb, i18nTesting()] });
    const fixture = TestBed.createComponent(Breadcrumb);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('marks only the last level as current and the rest as links', () => {
    const { el } = render([
      { label: 'Proj' },
      { label: 'src/app', mono: true },
      { label: 'file.ts', mono: true },
    ]);
    expect(el.querySelector('nav.as-crumbs')?.getAttribute('aria-label')).toBe(
      'Ruta',
    );
    const current = el.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].tagName).toBe('SPAN');
    expect(current[0].textContent).toContain('file.ts');
    const links = el.querySelectorAll('.as-crumb__link');
    expect(links).toHaveLength(2);
    expect(links[1].classList.contains('as-crumb__mono')).toBe(true);
    expect(links[0].classList.contains('as-crumb__mono')).toBe(false);
    expect(links[1].getAttribute('title')).toBe('src/app');
  });

  it('runs the target of a link once on click and disables links without one', () => {
    const go = vi.fn();
    const { el } = render([{ label: 'A', go }, { label: 'B' }, { label: 'C' }]);
    const links = el.querySelectorAll<HTMLButtonElement>('.as-crumb__link');
    links[0].click();
    expect(go).toHaveBeenCalledTimes(1);
    expect(links[0].disabled).toBe(false);
    expect(links[1].disabled).toBe(true);
  });

  it('expands the hidden levels on click', () => {
    const { fixture, el } = render(make(6));
    expect(el.querySelectorAll('li')).toHaveLength(4);
    el.querySelector<HTMLButtonElement>('.as-crumb__more')?.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('li')).toHaveLength(6);
    expect(el.querySelector('.as-crumb__more')).toBeNull();
  });
});
