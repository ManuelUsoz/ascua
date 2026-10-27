import { TestBed } from '@angular/core/testing';
import type { QuestionPart } from '@ascua/chat';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { ChatStore } from '../../../core/chats/chat-store';
import { i18nTesting } from '../../../testing/i18n';
import { QuestionCard, answerOf } from './question-part';

const request: QuestionPart['request'] = {
  requestId: 'q1',
  questions: [
    {
      question: '¿Qué librería?',
      header: 'Librería',
      multiSelect: false,
      options: [
        { label: 'date-fns', description: 'Pequeña' },
        { label: 'luxon' },
      ],
    },
    {
      question: '¿Qué funciones?',
      multiSelect: true,
      options: [{ label: 'A' }, { label: 'B' }],
    },
  ],
};

function setup(part: Partial<QuestionPart> = {}, result: unknown = undefined) {
  const store = { resolveQuestion: vi.fn().mockResolvedValue(result) };
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [
      provideTranslocoScope('chats'),
      { provide: ChatStore, useValue: store },
    ],
  });
  const fixture = TestBed.createComponent(QuestionCard);
  fixture.componentRef.setInput('projectId', 'p');
  fixture.componentRef.setInput('sessionId', 's');
  fixture.componentRef.setInput('part', {
    kind: 'question',
    state: 'pending',
    request,
    ...part,
  } satisfies QuestionPart);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const buttons = () => Array.from(el.querySelectorAll('button'));
  const sets = () => Array.from(el.querySelectorAll('fieldset'));
  const choices = (i: number) =>
    Array.from(
      sets()[i].querySelectorAll<HTMLInputElement>('input.chat-q__input'),
    );
  const other = (i: number) =>
    sets()[i].querySelector<HTMLInputElement>('input.chat-q__other')!;
  const render = () => fixture.detectChanges();
  return { fixture, el, store, buttons, sets, choices, other, render };
}

describe('QuestionCard', () => {
  it('pending shows each question with its hint and options', () => {
    const { el, sets, choices, buttons } = setup();
    expect(sets()).toHaveLength(2);
    const legends = sets().map((s) => s.querySelector('legend')?.textContent);
    expect(legends[0]).toContain('¿Qué librería?');
    expect(legends[0]).toContain('Elegí una');
    expect(legends[1]).toContain('Podés elegir varias');
    expect(choices(0).map((c) => c.type)).toEqual(['radio', 'radio', 'radio']);
    expect(choices(1).map((c) => c.type)).toEqual([
      'checkbox',
      'checkbox',
      'checkbox',
    ]);
    expect(el.textContent).toContain('Pequeña');
    expect(el.textContent).toContain('Otro');
    expect(el.textContent).toContain('El agente espera tu respuesta');
    expect(buttons().map((b) => b.textContent?.trim())).toEqual([
      'Responder',
      'Omitir',
    ]);
    expect(buttons()[0].disabled).toBe(true);
  });

  it('answers with labels joined and free text', async () => {
    const { fixture, store, choices, other, buttons, render } = setup();
    choices(0)[1].click();
    render();
    expect(buttons()[0].disabled).toBe(true);
    choices(1)[1].click();
    choices(1)[0].click();
    const input = other(1);
    input.value = 'C';
    input.dispatchEvent(new Event('input'));
    render();
    expect(choices(0)[1].closest('label')?.dataset['selected']).toBe('true');
    expect(buttons()[0].disabled).toBe(false);
    buttons()[0].click();
    await fixture.whenStable();
    expect(store.resolveQuestion).toHaveBeenLastCalledWith('p', 's', 'q1', {
      '¿Qué librería?': 'luxon',
      '¿Qué funciones?': 'A, B, C',
    });
  });

  it('typing in Otro replaces a single pick', async () => {
    const { fixture, store, choices, other, buttons, render } = setup();
    choices(0)[0].click();
    const input = other(0);
    input.value = 'moment';
    input.dispatchEvent(new Event('input'));
    choices(1)[0].click();
    render();
    expect(choices(0)[2].checked).toBe(true);
    buttons()[0].click();
    await fixture.whenStable();
    expect(store.resolveQuestion).toHaveBeenLastCalledWith('p', 's', 'q1', {
      '¿Qué librería?': 'moment',
      '¿Qué funciones?': 'A',
    });
  });

  it('Omitir skips with null and shows errors', async () => {
    const { fixture, el, store, buttons } = setup(
      {},
      { code: 'chat.notFound' },
    );
    buttons()[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.resolveQuestion).toHaveBeenLastCalledWith(
      'p',
      's',
      'q1',
      null,
    );
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'El chat o la solicitud ya no existe.',
    );
  });

  it('settled shows the answers or Omitida, without controls', () => {
    const answered = setup({
      state: 'answered',
      answers: { '¿Qué librería?': 'luxon', '¿Qué funciones?': 'A, B' },
    });
    expect(answered.buttons()).toHaveLength(0);
    expect(answered.sets()).toHaveLength(0);
    expect(answered.el.textContent).toContain('luxon');
    expect(answered.el.textContent).toContain('A, B');
    TestBed.resetTestingModule();
    const skipped = setup({ state: 'skipped' });
    expect(skipped.buttons()).toHaveLength(0);
    expect(skipped.el.textContent).toContain('Omitida');
  });
});

describe('answerOf', () => {
  it('keeps option order and ignores Otro when unselected', () => {
    const q = request.questions[1];
    expect(answerOf(q, { picked: ['B', 'A'], other: false, text: 'x' })).toBe(
      'A, B',
    );
    expect(answerOf(q, { picked: [], other: true, text: '  ' })).toBe('');
  });
});
