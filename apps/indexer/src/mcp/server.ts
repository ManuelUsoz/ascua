import { Effect, Layer, Schema } from 'effect';
import { McpProtocol, McpServer, Tool, Toolkit } from 'effect/ai';
import { QueryService } from '../query/query-service';

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

const handlers = (defaultMaxTokens: number | undefined) =>
  IndexerToolkit.toLayer(
    Effect.gen(function* () {
      const query = yield* QueryService;
      return IndexerToolkit.of({
        search_symbols: ({ query: q, limit, max_tokens }) =>
          query
            .searchSymbols(q, {
              maxTokens: max_tokens ?? defaultMaxTokens,
              limit,
            })
            .pipe(Effect.map(json), Effect.orDie),
        get_file_outline: ({ path }) =>
          query.fileOutline(path).pipe(Effect.map(json), Effect.orDie),
        get_symbol_context: ({ symbol, max_tokens }) =>
          query
            .symbolContext(symbol, {
              maxTokens: max_tokens ?? defaultMaxTokens,
            })
            .pipe(Effect.map(json), Effect.orDie),
      });
    }),
  );

/** MCP stdio server; needs `Stdio`, `QueryService`. */
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
