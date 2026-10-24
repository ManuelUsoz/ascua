import { TestBed } from '@angular/core/testing';
import type { Commit } from '@ascua/source-control';
import { i18nTesting } from '../../testing/i18n';
import { CommitRow } from './commit-row';

const commit = {
  sha: 'abc1234567',
  title: 'Arregla',
  message: 'Arregla',
  author: { name: 'Hubot', login: 'hubot' },
  authoredAt: '2026-01-01T00:00:00Z',
  webUrl: '',
} as Commit;

describe('CommitRow', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [CommitRow, i18nTesting()] });
    const fixture = TestBed.createComponent(CommitRow);
    fixture.componentRef.setInput('commit', commit);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the short sha and the title', () => {
    const { el } = setup();
    expect(el.querySelector('.as-repos__sha')?.textContent).toBe('abc1234');
    expect(el.querySelector('.as-repos__msg')?.textContent).toBe('Arregla');
  });

  it('emits select with the commit when clicked', () => {
    const { fixture, el } = setup();
    const spy = vi.fn();
    fixture.componentInstance.chosen.subscribe(spy);
    el.querySelector<HTMLElement>('button')?.click();
    expect(spy).toHaveBeenCalledWith(commit);
  });
});
