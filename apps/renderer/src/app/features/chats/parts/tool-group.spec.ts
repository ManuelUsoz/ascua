import { TestBed } from '@angular/core/testing';
import { groupParts, type ToolUsePart } from '@ascua/chat';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it } from 'vitest';
import { i18nTesting } from '../../../testing/i18n';
import { ToolGroupView } from './tool-group';

const use = (over: Partial<ToolUsePart>): ToolUsePart => ({
  kind: 'toolUse',
  toolUseId: 't',
  tool: 'read',
  title: 'Read: a.ts',
  status: 'done',
  ...over,
});

function render(parts: ToolUsePart[]) {
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [provideTranslocoScope('chats')],
  });
  const group = groupParts(parts)[0];
  const fixture = TestBed.createComponent(ToolGroupView);
  fixture.componentRef.setInput('group', group);
  fixture.detectChanges();
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, fixture };
}

const button = (el: HTMLElement) =>
  el.querySelector('button') as HTMLButtonElement;

describe('ToolGroupView', () => {
  it('summarises counts and starts collapsed when done', () => {
    const { el } = render([
      use({ toolUseId: '1' }),
      use({ toolUseId: '2' }),
      use({ toolUseId: '3', title: 'Edit: b.ts', tool: 'edit' }),
    ]);
    expect(el.querySelector('.chat-tg__summary')?.textContent).toContain(
      'Read ×2 · Edit ×1',
    );
    expect(button(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('is open while a call runs and shows nested subagent rows', () => {
    const { el } = render([
      use({ toolUseId: 'a', tool: 'other', title: 'Task: x', agent: 'scout' }),
      use({
        toolUseId: 'c',
        title: 'Grep: foo',
        status: 'running',
        parentToolUseId: 'a',
      }),
    ]);
    expect(button(el).getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.chat-tg__agentname')?.textContent).toBe('scout');
    expect(el.querySelectorAll('.chat-tg__row--nested').length).toBe(1);
  });

  it('opens a failed group and shows the error text', () => {
    TestBed.configureTestingModule({
      imports: [i18nTesting('es')],
      providers: [provideTranslocoScope('chats')],
    });
    const group = groupParts([
      use({ toolUseId: 'f', status: 'failed', title: 'Bash: ls' }),
      {
        kind: 'toolResult',
        toolUseId: 'f',
        isError: true,
        summary: 'boom: no such file',
      },
    ])[0];
    const fixture = TestBed.createComponent(ToolGroupView);
    fixture.componentRef.setInput('group', group);
    fixture.detectChanges();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(button(el).getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.chat-tg__error')?.textContent).toContain(
      'boom: no such file',
    );
  });

  it('shortens MCP tool names and keeps the full name in title', () => {
    const { el, fixture } = render([
      use({
        toolUseId: 'm',
        tool: 'mcp__ascua-indexer__search_symbols',
        title: 'mcp__ascua-indexer__search_symbols: Metrics',
      }),
    ]);
    button(el).click();
    fixture.detectChanges();
    const tool = el.querySelector('.chat-tg__tool') as HTMLElement;
    expect(tool.textContent).toBe('search_symbols');
    expect(tool.getAttribute('title')).toBe(
      'mcp__ascua-indexer__search_symbols',
    );
    expect(el.querySelector('.chat-tg__summary')?.textContent).toContain(
      'search_symbols ×1',
    );
  });

  it('shows a result only after clicking its row', () => {
    const { el, fixture } = render([
      use({ toolUseId: 'r' }),
      {
        kind: 'toolResult',
        toolUseId: 'r',
        isError: false,
        summary: 'found 3',
      },
      use({ toolUseId: 'n', title: 'Edit: b.ts', tool: 'edit' }),
    ]);
    button(el).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.chat-tg__row--btn').length).toBe(1);
    expect(el.querySelector('.chat-tg__result')).toBeNull();
    (el.querySelector('.chat-tg__row--btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.chat-tg__result')?.textContent).toContain(
      'found 3',
    );
  });

  it('lets the user toggle', () => {
    const { el, fixture } = render([use({ toolUseId: '1' })]);
    button(el).click();
    fixture.detectChanges();
    expect(button(el).getAttribute('aria-expanded')).toBe('true');
  });
});
