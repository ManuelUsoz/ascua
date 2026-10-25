import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { i18nTesting } from '../../testing/i18n';
import { ContextMenu, type ContextMenuItem } from './context-menu';

const run = vi.fn();

@Component({
  imports: [ContextMenu],
  template: `<app-context-menu [items]="items" ariaLabel="Menu" />`,
})
class Host {
  readonly menu = viewChild.required(ContextMenu);
  items: ContextMenuItem[] = [
    { icon: 'trash', label: 'common.delete', tone: 'danger', run },
  ];
}

async function setup() {
  TestBed.configureTestingModule({ imports: [Host, i18nTesting('es')] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  fixture.componentInstance.menu().openAt(10, 10);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('ContextMenu', () => {
  it('renders icon and Spanish label with danger class', async () => {
    const f = await setup();
    const el: HTMLElement = f.nativeElement;
    const item = el.querySelector('[role="menuitem"]');
    expect(item?.textContent).toContain('Eliminar');
    expect(item?.querySelector('app-icon')).toBeTruthy();
    expect(item?.classList).toContain('as-menu__option--danger');
  });

  it('runs the callback and closes', async () => {
    const f = await setup();
    const el: HTMLElement = f.nativeElement;
    el.querySelector<HTMLElement>('[role="menuitem"]')?.click();
    f.detectChanges();
    expect(run).toHaveBeenCalled();
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });

  it('closes on Escape', async () => {
    const f = await setup();
    const el: HTMLElement = f.nativeElement;
    el.querySelector('[role="menuitem"]')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    f.detectChanges();
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });

  it('closes on outside pointerdown', async () => {
    const f = await setup();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    f.detectChanges();
    expect(
      (f.nativeElement as HTMLElement).querySelector('[role="menu"]'),
    ).toBeNull();
  });
});
