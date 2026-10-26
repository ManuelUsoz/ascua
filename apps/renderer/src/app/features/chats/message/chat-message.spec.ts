import { TestBed } from '@angular/core/testing';
import type { Message, MessagePart } from '@ascua/chat';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { ChatStore } from '../../../core/chats/chat-store';
import { i18nTesting } from '../../../testing/i18n';
import { ChatMessage } from './chat-message';

function render(parts: MessagePart[], extra: Partial<Message> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [
      provideTranslocoScope('chats'),
      { provide: ChatStore, useValue: { resolvePermission: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(ChatMessage);
  fixture.componentRef.setInput('message', {
    id: 'm',
    sessionId: 's',
    role: 'assistant',
    parts,
    createdAt: 1,
    ...extra,
  } satisfies Message);
  fixture.componentRef.setInput('projectId', 'p');
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ChatMessage', () => {
  it('renders text as plain text, never as HTML', () => {
    const el = render([{ kind: 'text', text: '<b>hola</b>' }]);
    expect(el.textContent).toContain('<b>hola</b>');
    expect(el.querySelector('b')).toBeNull();
  });

  it('keeps user text literal and renders assistant markdown', () => {
    const user = render([{ kind: 'text', text: '**a** <b>hola</b>' }], {
      role: 'user',
    });
    expect(user.textContent).toContain('**a** <b>hola</b>');
    expect(user.querySelector('strong')).toBeNull();
    const bot = render([{ kind: 'text', text: '**a** y `x`' }]);
    expect(bot.querySelector('strong')?.textContent).toBe('a');
    expect(bot.querySelector('code')?.textContent).toBe('x');
  });

  it('renders thinking collapsed', () => {
    const el = render([{ kind: 'thinking', text: 'pienso' }]);
    const details = el.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('Pensando');
    expect(details.textContent).toContain('pienso');
  });

  it('renders consecutive tools as one group', () => {
    const el = render([
      {
        kind: 'toolUse',
        toolUseId: 't',
        tool: 'read',
        title: 'Leer: a.ts',
        status: 'done',
      },
      {
        kind: 'toolResult',
        toolUseId: 't',
        isError: false,
        summary: 'ok 3 líneas',
      },
    ]);
    expect(el.querySelectorAll('app-tool-group')).toHaveLength(1);
    expect(el.textContent).toContain('Leer ×1');
    expect(el.textContent).toContain('a.ts');
  });

  it('renders a pending permission card', () => {
    const el = render([
      {
        kind: 'permission',
        state: 'pending',
        request: { requestId: 'r', tool: 'edit', title: 'Editar b.ts' },
      },
    ]);
    expect(el.textContent).toContain('Editar b.ts');
    expect(el.querySelectorAll('button')).toHaveLength(2);
  });

  it('renders an error part from the catalog', () => {
    const el = render([{ kind: 'error', code: 'busy' }]);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'El chat está ocupado.',
    );
  });

  it('shows tokens and cost on a completed assistant turn', () => {
    const el = render([{ kind: 'text', text: 'listo' }], {
      stop: 'endTurn',
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: 0.0123,
      },
    });
    const footer = el.querySelector('footer')?.textContent ?? '';
    expect(footer).toContain('120 tokens');
    expect(footer).toContain('US$ 0.0123');
  });
});
