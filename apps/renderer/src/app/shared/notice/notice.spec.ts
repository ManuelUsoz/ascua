import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { i18nTesting } from '../../testing/i18n';
import { Notice, NoticeType } from './notice';

@Component({
  imports: [Notice],
  template: `
    <app-notice [type]="type">
      Cuerpo
      <button noticeActions>Ok</button>
    </app-notice>
  `,
})
class Host {
  type: NoticeType = 'error';
}

function render(type: NoticeType) {
  TestBed.configureTestingModule({ imports: [Host, i18nTesting()] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.type = type;
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).querySelector(
    'app-notice',
  ) as HTMLElement;
}

describe('Notice', () => {
  it.each([
    ['error', 'alert', 'Error', 'alert'],
    ['warning', 'warn', 'Advertencia', 'alert'],
    ['info', 'ask', 'Información', 'status'],
  ] as const)('%s', async (type, tone, title, role) => {
    const el = render(type);
    await Promise.resolve();
    expect(el.getAttribute('data-tone')).toBe(tone);
    expect(el.getAttribute('role')).toBe(role);
    expect(el.querySelector('.as-notice__title')?.textContent).toContain(title);
  });

  it('projects body and actions', () => {
    const el = render('error');
    expect(el.querySelector('.as-notice__body')?.textContent).toContain(
      'Cuerpo',
    );
    expect(el.querySelector('.as-notice__actions button')).not.toBeNull();
  });
});
