import { TestBed } from '@angular/core/testing';
import type { DiffFile } from '@ascua/source-control';
import { provideTranslocoScope } from '@jsverse/transloco';
import { i18nTesting } from '../../testing/i18n';
import { FileDiff } from './file-diff';

const file: DiffFile = {
  path: 'src/app/a.ts',
  status: 'modified',
  additions: 3,
  deletions: 2,
  patch: '@@ -1 +1 @@\n-old\n+new',
};

describe('FileDiff', () => {
  function setup(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({
      imports: [FileDiff, i18nTesting()],
      providers: [provideTranslocoScope('repositories')],
    });
    const fixture = TestBed.createComponent(FileDiff);
    fixture.componentRef.setInput('file', file);
    for (const [k, v] of Object.entries(inputs)) {
      fixture.componentRef.setInput(k, v);
    }
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders dir, base and counts', () => {
    const { el } = setup();
    expect(el.querySelector('.as-diff__dir')?.textContent).toBe('src/app/');
    expect(el.querySelector('.as-diff__file')?.textContent).toContain('a.ts');
    expect(el.querySelector('.add')?.textContent).toBe('+3');
    expect(el.querySelector('.del')?.textContent).toBe('−2');
  });

  it('renders side-by-side rows from the patch', () => {
    const { el } = setup();
    expect(el.querySelector('.as-diff__ln--del')?.textContent).toContain('old');
    expect(el.querySelector('.as-diff__ln--add')?.textContent).toContain('new');
  });

  it('shows the binary text without a patch', () => {
    const { el } = setup({ file: { ...file, patch: undefined } });
    expect(el.querySelector('.as-diff__side')).toBeNull();
    expect(el.querySelector('.as-repos__muted')).not.toBeNull();
  });

  it('shows the viewed button only when viewable', () => {
    const { el, fixture } = setup();
    expect(el.querySelector('button.viewed')).toBeNull();
    fixture.componentRef.setInput('viewable', true);
    fixture.detectChanges();
    expect(el.querySelector('button.viewed[role=checkbox]')).not.toBeNull();
  });

  it('emits toggleViewed when the viewed button is clicked', () => {
    const { el, fixture } = setup({ viewable: true });
    const spy = vi.fn();
    fixture.componentInstance.toggleViewed.subscribe(spy);
    el.querySelector<HTMLButtonElement>('button.viewed')?.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('hides the hunks when viewed and reflects aria-checked', () => {
    const { el, fixture } = setup({ viewable: true, viewed: true });
    expect(el.querySelector('.as-diff__side')).toBeNull();
    expect(el.querySelector('.as-diff__file')).not.toBeNull();
    expect(
      el.querySelector('button.viewed')?.getAttribute('aria-checked'),
    ).toBe('true');
    fixture.componentRef.setInput('viewed', false);
    fixture.detectChanges();
    expect(el.querySelector('.as-diff__side')).not.toBeNull();
  });
});
