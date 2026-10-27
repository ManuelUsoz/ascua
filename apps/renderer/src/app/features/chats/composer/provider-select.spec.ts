import { TestBed } from '@angular/core/testing';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { i18nTesting } from '../../../testing/i18n';
import { ProviderSelect } from './provider-select';

function setup(selected?: 'claude' | 'codex' | 'opencode') {
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [provideTranslocoScope('chats')],
  });
  const fixture = TestBed.createComponent(ProviderSelect);
  if (selected) fixture.componentRef.setInput('selected', selected);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const trigger = el.querySelector<HTMLButtonElement>('button')!;
  const options = () =>
    Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'));
  const open = () => {
    trigger.click();
    fixture.detectChanges();
  };
  const key = (k: string) => {
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true }),
    );
    fixture.detectChanges();
  };
  return { fixture, el, trigger, options, open, key };
}

const names = (options: HTMLElement[]) =>
  options.map((o) => o.querySelector('.as-menu__label')?.textContent?.trim());

describe('ProviderSelect', () => {
  it('starts on Claude with its brand mark', () => {
    const { el, trigger } = setup();
    expect(trigger.textContent?.trim()).toBe('Claude');
    expect(trigger.getAttribute('aria-label')).toBe('Proveedor');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.querySelector('svg.provider-ico--claude')).not.toBeNull();
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  it('lists every provider and marks Codex as disabled', () => {
    const { open, options, trigger } = setup();
    open();
    expect(names(options())).toEqual(['Claude', 'Codex', 'OpenCode']);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const codex = options()[1]!;
    expect(codex.getAttribute('aria-disabled')).toBe('true');
    expect(codex.classList.contains('as-menu__option--disabled')).toBe(true);
    expect(codex.textContent).toContain('Próximamente');
    expect(options()[2]!.textContent).toContain('OpenCode');
  });

  it('picking OpenCode updates the trigger and emits the value', () => {
    const { fixture, el, trigger, options, open } = setup();
    const picked = vi.fn();
    fixture.componentInstance.picked.subscribe(picked);
    open();
    options()[2]!.click();
    fixture.detectChanges();
    expect(picked).toHaveBeenCalledWith('opencode');
    expect(trigger.textContent?.trim()).toBe('OpenCode');
    expect(trigger.querySelector('svg.provider-ico--claude')).toBeNull();
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  it('a disabled provider cannot be picked', () => {
    const { fixture, el, trigger, options, open } = setup();
    const picked = vi.fn();
    fixture.componentInstance.picked.subscribe(picked);
    open();
    options()[1]!.click();
    fixture.detectChanges();
    expect(picked).not.toHaveBeenCalled();
    expect(trigger.textContent?.trim()).toBe('Claude');
    expect(el.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('keyboard navigation skips disabled providers', () => {
    const { fixture, trigger, key } = setup();
    const picked = vi.fn();
    fixture.componentInstance.picked.subscribe(picked);
    key('ArrowDown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    key('ArrowDown');
    key('Enter');
    expect(picked).toHaveBeenCalledWith('opencode');
    expect(trigger.textContent?.trim()).toBe('OpenCode');
  });

  it('an outside pointerdown closes the menu', () => {
    const { fixture, el, open } = setup();
    open();
    expect(el.querySelector('[role="listbox"]')).not.toBeNull();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });
});
