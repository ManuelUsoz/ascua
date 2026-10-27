import { describe, expect, it } from 'vitest';
import { searcherAgent } from '@ascua/chat';
import { toSdkAgents } from './claude-agents';

const NAMES = {
  read: ['Read'],
  edit: ['Edit'],
  execute: ['Bash'],
  search: ['Grep'],
  fetch: ['WebFetch'],
  other: [],
};
const spec = { name: 'ascua-indexer', command: 'node', args: [] };

describe('toSdkAgents', () => {
  it('maps the searcher to the indexer server prefix', () => {
    const s = searcherAgent();
    expect(toSdkAgents([s], NAMES, [spec])).toEqual({
      searcher: {
        tools: ['mcp__ascua-indexer'],
        prompt: s.instructions,
        description: s.description,
      },
    });
  });

  it('drops the searcher when the server is missing', () => {
    expect(toSdkAgents([searcherAgent()], NAMES, [])).toEqual({});
  });
});
