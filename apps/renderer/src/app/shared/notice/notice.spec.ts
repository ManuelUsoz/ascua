import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { Text } from '../../core/i18n/text';
import { i18nTesting } from '../../testing/i18n';
import { Notice, NoticeType } from './notice';

@Component({
  imports: [Notice],
  template: `
    <app-notice
      [type]="type"
      [title]="title"
      [dismissible]="dismissible"
      (dismissed)="count = count + 1"
    >
      Cuerpo
      <button noticeActions>Ok</button>
    </app-notice>
  `,
})
class Host {
  type: NoticeType = 'error';
  title: Text = { key: 'notice.error' };
  dismissible = false;
  count = 0;
}

function render(type: NoticeType, title: Text = { key: `notice.${type}` }) {
  TestBed.configureTestingModule({ imports: [Host, i18nTesting()] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.type = type;
  fixture.componentInstance.title = title;
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

  it('renders the configured title over the type default', () => {
    const el = render('info', { key: 'repositories.link.title.none' });
    expect(el.querySelector('.as-notice__title')?.textContent).toContain(
      'Tienes una copia local de este repo',
    );
  });

  it('shows a close button only when dismissible and emits dismissed', () => {
    const plain = render('info');
    expect(plain.querySelector('.as-notice__close')).toBeNull();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host, i18nTesting()] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.dismissible = true;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const close = el.querySelector('.as-notice__close') as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe('Descartar');
    close.click();
    expect(fixture.componentInstance.count).toBe(1);
  });

  it('projects body and actions', () => {
    const el = render('error');
    expect(el.querySelector('.as-notice__body')?.textContent).toContain(
      'Cuerpo',
    );
    expect(el.querySelector('.as-notice__actions button')).not.toBeNull();
  });
});
