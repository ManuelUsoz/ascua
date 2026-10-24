import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Repository } from '@ascua/source-control';
import { provideTranslocoScope } from '@jsverse/transloco';
import { SourceControlStore } from '../../core/source-control/source-control-store';
import { i18nTesting } from '../../testing/i18n';
import { RepositoryBrowser } from './repository-browser';

const repo: Repository = {
  provider: 'github',
  id: 'octo/hello',
  name: 'hello',
  owner: 'octo',
  fullName: 'octo/hello',
  private: false,
  fork: false,
  archived: false,
  defaultBranch: 'main',
  webUrl: 'https://github.com/octo/hello',
  updatedAt: '2026-01-01T00:00:00Z',
};

const pr = {
  number: 7,
  title: 'Fix it',
  state: 'open' as const,
  draft: false,
  author: { login: 'octo' },
  sourceBranch: 'fix',
  targetBranch: 'main',
  createdAt: '',
  updatedAt: '',
  webUrl: '',
};

describe('RepositoryBrowser', () => {
  function setup(prs: (typeof pr)[]) {
    const store = {
      status: signal(undefined),
      account: signal({ login: 'octocat' }),
      repositories: vi.fn(() => Promise.resolve({ items: [repo] })),
      pullRequests: vi.fn(() => Promise.resolve({ items: prs })),
      commits: vi.fn(() =>
        Promise.resolve({
          items: [
            {
              sha: 'abcdef1234',
              title: 'First commit',
              message: 'First commit',
              author: { name: 'Octo' },
              authoredAt: '',
              webUrl: '',
            },
          ],
        }),
      ),
      branches: vi.fn(() =>
        Promise.resolve({
          items: [
            { name: 'main', sha: 'a1', protected: true },
            { name: 'dev', sha: 'b2', protected: false },
          ],
        }),
      ),
      diff: vi.fn(() =>
        Promise.resolve({
          truncated: false,
          files: [
            {
              path: 'a.ts',
              status: 'modified' as const,
              additions: 1,
              deletions: 1,
              patch: '@@ -1 +1 @@\n-old\n+new',
            },
          ],
        }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [RepositoryBrowser, i18nTesting()],
      providers: [
        { provide: SourceControlStore, useValue: store },
        provideTranslocoScope('repositories'),
      ],
    });
    return { store, fixture: TestBed.createComponent(RepositoryBrowser) };
  }

  async function settle(fixture: {
    whenStable(): Promise<unknown>;
    detectChanges(): void;
  }) {
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  it('auto-selects the first repo and lists PRs, commits and status bar', async () => {
    const { store, fixture } = setup([pr]);
    const el: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();
    await settle(fixture);

    expect(store.pullRequests).toHaveBeenCalledWith('octo/hello', {
      state: 'open',
      branch: 'main',
    });
    expect(store.commits).toHaveBeenCalledWith('octo/hello', {
      branch: 'main',
    });
    expect(el.querySelector('.as-repos__h1')?.textContent).toContain('hello');
    expect(el.querySelector('.as-repos__pr')?.textContent).toContain('Fix it');
    expect(el.querySelector('.as-repos__commit')?.textContent).toContain(
      'abcdef1',
    );
    const bar = el.querySelector('.as-statusbar')?.textContent ?? '';
    expect(bar).toContain('GitHub conectado');
    expect(bar).toContain('octocat');
  });

  it('switches the branch in the header and reloads PRs and commits', async () => {
    const { store, fixture } = setup([pr]);
    const el: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();
    await settle(fixture);

    const select = el.querySelector<HTMLSelectElement>(
      '.as-repos__head app-select select',
    );
    expect(el.querySelector('.as-repos__section-head select')).toBeNull();
    expect(select?.getAttribute('aria-label')).toBe('Rama');
    expect(select?.options.length).toBe(2);
    expect(select?.value).toBe('main');
    select!.value = 'dev';
    select!.dispatchEvent(new Event('change'));
    await settle(fixture);

    expect(store.commits).toHaveBeenLastCalledWith('octo/hello', {
      branch: 'dev',
    });
    expect(store.pullRequests).toHaveBeenLastCalledWith('octo/hello', {
      state: 'open',
      branch: 'dev',
    });
  });

  it('shows the first-load spinner while repositories are pending', async () => {
    const { store, fixture } = setup([pr]);
    store.repositories.mockReturnValue(new Promise(() => undefined));
    const el: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();
    await settle(fixture);

    const text = el.querySelector('[role=status]')?.textContent ?? '';
    expect(text).toContain('Trayendo tu información de GitHub');
    expect(text).toContain('Puede tardar un segundo.');
  });

  it('shows an inline loading spinner while PRs are pending', async () => {
    const { store, fixture } = setup([pr]);
    store.pullRequests.mockReturnValue(new Promise(() => undefined));
    const el: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();
    await settle(fixture);

    expect(el.querySelector('[role=status]')?.textContent).toContain(
      'Cargando',
    );
  });

  it('loads the diff when a PR is clicked', async () => {
    const { store, fixture } = setup([pr]);
    const el: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();
    await settle(fixture);

    el.querySelector<HTMLButtonElement>('.as-repos__pr')?.click();
    await settle(fixture);
    expect(store.diff).toHaveBeenCalledWith('octo/hello', 7, undefined);
    expect(el.querySelector('.as-diff__ln--add')?.textContent).toContain('new');
    expect(el.querySelector('.as-statusbar')?.textContent).toContain(
      '1 archivos',
    );
  });

  it('shows the empty card without pull requests', async () => {
    const { fixture } = setup([]);
    const el: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();
    await settle(fixture);

    expect(el.querySelector('.as-repos__empty')?.textContent).toContain(
      'No hay pull requests abiertos',
    );
  });
});
