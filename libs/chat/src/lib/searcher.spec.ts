import { describe, expect, it } from 'vitest';
import { searcherAgent } from './searcher';

describe('searcherAgent', () => {
  it('is read-only and limited to the indexer server', () => {
    const a = searcherAgent();
    expect(a.role).toBe('searcher');
    expect(a.tools).toEqual([]);
    expect(a.mcpServers).toEqual(['ascua-indexer']);
  });

  it('accepts a custom server name', () => {
    expect(searcherAgent('x').mcpServers).toEqual(['x']);
  });
});
