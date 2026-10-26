import { TestBed } from '@angular/core/testing';
import type { DiffFile } from '@ascua/source-control';
import { i18nTesting } from '../../testing/i18n';
import { DiffFileList } from './diff-file-list';

const files = [
  { path: 'src/a.ts', status: 'modified', additions: 3, deletions: 1 },
  { path: 'b.ts', status: 'added', additions: 5, deletions: 0 },
] as DiffFile[];

describe('DiffFileList', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [DiffFileList, i18nTesting()],
    });
    const fixture = TestBed.createComponent(DiffFileList);
    fixture.componentRef.setInput('files', files);
    fixture.componentRef.setInput('label', 'Archivos cambiados');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const rows = () => [...el.querySelectorAll<HTMLElement>('.as-tree__row')];
    return { fixture, el, rows };
  }

  it('renders base names, counts and the label', () => {
    const { el, rows } = setup();
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Archivos cambiados',
    );
    expect(rows()[0].textContent).toContain('a.ts');
    expect(rows()[0].textContent).toContain('+3 −1');
    expect(rows()[1].textContent).toContain('+5 −0');
  });

  it('follows viewed and active', () => {
    const { fixture, rows } = setup();
    fixture.componentRef.setInput('viewed', new Set(['b.ts']));
    fixture.componentRef.setInput('active', 0);
    fixture.detectChanges();
    expect(rows()[0].hasAttribute('data-viewed')).toBe(false);
    expect(rows()[1].hasAttribute('data-viewed')).toBe(true);
    expect(rows()[0].getAttribute('aria-current')).toBe('true');
    expect(rows()[1].getAttribute('aria-current')).toBeNull();
  });

  it('emits the index of the clicked row', () => {
    const { fixture, rows } = setup();
    const picked: number[] = [];
    fixture.componentInstance.fileSelect.subscribe((i) => picked.push(i));
    rows()[1].click();
    expect(picked).toEqual([1]);
  });
});
