import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { i18nTesting } from '../../testing/i18n';
import { CollapsibleCard } from './collapsible-card';

@Component({
  imports: [CollapsibleCard],
  template: `
    <app-collapsible-card [(expanded)]="open">
      <span summary>Resumen</span>
      <span meta>3 s</span>
      Cuerpo
    </app-collapsible-card>
  `,
})
class Host {
  readonly open = signal(false);
}

describe('CollapsibleCard', () => {
  it('toggles aria-expanded and the model', async () => {
    TestBed.configureTestingModule({ imports: [Host, i18nTesting('es')] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(
      el.querySelector('.as-collapsible__body')?.hasAttribute('inert'),
    ).toBe(true);
    expect(el.textContent).toContain('Resumen');

    btn.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.open()).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(
      el.querySelector('.as-collapsible__body')?.hasAttribute('inert'),
    ).toBe(false);
  });
});
