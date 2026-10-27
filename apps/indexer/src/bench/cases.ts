import type { BenchmarkCase } from '@ascua/ipc';

const IDX_SVC = 'apps/desktop/src/app/indexer/indexer-service.ts';
const IDX_MCP = 'apps/desktop/src/app/indexer/indexer-mcp.ts';
const QUERY = 'apps/indexer/src/query/query-service.ts';
const SERVER = 'apps/indexer/src/mcp/server.ts';
const TRANSCRIPT = 'libs/assistant/src/lib/transcript.ts';

const c = (
  id: string,
  question: string,
  tool: string,
  args: Record<string, unknown>,
  expectFiles: string[],
  expectSymbols: string[] = [],
): BenchmarkCase => ({ id, question, tool, args, expectFiles, expectSymbols });

/** Built-in cases about the ascua repo itself; tied to its layout. */
export const BENCHMARK_CASES: BenchmarkCase[] = [
  c(
    'find-index-db-path',
    'Where is indexDbPath defined?',
    'search_symbols',
    { query: 'indexDbPath' },
    [IDX_SVC],
    ['indexDbPath'],
  ),
  c(
    'find-indexer-service',
    'Which classes are called IndexerService?',
    'search_symbols',
    { query: 'IndexerService' },
    ['apps/indexer/src/index/indexer-service.ts', IDX_SVC],
    ['IndexerService'],
  ),
  c(
    'find-reduce-transcript',
    'Where is reduceTranscript defined?',
    'search_symbols',
    { query: 'reduceTranscript' },
    [TRANSCRIPT],
    ['reduceTranscript'],
  ),
  c(
    'find-sqlite-client',
    'Where is SqliteClient defined?',
    'search_symbols',
    { query: 'SqliteClient' },
    ['apps/indexer/src/db/sqlite-client.ts'],
    ['SqliteClient'],
  ),
  c(
    'outline-server',
    'What does the MCP server file declare?',
    'get_file_outline',
    { path: SERVER },
    [],
    ['toolHandlers', 'instrument', 'mcpLayer'],
  ),
  c(
    'outline-desktop-indexer',
    'What does the desktop indexer service declare?',
    'get_file_outline',
    { path: IDX_SVC },
    [],
    ['IndexerServiceOptions', 'indexDbPath', 'IndexerService'],
  ),
  c(
    'context-estimate-tokens',
    'Show the source of estimateTokens.',
    'get_symbol_context',
    { symbol: 'estimateTokens' },
    [QUERY],
    ['estimateTokens'],
  ),
  c(
    'context-reduce-transcript',
    'Show the source of reduceTranscript.',
    'get_symbol_context',
    { symbol: 'reduceTranscript' },
    [TRANSCRIPT],
    ['reduceTranscript'],
  ),
  c(
    'refs-estimate-tokens',
    'Where is estimateTokens used?',
    'find_references',
    { symbol: 'estimateTokens' },
    [SERVER, QUERY],
    ['instrument', 'searchSymbols'],
  ),
  c(
    'callers-index-db-path',
    'Who calls indexDbPath?',
    'find_callers',
    { symbol: 'indexDbPath' },
    [IDX_MCP, IDX_SVC],
    ['indexerMcpSpec', 'reindex'],
  ),
  c(
    'callers-estimate-tokens',
    'Who calls estimateTokens?',
    'find_callers',
    { symbol: 'estimateTokens' },
    [SERVER, QUERY],
    ['instrument', 'symbolContext'],
  ),
  c(
    'callees-symbol-context',
    'What does symbolContext call?',
    'find_callees',
    { symbol: 'symbolContext' },
    [QUERY],
    ['estimateTokens', 'compact'],
  ),
  c(
    'importers-query-service',
    'Which files import the query service?',
    'find_importers',
    { target: QUERY },
    ['apps/indexer/src/main.ts', SERVER],
  ),
  c(
    'importers-reduce-transcript',
    'Who imports reduceTranscript (through barrels)?',
    'find_importers',
    { target: 'reduceTranscript' },
    ['libs/assistant/src/index.ts'],
  ),
  c(
    'impl-error',
    'Which classes extend Error?',
    'find_implementations',
    { symbol: 'Error' },
    [
      'apps/desktop/src/app/files/project-files.ts',
      'apps/desktop/src/app/git/git-clone.ts',
    ],
    ['FileAccessError', 'CloneError'],
  ),
];
