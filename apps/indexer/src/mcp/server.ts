import { Cause, Clock, Effect, Exit, Layer, Schema } from 'effect';
import { McpProtocol, McpServer, Tool, Toolkit } from 'effect/ai';
import { MetricsService } from '../metrics/metrics-service';
import {
  estimateTokens,
  QueryService,
  type OutlineNode,
} from '../query/query-service';

const maxTokens = Schema.optional(Schema.Number).annotateKey({
  description: 'Token budget for the response (estimate: chars/4).',
});

const SearchSymbols = Tool.make('search_symbols', {
  description:
    'Full-text search of indexed symbols (functions, classes, methods) by name, signature or path. Returns compact hits: n=name k=kind p=path l=[start,end] o=owner.',
  parameters: Schema.Struct({
    query: Schema.String,
    limit: Schema.optional(Schema.Number),
    max_tokens: maxTokens,
  }),
  success: Schema.String,
});

const GetFileOutline = Tool.make('get_file_outline', {
  description:
    'Symbols of one file (root-relative path), methods nested under their class in m.',
  parameters: Schema.Struct({ path: Schema.String }),
  success: Schema.String,
});

const GetSymbolContext = Tool.make('get_symbol_context', {
  description:
    'Source lines of a symbol, by name or numeric id from search_symbols.',
  parameters: Schema.Struct({
    symbol: Schema.String,
    max_tokens: maxTokens,
  }),
  success: Schema.String,
});

export const IndexerToolkit = Toolkit.make(
  SearchSymbols,
  GetFileOutline,
  GetSymbolContext,
);

const json = (value: unknown) => JSON.stringify(value ?? null);

const countOutline = (nodes: readonly OutlineNode[]): number =>
  nodes.reduce((n, node) => n + 1 + countOutline(node.m ?? []), 0);

/** Times the handler and records it; recording never alters the result. */
const instrument = <A, E>(
  metrics: MetricsService['Service'],
  tool: string,
  maxTokens: number | undefined,
  results: (value: A) => number | undefined,
  effect: Effect.Effect<A, E>,
): Effect.Effect<string, never> =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis;
    return yield* effect.pipe(
      Effect.map((value) => ({ value, text: json(value) })),
      Effect.orDie,
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          const endedAt = yield* Clock.currentTimeMillis;
          const ok = Exit.isSuccess(exit);
          yield* metrics.record({
            tool,
            startedAt,
            durationMs: endedAt - startedAt,
            tokens: ok ? estimateTokens(exit.value.text) : 0,
            maxTokens,
            results: ok ? results(exit.value.value) : undefined,
            ok,
            error: ok ? undefined : String(Cause.squash(exit.cause)),
          });
        }).pipe(Effect.catchCause(() => Effect.void)),
      ),
      Effect.map(({ text }) => text),
    );
  });

export const handlers = (defaultMaxTokens: number | undefined) =>
  IndexerToolkit.toLayer(
    Effect.gen(function* () {
      const query = yield* QueryService;
      const metrics = yield* MetricsService;
      return IndexerToolkit.of({
        search_symbols: ({ query: q, limit, max_tokens }) => {
          const budget = max_tokens ?? defaultMaxTokens;
          return instrument(
            metrics,
            'search_symbols',
            budget,
            (hits) => hits.length,
            query.searchSymbols(q, { maxTokens: budget, limit }),
          );
        },
        get_file_outline: ({ path }) =>
          instrument(
            metrics,
            'get_file_outline',
            undefined,
            countOutline,
            query.fileOutline(path),
          ),
        get_symbol_context: ({ symbol, max_tokens }) => {
          const budget = max_tokens ?? defaultMaxTokens;
          return instrument(
            metrics,
            'get_symbol_context',
            budget,
            () => undefined,
            query.symbolContext(symbol, { maxTokens: budget }),
          );
        },
      });
    }),
  );

/** MCP stdio server; needs `Stdio`, `QueryService`, `MetricsService`. */
export const mcpLayer = (defaultMaxTokens?: number) =>
  McpServer.toolkit(IndexerToolkit).pipe(
    Layer.provide(handlers(defaultMaxTokens)),
    Layer.provideMerge(
      McpServer.layerStdio({
        name: 'ascua-indexer',
        version: '0.0.1',
        protocols: [
          McpProtocol.v2025_11_25,
          McpProtocol.v2025_06_18,
          McpProtocol.v2025_03_26,
        ],
      }),
    ),
  );
