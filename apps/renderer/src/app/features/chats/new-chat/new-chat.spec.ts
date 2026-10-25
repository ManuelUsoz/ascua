import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { ChatStore } from '../../../core/chats/chat-store';
import { i18nTesting } from '../../../testing/i18n';
import { NewChat } from './new-chat';

async function setup(startResult: unknown) {
  const store = { start: vi.fn().mockResolvedValue(startResult) };
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [
      provideTranslocoScope('chats'),
      { provide: ChatStore, useValue: store },
    ],
  });
  const navigate = vi
    .spyOn(TestBed.inject(Router), 'navigate')
    .mockResolvedValue(true);
  const fixture = TestBed.createComponent(NewChat);
  fixture.componentRef.setInput('projectId', 'p');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const area = el.querySelector('textarea') as HTMLTextAreaElement;
  area.value = 'hola';
  area.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await fixture.whenStable();
  fixture.detectChanges();
  return { el, store, navigate };
}

describe('NewChat', () => {
  it('shows the empty state in Spanish', async () => {
    const { el } = await setup({ id: 's1' });
    expect(el.querySelector('h1')?.textContent).toBe('Nuevo chat');
  });

  it('submit starts the chat and navigates to the session', async () => {
    const { store, navigate } = await setup({ id: 's1' });
    expect(store.start).toHaveBeenCalledWith('p', 'hola');
    expect(navigate).toHaveBeenCalledWith(['/proyectos', 'p', 'chats', 's1']);
  });

  it('shows the error and stays', async () => {
    const { el, navigate } = await setup({ code: 'chat.authRequired' });
    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Inicia sesión en el proveedor para continuar.',
    );
  });
});
