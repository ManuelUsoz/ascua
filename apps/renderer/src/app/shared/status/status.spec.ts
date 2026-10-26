import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { i18nTesting } from '../../testing/i18n';
import { Status, StatusState } from './status';

function render(state: StatusState, label?: { key: string }) {
  TestBed.configureTestingModule({ imports: [Status, i18nTesting()] });
  const fixture = TestBed.createComponent(Status);
  fixture.componentRef.setInput('state', state);
  if (label) fixture.componentRef.setInput('label', label);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).querySelector(
    '.as-state',
  ) as HTMLElement;
}

describe('Status', () => {
  it.each([
    ['working', 'live', 'Trabajando'],
    ['running', 'ok', 'Corriendo'],
    ['waiting', 'ask', 'Espera tu respuesta'],
    ['stuck', 'warn', 'Trabado'],
    ['crashed', 'alert', 'Se cayó'],
    ['stopped', 'idle', 'Detenido'],
  ] as const)('%s', (state, tone, word) => {
    const el = render(state);
    expect(el.getAttribute('data-tone')).toBe(tone);
    expect(el.textContent).toContain(word);
  });

  it('lets label override the word', () => {
    const el = render('crashed', { key: 'state.failedCode' });
    expect(el.textContent).toContain('Falló');
    expect(el.textContent).not.toContain('Se cayó');
  });
});
