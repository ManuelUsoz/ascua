import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { i18nTesting } from '../../testing/i18n';
import { AsSelect } from './select';

function setup() {
  const fixture = TestBed.createComponent(AsSelect);
  fixture.componentRef.setInput('options', ['main', 'dev']);
  fixture.componentRef.setInput('ariaLabel', 'Label');
  fixture.detectChanges();
  const select = (fixture.nativeElement as HTMLElement).querySelector(
    'select',
  ) as HTMLSelectElement;
  return { fixture, select, cva: fixture.componentInstance };
}

describe('AsSelect', () => {
  it('writeValue selects the option', () => {
    const { fixture, select, cva } = setup();
    cva.writeValue('dev');
    fixture.detectChanges();
    expect(select.value).toBe('dev');
    expect(select.getAttribute('aria-label')).toBe('Label');
  });

  it('a user change calls onChange', () => {
    const { select, cva } = setup();
    const fn = vi.fn();
    cva.registerOnChange(fn);
    select.value = 'dev';
    select.dispatchEvent(new Event('change'));
    expect(fn).toHaveBeenCalledWith('dev');
  });

  it('disabled state disables the select', () => {
    const { fixture, select, cva } = setup();
    cva.setDisabledState(true);
    fixture.detectChanges();
    expect(select.disabled).toBe(true);
  });
});

describe('AsSelect rich', () => {
  function rich() {
    TestBed.configureTestingModule({ imports: [i18nTesting('es')] });
    const fixture = TestBed.createComponent(AsSelect);
    fixture.componentRef.setInput('options', [
      { value: 'a', label: 'nav.projects', hint: 'room.close', icon: 'lock' },
      { value: 'b', label: 'nav.files', hint: 'room.minimize', icon: 'edit' },
    ]);
    fixture.componentRef.setInput('selected', 'a');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector('button.as-menu__trigger') as HTMLElement;
    const key = (k: string) => {
      trigger.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true }),
      );
      fixture.detectChanges();
    };
    return { fixture, el, trigger, key };
  }

  it('renders a trigger with the selected label, not a native select', () => {
    const { el, trigger } = rich();
    expect(el.querySelector('select')).toBeNull();
    expect(trigger.textContent).toContain('Proyectos');
  });

  it('ArrowDown opens, moves and Enter picks', () => {
    const { fixture, el, key } = rich();
    const spy = vi.fn();
    fixture.componentInstance.picked.subscribe(spy);
    key('ArrowDown');
    expect(el.querySelectorAll('[role="option"]').length).toBe(2);
    expect(el.textContent).toContain('Minimizar');
    key('ArrowDown');
    key('Enter');
    expect(spy).toHaveBeenCalledWith('b');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  it('Escape closes and does not propagate', () => {
    const { fixture, el, key } = rich();
    const seen = vi.fn();
    document.body.addEventListener('keydown', seen);
    document.body.appendChild(el);
    key('Enter');
    key('Escape');
    document.body.removeEventListener('keydown', seen);
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    expect(seen).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: 'Escape' }),
    );
    fixture.destroy();
  });

  it('outside pointerdown closes', () => {
    const { fixture, el, key } = rich();
    key('Enter');
    expect(el.querySelector('[role="listbox"]')).not.toBeNull();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  it('never opens while disabled', () => {
    const { fixture, el, key } = rich();
    fixture.componentRef.setInput('isDisabled', true);
    fixture.detectChanges();
    key('Enter');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });
});
