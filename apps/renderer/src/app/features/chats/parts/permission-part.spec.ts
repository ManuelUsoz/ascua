import { TestBed } from '@angular/core/testing';
import type { PermissionPart } from '@ascua/chat';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { ChatStore } from '../../../core/chats/chat-store';
import { i18nTesting } from '../../../testing/i18n';
import { PermissionCard } from './permission-part';

function setup(state: PermissionPart['state'], result: unknown = undefined) {
  const store = { resolvePermission: vi.fn().mockResolvedValue(result) };
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [
      provideTranslocoScope('chats'),
      { provide: ChatStore, useValue: store },
    ],
  });
  const fixture = TestBed.createComponent(PermissionCard);
  fixture.componentRef.setInput('projectId', 'p');
  fixture.componentRef.setInput('sessionId', 's');
  fixture.componentRef.setInput('part', {
    kind: 'permission',
    state,
    request: {
      requestId: 'r1',
      tool: 'execute',
      title: 'Ejecutar un comando',
      detail: 'npm test',
    },
  } satisfies PermissionPart);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const buttons = () => Array.from(el.querySelectorAll('button'));
  return { fixture, el, store, buttons };
}

describe('PermissionCard', () => {
  it('pending shows the request and Permitir/Denegar', () => {
    const { el, buttons } = setup('pending');
    expect(el.textContent).toContain('Permiso solicitado');
    expect(el.textContent).toContain('Ejecutar un comando');
    expect(el.querySelector('code')?.textContent).toBe('npm test');
    expect(buttons().map((b) => b.textContent?.trim())).toEqual([
      'Permitir',
      'Denegar',
    ]);
  });

  it('Permitir and Denegar resolve with the right flag', async () => {
    const { fixture, store, buttons } = setup('pending');
    buttons()[0].click();
    await fixture.whenStable();
    expect(store.resolvePermission).toHaveBeenLastCalledWith(
      'p',
      's',
      'r1',
      true,
    );
    buttons()[1].click();
    await fixture.whenStable();
    expect(store.resolvePermission).toHaveBeenLastCalledWith(
      'p',
      's',
      'r1',
      false,
    );
  });

  it('shows the error when the request is gone', async () => {
    const { fixture, el, buttons } = setup('pending', {
      code: 'chat.notFound',
    });
    buttons()[0].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'El chat o la solicitud ya no existe.',
    );
  });

  it('settled shows a status and no buttons', () => {
    const allowed = setup('allowed');
    expect(allowed.buttons()).toHaveLength(0);
    expect(allowed.el.textContent).toContain('Permitido');
    TestBed.resetTestingModule();
    const denied = setup('denied');
    expect(denied.buttons()).toHaveLength(0);
    expect(denied.el.textContent).toContain('Denegado');
  });
});
