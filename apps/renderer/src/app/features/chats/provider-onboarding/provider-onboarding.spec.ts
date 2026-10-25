import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ProviderAuth, ProviderInfo } from '@ascua/chat';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { ChatStore } from '../../../core/chats/chat-store';
import { TerminalSessions } from '../../../core/terminals/terminal-sessions';
import { i18nTesting } from '../../../testing/i18n';
import { ProviderOnboarding } from './provider-onboarding';

const providers: ProviderInfo[] = [
  { id: 'claude', enabled: true, selected: false },
  { id: 'codex', enabled: false, selected: false },
  { id: 'gemini', enabled: false, selected: false },
];

function setup(auth: ProviderAuth | undefined) {
  const adopt = vi.fn();
  const authSignal = signal<ProviderAuth | undefined>(undefined);
  const store = {
    providers: () => providers,
    auth: authSignal,
    checkAuth: vi.fn(async () => {
      authSignal.set(auth);
      return auth;
    }),
    login: vi.fn().mockResolvedValue({ id: 'term' }),
    select: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [
      provideTranslocoScope('chats'),
      { provide: TerminalSessions, useValue: { adopt } },
      { provide: ChatStore, useValue: store },
    ],
  });
  const navigate = vi
    .spyOn(TestBed.inject(Router), 'navigate')
    .mockResolvedValue(true);
  const fixture = TestBed.createComponent(ProviderOnboarding);
  fixture.componentRef.setInput('projectId', 'p');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const cards = () =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('.chat-provider'));
  const button = (label: string) =>
    Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(label),
    );
  const pickClaude = async () => {
    cards()[0].click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, el, store, adopt, navigate, cards, button, pickClaude };
}

describe('ProviderOnboarding', () => {
  it('only Claude is enabled; the others are badged', () => {
    const { cards, el } = setup(undefined);
    expect(cards().map((c) => c.disabled)).toEqual([false, true, true]);
    expect(el.textContent?.match(/Próximamente/g)).toHaveLength(2);
  });

  it('logged out shows Iniciar sesión, which opens the terminal tab', async () => {
    const { store, adopt, navigate, button, pickClaude, fixture } = setup({
      provider: 'claude',
      state: 'loggedOut',
    });
    await pickClaude();
    expect(store.checkAuth).toHaveBeenCalledWith('claude');
    expect(button('Comprobar de nuevo')).toBeTruthy();
    button('Iniciar sesión')?.click();
    await fixture.whenStable();
    expect(store.login).toHaveBeenCalledWith('p', 'claude');
    expect(adopt).toHaveBeenCalledWith({ id: 'term' });
    expect(navigate).toHaveBeenCalledWith(['/proyectos', 'p', 'terminales']);
  });

  it('logged in selects the provider', async () => {
    const { store, button, pickClaude, fixture, el } = setup({
      provider: 'claude',
      state: 'loggedIn',
      account: { email: 'a@b.c' },
    });
    await pickClaude();
    expect(el.textContent).toContain('Sesión iniciada como a@b.c');
    button('Usar Claude')?.click();
    await fixture.whenStable();
    expect(store.select).toHaveBeenCalledWith('claude');
  });
});
