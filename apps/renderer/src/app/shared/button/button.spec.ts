import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Button, ButtonType, ButtonVariant } from './button';

@Component({
  imports: [Button],
  template: `<button
    appButton
    [variant]="variant()"
    [size]="size()"
    [icon]="icon()"
    [block]="block()"
    [type]="type()"
    [disabled]="disabled()"
    (clicked)="clicks = clicks + 1"
  >
    x
  </button>`,
})
class Host {
  readonly variant = signal<ButtonVariant>('quiet');
  readonly size = signal<'s' | 'default'>('default');
  readonly icon = signal(false);
  readonly block = signal(false);
  readonly type = signal<ButtonType>('button');
  readonly disabled = signal(false);
  clicks = 0;
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  return { fixture, host: fixture.componentInstance, el };
}

describe('Button', () => {
  it('defaults to quiet', () => {
    const { el } = render();
    expect(el.classList.contains('as-btn')).toBe(true);
    expect(el.classList.contains('as-btn--quiet')).toBe(true);
    expect(el.classList.contains('as-btn--s')).toBe(false);
    expect(el.getAttribute('type')).toBe('button');
  });

  it.each(['primary', 'quiet', 'ghost', 'danger'] as const)(
    'variant %s',
    (v) => {
      const { fixture, host, el } = render();
      host.variant.set(v);
      fixture.detectChanges();
      expect(el.classList.contains(`as-btn--${v}`)).toBe(true);
      expect(el.classList.contains('as-btn')).toBe(true);
    },
  );

  it('adds size, icon and block modifiers', () => {
    const { fixture, host, el } = render();
    host.size.set('s');
    host.icon.set(true);
    host.block.set(true);
    fixture.detectChanges();
    expect(el.classList.contains('as-btn--s')).toBe(true);
    expect(el.classList.contains('as-btn--icon')).toBe(true);
    expect(el.classList.contains('as-btn--block')).toBe(true);
  });

  it('binds type', () => {
    const { fixture, host, el } = render();
    host.type.set('submit');
    fixture.detectChanges();
    expect(el.getAttribute('type')).toBe('submit');
  });

  it('emits clicked once per click', () => {
    const { host, el } = render();
    el.click();
    expect(host.clicks).toBe(1);
  });

  it('does not emit when disabled', () => {
    const { fixture, host, el } = render();
    host.disabled.set(true);
    fixture.detectChanges();
    el.click();
    expect(host.clicks).toBe(0);
  });
});
