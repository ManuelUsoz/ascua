import { TestBed } from '@angular/core/testing';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { i18nTesting } from '../../../testing/i18n';
import { ChatComposer } from './chat-composer';

function setup(inputs: { disabled?: boolean; running?: boolean } = {}) {
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [provideTranslocoScope('chats')],
  });
  const fixture = TestBed.createComponent(ChatComposer);
  fixture.componentRef.setInput('disabled', inputs.disabled ?? false);
  fixture.componentRef.setInput('running', inputs.running ?? false);
  const submitted = vi.fn();
  const aborted = vi.fn();
  fixture.componentInstance.submitted.subscribe(submitted);
  fixture.componentInstance.aborted.subscribe(aborted);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const area = el.querySelector('textarea') as HTMLTextAreaElement;
  const type = (value: string) => {
    area.value = value;
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const key = (k: string, shiftKey = false) => {
    const event = new KeyboardEvent('keydown', {
      key: k,
      shiftKey,
      cancelable: true,
      bubbles: true,
    });
    area.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };
  return { el, area, type, key, submitted, aborted };
}

describe('ChatComposer', () => {
  it('Enter sends the trimmed text and clears the box', () => {
    const { area, type, key, submitted } = setup();
    type('  hola  ');
    expect(key('Enter').defaultPrevented).toBe(true);
    expect(submitted).toHaveBeenCalledWith('hola');
    expect(area.value).toBe('');
  });

  it('Shift+Enter adds a line instead of sending', () => {
    const { type, key, submitted } = setup();
    type('hola');
    expect(key('Enter', true).defaultPrevented).toBe(false);
    expect(submitted).not.toHaveBeenCalled();
  });

  it('does not send an empty message', () => {
    const { key, submitted } = setup();
    key('Enter');
    expect(submitted).not.toHaveBeenCalled();
  });

  it('is disabled while running and offers Detener', () => {
    const { el, type, key, submitted, aborted } = setup({ running: true });
    type('hola');
    key('Enter');
    expect(submitted).not.toHaveBeenCalled();
    const buttons = Array.from(el.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Detener']);
    buttons[0].click();
    expect(aborted).toHaveBeenCalledTimes(1);
  });

  it('renders no button while idle', () => {
    const { el } = setup();
    expect(el.querySelectorAll('button').length).toBe(0);
  });

  it('Escape stops at the host and aborts only while running', () => {
    const idle = setup();
    const leaked = vi.fn();
    document.body.appendChild(idle.el);
    document.body.addEventListener('keydown', leaked);
    idle.key('Escape');
    document.body.removeEventListener('keydown', leaked);
    expect(leaked).not.toHaveBeenCalled();
    expect(idle.aborted).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const busy = setup({ running: true });
    busy.key('Escape');
    expect(busy.aborted).toHaveBeenCalledTimes(1);
  });
});
