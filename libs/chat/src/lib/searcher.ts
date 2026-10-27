import type { AgentDefinition } from './harness';

export function searcherAgent(server = 'ascua-indexer'): AgentDefinition {
  return {
    role: 'searcher',
    // i18n-ignore: model instructions
    description:
      'Read-only code search. Use it to locate symbols, definitions and usages in the codebase.',
    // i18n-ignore: model instructions
    instructions:
      'Search the codebase using the indexer tools only. Answer with path:line references and one-line notes. Never edit files.',
    tools: [],
    mcpServers: [server],
  };
}
