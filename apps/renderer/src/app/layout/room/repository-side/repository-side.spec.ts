import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { Repository } from '@ascua/source-control';
import { provideTranslocoScope } from '@jsverse/transloco';
import { RepositorySelection } from '../../../core/source-control/repository-selection';
import { SourceControlStore } from '../../../core/source-control/source-control-store';
import { i18nTesting } from '../../../testing/i18n';
import { RepositorySide } from './repository-side';

const repo = (name: string): Repository => ({
  provider: 'github',
  id: `octo/${name}`,
  name,
  owner: 'octo',
  fullName: `octo/${name}`,
  private: false,
  fork: false,
  archived: false,
  defaultBranch: 'main',
  webUrl: '',
  updatedAt: '',
});

describe('RepositorySide', () => {
  it('lists repos, shows the account and disconnects', async () => {
    const disconnect = vi.fn();
    const navigate = vi.fn();
    const account = { login: 'octocat' };
    TestBed.configureTestingModule({
      imports: [RepositorySide, i18nTesting()],
      providers: [
        { provide: Router, useValue: { navigate } },
        {
          provide: SourceControlStore,
          useValue: {
            status: signal({
              provider: 'github',
              state: 'connected',
              account,
              persisted: true,
            }),
            account: signal(account),
            disconnect,
          },
        },
        {
          provide: RepositorySelection,
          useValue: {
            repos: signal([repo('a'), repo('b')]),
            selectedRepo: signal(repo('a')),
            selectedPr: signal(undefined),
            nextPage: signal(undefined),
            reposLoading: signal(false),
          },
        },
        provideTranslocoScope('repositories'),
      ],
    });
    const fixture = TestBed.createComponent(RepositorySide);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    const rows = el.querySelectorAll<HTMLButtonElement>('.as-repos__item');
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute('aria-current')).toBe('true');
    rows[1].click();
    expect(navigate).toHaveBeenCalledWith(['/repositorios', 'octo/b']);
    expect(el.querySelector('.as-current')?.textContent).toContain('octocat');

    const buttons =
      el.querySelectorAll<HTMLButtonElement>('.as-current button');
    buttons[buttons.length - 1].click();
    expect(disconnect).toHaveBeenCalled();
  });

  const render = (
    status: unknown,
    reposLoading: boolean,
    error: unknown = undefined,
    selectedPr: unknown = undefined,
  ): HTMLElement => {
    TestBed.configureTestingModule({
      imports: [RepositorySide, i18nTesting()],
      providers: [
        {
          provide: SourceControlStore,
          useValue: {
            status: signal(status),
            account: signal(undefined),
            error: signal(error),
          },
        },
        {
          provide: RepositorySelection,
          useValue: {
            repos: signal([repo('a')]),
            selectedRepo: signal(undefined),
            selectedPr: signal(selectedPr),
            nextPage: signal('2'),
            reposLoading: signal(reposLoading),
          },
        },
        provideTranslocoScope('repositories'),
      ],
    });
    const fixture = TestBed.createComponent(RepositorySide);
    fixture.detectChanges();
    return fixture.nativeElement;
  };

  it('renders nothing when disconnected', () => {
    const el = render({ provider: 'github', state: 'disconnected' }, false);
    expect(el.querySelector('aside')).toBeNull();
  });

  it('shows the shell with a spinner while the status loads', () => {
    const el = render(undefined, false);
    expect(el.querySelector('.as-side__head')?.textContent).toContain('Repos');
    expect(el.querySelector('[role=status]')?.textContent).toContain(
      'Cargando',
    );
  });

  it('renders nothing when the status failed to load', () => {
    const el = render(undefined, false, { code: 'x' });
    expect(el.querySelector('aside')).toBeNull();
  });

  it('keeps listing the repos while a PR is open', () => {
    const connected = {
      provider: 'github',
      state: 'connected',
      account: { login: 'octocat' },
      persisted: true,
    };
    const el = render(connected, false, undefined, { number: 7 });
    expect(el.querySelectorAll('.as-repos__item').length).toBe(1);
  });

  it('shows a spinner instead of the load-more button while loading', () => {
    const connected = {
      provider: 'github',
      state: 'connected',
      account: { login: 'octocat' },
      persisted: true,
    };
    const el = render(connected, true);
    expect(el.querySelector('[role=status]')?.textContent).toContain(
      'Cargando',
    );
    expect(el.querySelector('.as-side > .as-btn--ghost')).toBeNull();
  });
});
