import { TestBed } from '@angular/core/testing';
import type { Commit, CommitDiff } from '@ascua/source-control';
import { provideTranslocoScope } from '@jsverse/transloco';
import { i18nTesting } from '../../testing/i18n';
import { CommitDiffView } from './commit-diff-view';

const commit = {
  sha: 'abc1234567',
  title: 'Arregla',
  message: 'Arregla',
  author: { name: 'Hubot', login: 'hubot' },
  authoredAt: '2026-01-01T00:00:00Z',
  webUrl: '',
} as Commit;

const diff: CommitDiff = {
  truncated: false,
  files: [
    {
      path: 'src/a.ts',
      status: 'modified',
      additions: 1,
      deletions: 1,
      patch: '@@ -1 +1 @@\n-old\n+new',
    },
    { path: 'b.ts', status: 'added', additions: 2, deletions: 0 },
  ],
};

describe('CommitDiffView', () => {
  function setup(value: CommitDiff | undefined = diff) {
    TestBed.configureTestingModule({
      imports: [CommitDiffView, i18nTesting()],
      providers: [provideTranslocoScope('repositories')],
    });
    const fixture = TestBed.createComponent(CommitDiffView);
    fixture.componentRef.setInput('commit', commit);
    fixture.componentRef.setInput('diff', value);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the short sha and the title', () => {
    const { el } = setup();
    const head = el.querySelector('.as-commit__head')?.textContent ?? '';
    expect(head).toContain('abc1234');
    expect(head).not.toContain('abc12345');
    expect(head).toContain('Arregla');
  });

  it('renders one file diff per file without a viewed checkbox', () => {
    const { el } = setup();
    expect(el.querySelectorAll('app-file-diff').length).toBe(2);
    expect(el.querySelector('input[type=checkbox]')).toBeNull();
  });

  it('marks the clicked row as current', () => {
    const { el, fixture } = setup();
    Element.prototype.scrollIntoView = vi.fn();
    const row = el.querySelectorAll<HTMLElement>('.as-tree__row')[1];
    row.click();
    fixture.detectChanges();
    expect(row.getAttribute('aria-current')).toBe('true');
  });

  it('emits back', () => {
    const { el, fixture } = setup();
    let n = 0;
    fixture.componentInstance.back.subscribe(() => n++);
    el.querySelector<HTMLButtonElement>('.as-commit__head button')?.click();
    expect(n).toBe(1);
  });

  it('shows the empty and truncated texts', () => {
    const { el, fixture } = setup({ files: [], truncated: false });
    expect(el.textContent).toContain('Este commit no cambia archivos.');
    fixture.componentRef.setInput('diff', { ...diff, truncated: true });
    fixture.detectChanges();
    expect(el.textContent).toContain(
      'Hay más archivos de los que se muestran.',
    );
  });
});
