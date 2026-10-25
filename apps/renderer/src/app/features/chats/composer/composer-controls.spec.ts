import { TestBed } from '@angular/core/testing';
import type { ModelCatalog } from '@ascua/chat';
import type { ChatSessionPatch } from '@ascua/ipc';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { i18nTesting } from '../../../testing/i18n';
import { ComposerControls } from './composer-controls';

const CATALOG: ModelCatalog = {
  provider: 'claude',
  source: 'static',
  models: [
    { id: 'opus', label: 'Opus', efforts: ['low', 'high'] },
    { id: 'haiku', efforts: [] },
  ],
};

function setup(inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [provideTranslocoScope('chats')],
  });
  const fixture = TestBed.createComponent(ComposerControls);
  fixture.componentRef.setInput('catalog', CATALOG);
  for (const [k, v] of Object.entries(inputs)) {
    fixture.componentRef.setInput(k, v);
  }
  const changed = vi.fn<(patch: ChatSessionPatch) => void>();
  fixture.componentInstance.changed.subscribe(changed);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const selects = () =>
    Array.from(el.querySelectorAll<HTMLSelectElement>('select'));
  const pick = (select: HTMLSelectElement, value: string) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };
  return { fixture, selects, pick, changed };
}

const texts = (s: HTMLSelectElement) =>
  Array.from(s.options).map((o) => o.textContent?.trim());

describe('ComposerControls', () => {
  it('lists the models with the provider default and Spanish labels', () => {
    const { selects } = setup();
    expect(texts(selects()[0]!)).toEqual([
      'Predeterminado del proveedor',
      'Opus',
      'haiku',
    ]);
    expect(texts(selects()[1]!)).toEqual([
      'Supervisado',
      'Aceptar ediciones',
      'Automático',
      'Acceso total',
    ]);
  });

  it('hides the effort selector when the model has none', () => {
    const { selects } = setup({ model: 'haiku' });
    expect(selects()).toHaveLength(2);
  });

  it('efforts follow the selected model', () => {
    const { selects } = setup({ model: 'opus' });
    expect(selects()).toHaveLength(3);
    expect(texts(selects()[1]!)).toEqual([
      'Esfuerzo predeterminado',
      'Bajo',
      'Alto',
    ]);
  });

  it('emits patches and clears an unsupported effort on model change', () => {
    const { selects, pick, changed } = setup({
      model: 'opus',
      effort: 'high',
    });
    pick(selects()[1]!, 'low');
    expect(changed).toHaveBeenLastCalledWith({ effort: 'low' });
    pick(selects()[0]!, 'haiku');
    expect(changed).toHaveBeenLastCalledWith({ model: 'haiku', effort: null });
    pick(selects()[0]!, '');
    expect(changed).toHaveBeenLastCalledWith({ model: null, effort: null });
    pick(selects()[selects().length - 1]!, 'supervised');
    expect(changed).toHaveBeenLastCalledWith({ permissionMode: 'supervised' });
  });

  it('disables model and effort while running', () => {
    const { selects } = setup({ model: 'opus', running: true });
    const all = selects();
    expect(all[0]!.disabled).toBe(true);
    expect(all[1]!.disabled).toBe(true);
    expect(all[2]!.disabled).toBe(false);
  });
});
