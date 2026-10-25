import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { i18nTesting } from '../../testing/i18n';
import { ConfirmModal } from './modal';

const confirmed = vi.fn();
const cancelled = vi.fn();

@Component({
  imports: [ConfirmModal],
  template: `<app-confirm-modal
    [open]="true"
    title="common.delete"
    body="common.confirm"
    confirmLabel="common.delete"
    tone="danger"
    (confirmed)="confirmed()"
    (cancelled)="cancelled()"
  />`,
})
class Host {
  confirmed = confirmed;
  cancelled = cancelled;
}

function setup() {
  TestBed.configureTestingModule({ imports: [Host, i18nTesting('es')] });
  const f = TestBed.createComponent(Host);
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

describe('ConfirmModal', () => {
  it('shows Spanish labels with a danger confirm', () => {
    const el = setup();
    const btns = el.querySelectorAll('button');
    expect(btns[0].textContent).toContain('Cancelar');
    expect(btns[1].textContent).toContain('Eliminar');
    expect(btns[1].classList).toContain('as-btn--danger');
  });

  it('emits confirmed and cancelled', () => {
    const el = setup();
    const btns = el.querySelectorAll('button');
    btns[1].click();
    expect(confirmed).toHaveBeenCalled();
    btns[0].click();
    expect(cancelled).toHaveBeenCalled();
  });

  it('cancels on Escape', () => {
    cancelled.mockClear();
    const el = setup();
    el.querySelector('dialog')?.dispatchEvent(new Event('cancel'));
    expect(cancelled).toHaveBeenCalled();
  });
});
