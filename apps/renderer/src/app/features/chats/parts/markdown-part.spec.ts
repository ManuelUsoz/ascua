import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ASCUA_API } from '../../../core/bridge/ascua-api';
import { MarkdownPart } from './markdown-part';

function render(text: string, openLink = vi.fn()) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ASCUA_API, useValue: { openLink } }],
  });
  const fixture = TestBed.createComponent(MarkdownPart);
  fixture.componentRef.setInput('text', text);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('MarkdownPart', () => {
  it('renders a fence as pre code without backticks', () => {
    const el = render('```ts\nconst a = 1;\n```');
    expect(el.querySelector('pre code')?.textContent).toBe('const a = 1;');
    expect(el.textContent).not.toContain('`');
  });

  it('keeps raw html literal', () => {
    const el = render('<b>hola</b>');
    expect(el.textContent).toContain('<b>hola</b>');
    expect(el.querySelector('b')).toBeNull();
  });

  it('opens links through the bridge without navigating', () => {
    const openLink = vi.fn();
    const el = render('ver [docs](https://example.com)', openLink);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.querySelector('a')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(openLink).toHaveBeenCalledWith('https://example.com');
  });
});
