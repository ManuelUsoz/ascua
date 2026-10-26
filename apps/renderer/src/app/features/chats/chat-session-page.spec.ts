import { TestBed } from '@angular/core/testing';
import {
  CLEAR_COMMAND,
  EMPTY_USAGE,
  NXY_COMMANDS,
  STATIC_MODEL_CATALOGS,
  type ChatSession,
} from '@ascua/chat';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { ChatStore } from '../../core/chats/chat-store';
import { i18nTesting } from '../../testing/i18n';
import { ChatSessionPage } from './chat-session-page';

const session = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: 's1',
  projectId: 'p1',
  provider: 'claude',
  mode: 'chat',
  permissionMode: 'supervised',
  createdAt: 1,
  updatedAt: 1,
  status: 'idle',
  usage: EMPTY_USAGE,
  ...overrides,
});

async function setup(overrides: Partial<ChatSession> = {}) {
  const current = session(overrides);
  const store = {
    transcript: () => [],
    status: () => 'idle',
    session: () => current,
    commands: () => [CLEAR_COMMAND, ...NXY_COMMANDS],
    load: vi.fn().mockResolvedValue(undefined),
    loadTranscript: vi.fn().mockResolvedValue(undefined),
    loadCommands: vi.fn().mockResolvedValue(undefined),
    loadModels: vi.fn().mockResolvedValue(undefined),
    models: () => STATIC_MODEL_CATALOGS.claude,
    send: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [
      provideTranslocoScope('chats'),
      { provide: ChatStore, useValue: store },
    ],
  });
  const fixture = TestBed.createComponent(ChatSessionPage);
  fixture.componentRef.setInput('projectId', 'p1');
  fixture.componentRef.setInput('sessionId', 's1');
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const area = el.querySelector('textarea') as HTMLTextAreaElement;
  const type = (value: string) => {
    area.value = value;
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const enter = async () => {
    area.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { el, fixture, store, type, enter };
}

describe('ChatSessionPage', () => {
  it('loads the session, its transcript and its commands', async () => {
    const { store } = await setup();
    expect(store.load).toHaveBeenCalledWith('p1');
    expect(store.loadTranscript).toHaveBeenCalledWith('p1', 's1');
    expect(store.loadCommands).toHaveBeenCalledWith('p1', 's1');
  });

  it('shows the session title in the header', async () => {
    const { el } = await setup({ title: 'Mi chat' });
    expect(el.querySelector('.chat-head__title')?.textContent).toContain(
      'Mi chat',
    );
  });

  it('/clear clears the chat in place and does not send it', async () => {
    const { store, type, enter } = await setup();
    type('/clear');
    // The open menu completes the name first; a second Enter submits it.
    await enter();
    expect(store.clear).not.toHaveBeenCalled();
    await enter();
    expect(store.clear).toHaveBeenCalledWith('p1', 's1');
    expect(store.send).not.toHaveBeenCalled();
  });

  it('other text goes through send', async () => {
    const { store, type, enter } = await setup();
    type('hola');
    await enter();
    expect(store.send).toHaveBeenCalledWith('p1', 's1', 'hola');
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('the permission selector updates the session', async () => {
    const { el, store, fixture } = await setup();
    const permission = el.querySelector<HTMLButtonElement>(
      '.chat-composer__perm button',
    )!;
    expect(permission.textContent?.trim()).toBe('Supervisado');
    permission.click();
    fixture.detectChanges();
    Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'))
      .find((o) => o.textContent?.includes('Acceso total'))!
      .click();
    await Promise.resolve();
    expect(store.update).toHaveBeenCalledWith('p1', 's1', {
      permissionMode: 'fullAccess',
    });
  });

  it('the model selector shows the session model and loads the catalog', async () => {
    const { el, store } = await setup({ model: 'opus' });
    expect(store.loadModels).toHaveBeenCalledWith('p1');
    const model = el.querySelector('select') as HTMLSelectElement;
    expect(model.value).toBe('opus');
  });

  it('exiting the mode resets it to chat', async () => {
    const { el, store, fixture } = await setup({ mode: 'locate' });
    const chip = el.querySelector('.chat-composer__chip') as HTMLElement;
    chip.querySelector('button')?.click();
    await fixture.whenStable();
    expect(store.update).toHaveBeenCalledWith('p1', 's1', { mode: 'chat' });
  });
});
