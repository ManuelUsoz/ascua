import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
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
