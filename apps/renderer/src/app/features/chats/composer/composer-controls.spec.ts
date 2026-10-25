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
  const permissionTrigger = () =>
    el.querySelector<HTMLButtonElement>('.chat-composer__perm button')!;
  const menuOptions = () =>
    Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'));
  return { fixture, selects, pick, changed, permissionTrigger, menuOptions };
}

const texts = (s: HTMLSelectElement) =>
  Array.from(s.options).map((o) => o.textContent?.trim());

describe('ComposerControls', () => {
  it('lists the models with the provider default and Spanish labels', () => {
    const { fixture, selects, permissionTrigger, menuOptions } = setup();
    expect(texts(selects()[0]!)).toEqual([
      'Predeterminado del proveedor',
      'Opus',
      'haiku',
    ]);
    permissionTrigger().click();
    fixture.detectChanges();
    expect(
      menuOptions().map((o) =>
        o.querySelector('.as-menu__label')?.textContent?.trim(),
      ),
    ).toEqual([
      'Supervisado',
      'Aceptar ediciones',
      'Automático',
      'Acceso total',
    ]);
    expect(menuOptions()[3]!.textContent).toContain(
      'Permite comandos y ediciones sin preguntar.',
    );
  });

  it('disables the effort selector when the model has none', () => {
    const { selects } = setup({ model: 'haiku' });
    expect(selects()).toHaveLength(2);
    expect(selects()[1]!.disabled).toBe(true);
    expect(texts(selects()[1]!)).toEqual(['Esfuerzo predeterminado']);
  });

  it('disables the effort selector when the catalog is not loaded', () => {
    const { selects } = setup({ catalog: undefined });
    expect(selects()).toHaveLength(2);
    expect(selects()[1]!.disabled).toBe(true);
    expect(texts(selects()[1]!)).toEqual(['Esfuerzo predeterminado']);
  });

  it('efforts follow the selected model', () => {
    const { selects } = setup({ model: 'opus' });
    expect(selects()).toHaveLength(2);
    expect(texts(selects()[1]!)).toEqual([
      'Esfuerzo predeterminado',
      'Bajo',
      'Alto',
    ]);
  });

  it('emits patches and clears an unsupported effort on model change', () => {
    const { fixture, selects, pick, changed, permissionTrigger, menuOptions } =
      setup({
        model: 'opus',
        effort: 'high',
      });
    pick(selects()[1]!, 'low');
    expect(changed).toHaveBeenLastCalledWith({ effort: 'low' });
    pick(selects()[0]!, 'haiku');
    expect(changed).toHaveBeenLastCalledWith({ model: 'haiku', effort: null });
    pick(selects()[0]!, '');
    expect(changed).toHaveBeenLastCalledWith({ model: null, effort: null });
    permissionTrigger().click();
    fixture.detectChanges();
    menuOptions()
      .find((o) => o.textContent?.includes('Supervisado'))!
      .click();
    expect(changed).toHaveBeenLastCalledWith({ permissionMode: 'supervised' });
  });

  it('disables model and effort while running', () => {
    const { selects, permissionTrigger } = setup({
      model: 'opus',
      running: true,
    });
    const all = selects();
    expect(all).toHaveLength(2);
    expect(all[0]!.disabled).toBe(true);
    expect(all[1]!.disabled).toBe(true);
    expect(permissionTrigger().disabled).toBe(false);
  });

  it('shows the spinner only while loading, selects stay enabled', () => {
    const idle = setup();
    expect(idle.fixture.nativeElement.querySelector('app-spinner')).toBeNull();
    TestBed.resetTestingModule();
    const busy = setup({ loading: true });
    const spinner = busy.fixture.nativeElement.querySelector('app-spinner');
    expect(spinner?.getAttribute('aria-label')).toBeTruthy();
    expect(busy.selects()[0]!.disabled).toBe(false);
  });
});
