import { describe, expect, it } from 'vitest';
import { SessionTrace, type GateEvent } from '@ascua/chat';
import { locateBeforeEdit, verifyBeforeStop } from './gates';

function ev(toolName: string, ...before: string[]): GateEvent {
  const trace = new SessionTrace();
  before.forEach((n) => trace.record(n));
  return { toolName, input: {}, trace };
}

describe('locateBeforeEdit', () => {
  it('denies Edit with no prior search or read', () => {
    const v = locateBeforeEdit(ev('Edit'));
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toContain('Edit');
  });

  it('allows Edit after a Read', () => {
    expect(locateBeforeEdit(ev('Edit', 'Read')).allow).toBe(true);
  });

  it('allows Edit after an index search tool', () => {
    expect(
      locateBeforeEdit(ev('Write', 'mcp__ascua-indexer__search_symbols')).allow,
    ).toBe(true);
  });

  it('does not accept an unrelated mcp search tool', () => {
    expect(locateBeforeEdit(ev('Edit', 'mcp__other__search')).allow).toBe(
      false,
    );
  });

  it('ignores non-edit tools', () => {
    expect(locateBeforeEdit(ev('Bash')).allow).toBe(true);
  });
});

describe('verifyBeforeStop', () => {
  it('allows when nothing was edited', () => {
    expect(verifyBeforeStop(ev('', 'Read')).allow).toBe(true);
  });

  it('blocks when edited without a later Bash', () => {
    expect(verifyBeforeStop(ev('', 'Edit')).allow).toBe(false);
    expect(verifyBeforeStop(ev('', 'Bash', 'Edit')).allow).toBe(false);
  });

  it('allows when Bash ran after the edit', () => {
    expect(verifyBeforeStop(ev('', 'Edit', 'Bash')).allow).toBe(true);
  });
});
