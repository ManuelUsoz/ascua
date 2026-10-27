import { describe, expect, it } from 'vitest';
import type { Methodology } from './harness';
import {
  composeSystemAppend,
  METHODOLOGY_END,
  METHODOLOGY_START,
  SessionTrace,
} from './methodology';

const m: Methodology = {
  id: 'm',
  title: 'Method',
  rules: ' Locate first. ',
  tools: [{ tool: 'search', when: 'before editing' }],
};

describe('composeSystemAppend', () => {
  it('wraps rules and tools in markers', () => {
    const out = composeSystemAppend(m);
    expect(out.startsWith(METHODOLOGY_START)).toBe(true);
    expect(out.endsWith(METHODOLOGY_END)).toBe(true);
    expect(out).toContain('Locate first.');
    expect(out).toContain('- search: before editing');
  });

  it('appends the mode text after the block and omits empty tools', () => {
    const out = composeSystemAppend({ ...m, tools: [] }, 'Mode.');
    expect(out).not.toContain('Tool usage');
    expect(out.endsWith(`${METHODOLOGY_END}\n\nMode.`)).toBe(true);
  });
});

describe('SessionTrace', () => {
  it('matches by substring or regex', () => {
    const t = new SessionTrace();
    expect(t.used('Read')).toBe(false);
    t.record('mcp__ascua__search');
    expect(t.used('search')).toBe(true);
    expect(t.used(/^Read$/)).toBe(false);
    t.record('Read');
    expect(t.used(/^Read$/)).toBe(true);
  });
});
