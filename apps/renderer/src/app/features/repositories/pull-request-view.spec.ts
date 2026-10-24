import { TestBed } from '@angular/core/testing';
import type { PullRequest, Repository } from '@ascua/source-control';
import { provideTranslocoScope } from '@jsverse/transloco';
import { SourceControlStore } from '../../core/source-control/source-control-store';
import { i18nTesting } from '../../testing/i18n';
import { PullRequestView } from './pull-request-view';

const repo = { id: 'octo/hello', name: 'hello' } as Repository;
const pr = {
  number: 7,
  title: 'Fix it',
  state: 'open',
  draft: false,
  author: { login: 'hubot' },
  sourceBranch: 'fix',
  targetBranch: 'main',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '',
  webUrl: '',
} as PullRequest;
const diff = {
  truncated: false,
  files: [
    {
      path: 'src/a.ts',
      status: 'modified' as const,
      additions: 1,
      deletions: 1,
      patch: '@@ -1 +1 @@\n-old\n+new',
    },
  ],
};

describe('PullRequestView', () => {
  function setup(login = 'octocat', review = vi.fn(() => Promise.resolve())) {
    TestBed.configureTestingModule({
      imports: [PullRequestView, i18nTesting()],
      providers: [
        { provide: SourceControlStore, useValue: { review } },
        provideTranslocoScope('repositories'),
      ],
    });
    const fixture = TestBed.createComponent(PullRequestView);
    fixture.componentRef.setInput('repo', repo);
    fixture.componentRef.setInput('pr', pr);
    fixture.componentRef.setInput('diff', diff);
    fixture.componentRef.setInput('account', { login });
    fixture.detectChanges();
    return { review, fixture, el: fixture.nativeElement as HTMLElement };
  }

  const flush = async (fixture: {
    whenStable(): Promise<unknown>;
    detectChanges(): void;
  }) => {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const button = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(text),
    );

  it('renders side-by-side rows without the marker', () => {
    const { el } = setup();
    expect(el.querySelector('.as-diff__ln--add')?.textContent).toContain('new');
    expect(el.querySelector('.as-diff__ln--add')?.textContent).not.toContain(
      '+',
    );
    expect(el.querySelector('.as-diff__ln--del')?.textContent).toContain('old');
  });

  it('marks files as viewed from the diff header and drives the progress bar', () => {
    const { el, fixture } = setup();
    fixture.componentRef.setInput('diff', {
      truncated: false,
      files: [...diff.files, { ...diff.files[0], path: 'src/b.ts' }],
    });
    fixture.detectChanges();
    const boxes = () => [
      ...el.querySelectorAll<HTMLElement>('.as-diff__file button.viewed'),
    ];
    const bar = () => el.querySelector('[role=progressbar]') as HTMLElement;
    const fill = () => el.querySelector('.as-progress__fill') as HTMLElement;
    expect(boxes().length).toBe(2);
    expect(bar().getAttribute('aria-valuenow')).toBe('0');
    expect(bar().getAttribute('aria-valuemax')).toBe('2');
    expect(fill().style.transform).toBe('scaleX(0)');
    const rows = () => el.querySelectorAll('.as-diff__side').length;
    const before = rows();
    boxes()[0].click();
    fixture.detectChanges();
    expect(bar().getAttribute('aria-valuenow')).toBe('1');
    expect(fill().style.transform).toBe('scaleX(0.5)');
    expect(el.textContent).toContain('1/2 vistos');
    expect(rows()).toBeLessThan(before);
    boxes()[0].click();
    fixture.detectChanges();
    expect(rows()).toBe(before);
    expect(bar().getAttribute('aria-valuenow')).toBe('0');
  });

  it('marks the tree row active on click', () => {
    const { el, fixture } = setup();
    Element.prototype.scrollIntoView = vi.fn();
    const row = el.querySelector('.as-pr__tree .as-tree__row') as HTMLElement;
    expect(row.getAttribute('aria-current')).toBeNull();
    row.click();
    fixture.detectChanges();
    expect(row.getAttribute('aria-current')).toBe('true');
  });

  it('has no Comentar button', () => {
    const { el } = setup();
    expect(button(el, 'Comentar')).toBeUndefined();
  });

  it('lists the commits in their tab and emits openCommit', () => {
    const { el, fixture } = setup();
    const commit = {
      sha: 'abc1234567',
      title: 'Arregla',
      author: { name: 'Hubot' },
      authoredAt: '2026-01-01T00:00:00Z',
    };
    fixture.componentRef.setInput('commits', [commit]);
    fixture.detectChanges();
    const opened: unknown[] = [];
    fixture.componentInstance.openCommit.subscribe((c) => opened.push(c));
    button(el, 'Commits')?.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('abc1234');
    expect(el.textContent).toContain('Arregla');
    (el.querySelector('button.as-repos__commit') as HTMLElement).click();
    expect(opened).toEqual([commit]);
  });

  it('shows the commit view in the Commits tab and emits closeCommit on back', () => {
    const { el, fixture } = setup();
    fixture.componentRef.setInput('commit', {
      sha: 'abc1234567',
      title: 'Arregla',
      author: { name: 'Hubot' },
      authoredAt: '2026-01-01T00:00:00Z',
    });
    fixture.componentRef.setInput('commitDiff', diff);
    fixture.detectChanges();
    button(el, 'Commits')?.click();
    fixture.detectChanges();
    expect(el.querySelector('app-commit-diff-view')).not.toBeNull();
    let n = 0;
    fixture.componentInstance.closeCommit.subscribe(() => n++);
    button(el, 'Volver a los commits')?.click();
    expect(n).toBe(1);
  });

  it('shows the empty text when the PR has no commits', () => {
    const { el, fixture } = setup();
    button(el, 'Commits')?.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Este pull request no tiene commits.');
  });

  it('shows a loading spinner while the diff is pending', () => {
    const { el, fixture } = setup();
    fixture.componentRef.setInput('diffLoading', true);
    fixture.detectChanges();
    expect(el.querySelector('[role=status]')?.textContent).toContain(
      'Cargando',
    );
  });

  it('approves directly and shows Aprobado', async () => {
    const { review, fixture, el } = setup();
    button(el, 'Aprobar')?.click();
    await flush(fixture);
    expect(review).toHaveBeenCalledWith('octo/hello', 7, { event: 'approve' });
    expect(el.textContent).toContain('Aprobado');
  });

  it('approves without the open comment draft and keeps it', async () => {
    const { review, fixture, el } = setup();
    button(el, 'Pedir cambios')?.click();
    await flush(fixture);
    const area = el.querySelector('textarea') as HTMLTextAreaElement;
    area.value = 'borrador';
    area.dispatchEvent(new Event('input'));
    await flush(fixture);
    button(el, 'Aprobar')?.click();
    await flush(fixture);
    expect(review).toHaveBeenCalledWith('octo/hello', 7, { event: 'approve' });
    expect(
      (el.querySelector('textarea') as HTMLTextAreaElement | null)?.value,
    ).toBe('borrador');
  });

  it('requires text to request changes', async () => {
    const { review, fixture, el } = setup();
    button(el, 'Pedir cambios')?.click();
    fixture.detectChanges();
    const send = button(el, 'Enviar');
    expect(send?.disabled).toBe(true);
    const area = el.querySelector('textarea') as HTMLTextAreaElement;
    area.value = 'hola';
    area.dispatchEvent(new Event('input'));
    await flush(fixture);
    expect(button(el, 'Enviar')?.disabled).toBe(false);
    button(el, 'Enviar')?.click();
    await flush(fixture);
    expect(review).toHaveBeenCalledWith('octo/hello', 7, {
      event: 'requestChanges',
      body: 'hola',
    });
  });

  it('hides Aprobar on your own PR', () => {
    const { el } = setup('hubot');
    expect(button(el, 'Aprobar')).toBeUndefined();
  });

  it('opens a merged PR without review actions', () => {
    const { el, fixture } = setup();
    fixture.componentRef.setInput('pr', { ...pr, state: 'merged' });
    fixture.detectChanges();
    const state = el.querySelector('.as-pr__meta .as-state');
    expect(state?.textContent).toContain('Fusionado');
    expect(state?.getAttribute('data-tone')).toBe('merged');
    expect(el.querySelector('.as-diff__ln--add')).not.toBeNull();
    expect(button(el, 'Aprobar')).toBeUndefined();
    expect(button(el, 'Pedir cambios')).toBeUndefined();
  });

  it('opens a closed PR without Aprobar', () => {
    const { el, fixture } = setup();
    fixture.componentRef.setInput('pr', { ...pr, state: 'closed' });
    fixture.detectChanges();
    const state = el.querySelector('.as-pr__meta .as-state');
    expect(state?.textContent).toContain('Cerrado');
    expect(state?.getAttribute('data-tone')).toBe('alert');
    expect(button(el, 'Aprobar')).toBeUndefined();
  });

  it('keeps both actions on an open PR', () => {
    const { el } = setup();
    expect(button(el, 'Aprobar')).toBeDefined();
    expect(button(el, 'Pedir cambios')).toBeDefined();
  });

  it('shows an alert when the review fails', async () => {
    const { fixture, el } = setup(
      'octocat',
      vi.fn(() => Promise.reject({ code: 'sourceControl.rejected' })),
    );
    button(el, 'Aprobar')?.click();
    await flush(fixture);
    expect(el.querySelector('[role=alert]')).not.toBeNull();
  });
});
