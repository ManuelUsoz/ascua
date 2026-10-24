import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { AscuaError, SourceControlStatus } from '@ascua/ipc';
import type { Repository } from '@ascua/source-control';
import { provideTranslocoScope } from '@jsverse/transloco';
import { RepositorySelection } from '../../core/source-control/repository-selection';
import { SourceControlStore } from '../../core/source-control/source-control-store';
import { i18nTesting } from '../../testing/i18n';
import { RepositoriesPage } from './repositories-page';

describe('RepositoriesPage', () => {
  const status = signal<SourceControlStatus | undefined>(undefined);
  const error = signal<AscuaError | undefined>(undefined);
  const store = {
    status,
    error,
    busy: signal(false),
    account: signal(undefined),
    load: vi.fn(() => Promise.resolve()),
    connect: vi.fn(),
    cancel: vi.fn(),
    openVerification: vi.fn(),
    disconnect: vi.fn(),
    repositories: vi.fn(() => Promise.resolve({ items: [] })),
    pullRequests: vi.fn(),
    commits: vi.fn(),
    diff: vi.fn(),
  };

  async function render() {
    TestBed.configureTestingModule({
      imports: [RepositoriesPage, i18nTesting()],
      providers: [
        { provide: SourceControlStore, useValue: store },
        provideTranslocoScope('repositories'),
      ],
    });
    const fixture = TestBed.createComponent(RepositoriesPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    status.set(undefined);
    error.set(undefined);
  });

  it('offers to connect when disconnected, with the last error', async () => {
    status.set({
      provider: 'github',
      state: 'disconnected',
      error: { code: 'sourceControl.denied' },
    });
    const el = await render();
    expect(store.load).toHaveBeenCalled();
    expect(el.textContent).toContain('Conectar GitHub');
    expect(el.textContent).toContain('Conecta tu cuenta de GitHub');
    expect(el.querySelector('[role=alert]')).not.toBeNull();
    expect(el.textContent).not.toContain('Solo lectura');
    const radios = el.querySelectorAll<HTMLButtonElement>('[role=radio]');
    expect(radios.length).toBe(4);
    expect([...radios].filter((r) => r.disabled).length).toBe(3);
    expect(el.querySelectorAll('.as-connect__soon').length).toBe(3);
    expect(el.querySelector('.as-connect__soon')?.textContent).toContain(
      'Próximamente',
    );
  });

  it('shows the first-load spinner while the status loads', async () => {
    store.load.mockReturnValueOnce(new Promise<void>(() => undefined));
    const el = await render();
    const text = el.querySelector('[role=status]')?.textContent ?? '';
    expect(text).toContain('Trayendo tu información de GitHub');
    expect(text).toContain('Puede tardar un segundo.');
    expect(el.textContent).not.toContain('Cargando…');
  });

  it('shows the user code and its expiry while connecting', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(1_000_000);
    try {
      status.set({
        provider: 'github',
        state: 'connecting',
        prompt: {
          userCode: 'ABCD-1234',
          verificationUri: 'https://github.com/login/device',
          expiresAt: 1_000_000 + 90_000,
        },
      });
      const el = await render();
      expect(el.querySelector('.as-repos__code')?.textContent).toBe(
        'ABCD-1234',
      );
      expect(el.textContent).toContain('Abrir github.com/login/device');
      expect(el.textContent).toContain('El código vence en 01:30');
    } finally {
      vi.useRealTimers();
    }
  });

  describe('route-driven selection', () => {
    @Component({ template: '' })
    class Stub {}

    function create() {
      TestBed.configureTestingModule({
        imports: [RepositoriesPage, i18nTesting()],
        providers: [
          { provide: SourceControlStore, useValue: store },
          provideTranslocoScope('repositories'),
          provideRouter([
            { path: 'repositorios', component: Stub },
            { path: 'repositorios/:repoId', component: Stub },
          ]),
        ],
      });
      const selection = TestBed.inject(RepositorySelection);
      const follow = vi.spyOn(selection, 'follow').mockResolvedValue();
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigate');
      const fixture = TestBed.createComponent(RepositoriesPage);
      return { selection, follow, router, navigate, fixture };
    }

    it('follows the repo named by the route', async () => {
      const { router, follow, fixture } = create();
      await router.navigateByUrl('/repositorios/octo%2Fhello');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(follow).toHaveBeenCalledWith({ repoId: 'octo/hello' });
    });

    it('redirects the root to the first repo, id as one segment', async () => {
      const { selection, router, navigate, fixture } = create();
      selection.repos.set([{ id: 'octo/hello' } as Repository]);
      await router.navigateByUrl('/repositorios');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(navigate).toHaveBeenCalledWith(['/repositorios', 'octo/hello'], {
        replaceUrl: true,
      });
    });

    it('goes back to the root when the selection is missing', async () => {
      const { selection, router, navigate, fixture } = create();
      await router.navigateByUrl('/repositorios/gone%2Frepo');
      fixture.detectChanges();
      selection.missing.set(true);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(navigate).toHaveBeenCalledWith(['/repositorios'], {
        replaceUrl: true,
      });
    });
  });

  it('shows the browser when connected', async () => {
    status.set({
      provider: 'github',
      state: 'connected',
      persisted: false,
      account: {
        provider: 'github',
        id: '1',
        login: 'octo',
        webUrl: 'https://github.com/octo',
      },
    });
    const el = await render();
    expect(el.querySelector('app-repository-browser')).not.toBeNull();
  });
});
