import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ChatSession } from '@ascua/chat';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { ChatStore } from '../../core/chats/chat-store';
import { SettingsStore } from '../../core/settings/settings-store';
import { i18nTesting } from '../../testing/i18n';
import { ChatsHome } from './chats-home';

const session = (id: string, updatedAt: number): ChatSession => ({
  id,
  projectId: 'p',
  provider: 'claude',
  mode: 'chat',
  createdAt: 1,
  updatedAt,
  status: 'idle',
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
});

async function setup(provider: 'claude' | undefined, list: ChatSession[]) {
  const store = {
    providers: () => [],
    auth: () => undefined,
    selectedProvider: signal(provider),
    sessions: () => list,
    loadProviders: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(undefined),
    commands: () => [],
    loadCommands: vi.fn().mockResolvedValue(undefined),
    models: () => ({ provider: 'claude', models: [], source: 'static' }),
    loadModels: vi.fn().mockResolvedValue(undefined),
  };
  const settings = {
    settings: signal({}),
    setChatDefaults: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [
      provideTranslocoScope('chats'),
      { provide: ChatStore, useValue: store },
      { provide: SettingsStore, useValue: settings },
    ],
  });
  const navigate = vi
    .spyOn(TestBed.inject(Router), 'navigate')
    .mockResolvedValue(true);
  const fixture = TestBed.createComponent(ChatsHome);
  fixture.componentRef.setInput('projectId', 'p');
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, navigate };
}

describe('ChatsHome', () => {
  it('opens onboarding when no provider is set', async () => {
    const { el, navigate } = await setup(undefined, []);
    expect(el.textContent).toContain('Elegí un proveedor');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens the new chat screen when there are no sessions', async () => {
    const { el } = await setup('claude', []);
    expect(el.querySelector('h1')?.textContent).toBe('Nuevo chat');
  });

  it('redirects to the latest session', async () => {
    const { navigate } = await setup('claude', [
      session('old', 1),
      session('new', 9),
    ]);
    expect(navigate).toHaveBeenCalledWith(['/proyectos', 'p', 'chats', 'new'], {
      replaceUrl: true,
    });
  });
});
