import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AscuaError, SourceControlStatus } from '@ascua/ipc';
import { provideTranslocoScope } from '@jsverse/transloco';
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
