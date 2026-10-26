import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Swatch } from './swatch';

describe('Swatch', () => {
  it('sets the colour var and pulse class', () => {
    const fixture = TestBed.createComponent(Swatch);
    fixture.componentRef.setInput('color', '#ff0000');
    fixture.componentRef.setInput('pulse', true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.style.getPropertyValue('--swatch')).toBe('#ff0000');
    expect(el.classList.contains('as-swatch--pulse')).toBe(true);
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });
});
