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
    button(el, 'Comentar')?.click();
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

  it('requires text to comment', async () => {
    const { review, fixture, el } = setup();
    button(el, 'Comentar')?.click();
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
      event: 'comment',
      body: 'hola',
    });
  });

  it('hides Aprobar on your own PR', () => {
    const { el } = setup('hubot');
    expect(button(el, 'Aprobar')).toBeUndefined();
    expect(button(el, 'Comentar')).toBeDefined();
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
