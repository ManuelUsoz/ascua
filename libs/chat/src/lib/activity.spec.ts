import { describe, expect, it } from 'vitest';
import { agentColor, groupParts, type ToolGroup } from './activity';
import type { MessagePart, ToolUsePart } from './model';

function use(id: string, extra: Partial<ToolUsePart> = {}): ToolUsePart {
  return {
    kind: 'toolUse',
    toolUseId: id,
    tool: 'read',
    title: 'Read: a.ts',
    status: 'done',
    ...extra,
  };
}

describe('groupParts', () => {
  it('splits groups on text', () => {
    const parts: MessagePart[] = [
      use('1'),
      { kind: 'toolResult', toolUseId: '1', isError: false },
      { kind: 'text', text: 'hi' },
      use('2'),
    ];
    const out = groupParts(parts);
    expect(out.map((s) => s.kind)).toEqual(['toolGroup', 'text', 'toolGroup']);
  });

  it('nests subagent calls and counts tools', () => {
    const parts: MessagePart[] = [
      use('a', { title: 'Task', agent: 'scout', tool: 'other' }),
      use('b', { parentToolUseId: 'a', startedAt: 1000, endedAt: 2000 }),
      use('c', { title: 'Bash: ls', startedAt: 500, endedAt: 4000 }),
      use('d', { title: 'Read: b.ts' }),
    ];
    const g = groupParts(parts)[0] as ToolGroup;
    expect(g.subagents).toHaveLength(1);
    expect(g.subagents[0].calls.map((c) => c.toolUseId)).toEqual(['b']);
    expect(g.calls.map((c) => c.toolUseId)).toEqual(['c', 'd']);
    expect(g.counts).toEqual([
      { tool: 'Read', count: 2 },
      { tool: 'Bash', count: 1 },
    ]);
    expect(g.durationMs).toBe(3500);
  });

  it('tolerates old parts without new fields', () => {
    const g = groupParts([use('1')])[0] as ToolGroup;
    expect(g.durationMs).toBeUndefined();
    expect(g.subagents).toEqual([]);
    expect(g.results).toEqual({});
  });

  it('attaches results, including for nested calls', () => {
    const parts: MessagePart[] = [
      use('a', { agent: 'scout', tool: 'other' }),
      use('b', { parentToolUseId: 'a', status: 'failed' }),
      { kind: 'toolResult', toolUseId: 'b', isError: true, summary: 'nope' },
      use('c'),
    ];
    const g = groupParts(parts)[0] as ToolGroup;
    expect(g.results['b']?.summary).toBe('nope');
    expect(g.results['c']).toBeUndefined();
  });
});

describe('agentColor', () => {
  it('uses fixed colours and is stable', () => {
    expect(agentColor('scout')).toBe('#7ab8ff');
    expect(agentColor('implementer')).toBe('#ff9d5c');
    expect(agentColor('other')).toBe(agentColor('other'));
  });
});
