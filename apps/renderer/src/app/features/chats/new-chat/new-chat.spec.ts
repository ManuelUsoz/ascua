import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  CLEAR_COMMAND,
  NXY_COMMANDS,
  STATIC_MODEL_CATALOGS,
} from '@ascua/chat';
import type { Settings } from '@ascua/ipc';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { ChatStore } from '../../../core/chats/chat-store';
import { SettingsStore } from '../../../core/settings/settings-store';
import { i18nTesting } from '../../../testing/i18n';
import { NewChat } from './new-chat';

async function setup(
  startResult: unknown,
  chatDefaults?: Settings['chatDefaults'],
  provider: string | null = 'claude',
  loadFails = false,
) {
  const store = {
    providers: () => [],
    auth: () => undefined,
    loadProviders: loadFails
      ? vi.fn().mockRejectedValue(new Error('boom'))
      : vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(startResult),
    commands: () => [CLEAR_COMMAND, ...NXY_COMMANDS],
    loadCommands: vi.fn().mockResolvedValue(undefined),
    loadModels: vi.fn().mockResolvedValue(undefined),
    capabilitiesLoading: () => false,
    models: () => STATIC_MODEL_CATALOGS.claude,
    selectedProvider: () => provider ?? undefined,
  };
  const settings = {
    settings: signal<Settings>({ language: 'es', chatDefaults }),
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
  const fixture = TestBed.createComponent(NewChat);
  fixture.componentRef.setInput('projectId', 'p');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const area = el.querySelector('textarea') as HTMLTextAreaElement;
  const submit = async () => {
    area.value = 'hola';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { el, store, settings, navigate, fixture, submit };
}

describe('NewChat', () => {
  it('loads providers on init and shows the composer when one is selected', async () => {
    const { el, store } = await setup({ id: 's1' });
    expect(store.loadProviders).toHaveBeenCalledTimes(1);
    expect(el.querySelector('app-chat-composer')).not.toBeNull();
    expect(el.querySelector('app-provider-onboarding')).toBeNull();
  });

  it('shows onboarding instead of the composer without a provider', async () => {
    const { el } = await setup({ id: 's1' }, undefined, null);
    expect(el.querySelector('app-provider-onboarding')).not.toBeNull();
    expect(el.querySelector('app-chat-composer')).toBeNull();
  });

  it('becomes ready and shows onboarding when loadProviders rejects', async () => {
    const { el } = await setup({ id: 's1' }, undefined, null, true);
    expect(el.querySelector('app-provider-onboarding')).not.toBeNull();
  });

  it('shows the empty state in Spanish', async () => {
    const { el, submit } = await setup({ id: 's1' });
    await submit();
    expect(el.querySelector('h1')?.textContent).toBe('Nuevo chat');
  });

  it('starts with full access by default, shows the selectors and navigates', async () => {
    const { el, store, navigate, submit } = await setup({ id: 's1' });
    const permission = el.querySelector<HTMLButtonElement>(
      '.chat-composer__perm button',
    )!;
    expect(permission.textContent?.trim()).toBe('Acceso total');
    await submit();
    expect(store.start).toHaveBeenCalledWith('p', 'hola', {
      permissionMode: 'fullAccess',
    });
    expect(navigate).toHaveBeenCalledWith(['/proyectos', 'p', 'chats', 's1']);
  });

  it('seeds from the remembered defaults and writes the choice back', async () => {
    const { settings, store, submit } = await setup(
      { id: 's1' },
      {
        claude: {
          permissionMode: 'acceptEdits',
          model: 'opus',
          effort: 'high',
        },
      },
    );
    await submit();
    const expected = {
      permissionMode: 'acceptEdits',
      model: 'opus',
      effort: 'high',
    };
    expect(store.start).toHaveBeenCalledWith('p', 'hola', expected);
    expect(settings.setChatDefaults).toHaveBeenCalledWith('claude', expected);
  });

  it('a permission pick applies to the first prompt', async () => {
    const { el, store, fixture, submit } = await setup({ id: 's1' });
    el.querySelector<HTMLButtonElement>('.chat-composer__perm button')!.click();
    fixture.detectChanges();
    Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'))
      .find((o) => o.textContent?.includes('Supervisado'))!
      .click();
    fixture.detectChanges();
    await submit();
    expect(store.start).toHaveBeenCalledWith('p', 'hola', {
      permissionMode: 'supervised',
    });
  });

  it('loads the project commands and offers no /clear', async () => {
    const { el, store, fixture } = await setup({ id: 's1' });
    expect(store.loadCommands).toHaveBeenCalledWith('p');
    const area = el.querySelector('textarea') as HTMLTextAreaElement;
    area.value = '/';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const names = Array.from(el.querySelectorAll('[role="option"]')).map(
      (o) => o.querySelector('.chat-commands__name')?.textContent,
    );
    expect(names).toEqual(['/locate', '/make', '/review']);
  });

  it('shows the error and stays', async () => {
    const { el, navigate, submit } = await setup({ code: 'chat.authRequired' });
    await submit();
    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Inicia sesión en el proveedor para continuar.',
    );
  });
});
