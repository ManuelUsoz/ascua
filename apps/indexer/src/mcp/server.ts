import { Cause, Clock, Effect, Exit, Layer, Schema } from 'effect';
import { McpProtocol, McpServer, Tool, Toolkit } from 'effect/ai';
import { MetricsService } from '../metrics/metrics-service';
import {
  estimateTokens,
  QueryService,
  type ImporterHit,
  type OutlineNode,
  type RefOptions,
  type SymbolContext,
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
  failure: Schema.String,
});

const GetFileOutline = Tool.make('get_file_outline', {
  description:
    'Symbols of one file (root-relative path), methods nested under their class in m.',
  parameters: Schema.Struct({ path: Schema.String }),
  success: Schema.String,
  failure: Schema.String,
});

const GetSymbolContext = Tool.make('get_symbol_context', {
  description:
    'Source lines of a symbol, by name or numeric id from search_symbols.',
  parameters: Schema.Struct({
    symbol: Schema.Union([Schema.String, Schema.Number]),
    max_tokens: maxTokens,
  }),
  success: Schema.String,
  failure: Schema.String,
});

const symbolParams = Schema.Struct({
  symbol: Schema.String,
  path: Schema.optional(Schema.String).annotateKey({
    description: 'Root-relative file of the definition, to disambiguate.',
  }),
  max_tokens: maxTokens,
});

const refParams = Schema.Struct({
  ...symbolParams.fields,
  includeUnresolved: Schema.optional(Schema.Boolean).annotateKey({
    description:
      'Opt in to name-only matches for short/generic names; the output reports how many were omitted.',
  }),
});

const FindReferences = Tool.make('find_references', {
  description:
    'All uses of a symbol across files, resolved through imports and re-exports. p=path l=line r=role(call/new/ref/type) e=enclosing symbol a=ambiguous u=only matched by name (unresolved). Output is {hits, omitted}: omitted=N (only when > 0) counts hidden name-only matches.',
  parameters: refParams,
  success: Schema.String,
});

const FindCallers = Tool.make('find_callers', {
  description:
    'Who calls or instantiates a symbol, grouped by enclosing function/method (n,k,p,l) with call lines in calls. a=ambiguous u=unresolved. Output is {hits, omitted}: omitted=N (only when > 0) counts hidden name-only matches.',
  parameters: refParams,
  success: Schema.String,
});

const FindCallees = Tool.make('find_callees', {
  description:
    'What a function/method calls or instantiates: from=caller n=callee l=line to=resolved definitions (u=unresolved, a=ambiguous).',
  parameters: symbolParams,
  success: Schema.String,
});

const FindImporters = Tool.make('find_importers', {
  description:
    'Files importing a file (root-relative path) or a symbol name. Includes importers reached through re-export barrels, marked indirect with via=barrel. re=re-export row s=specifier.',
  parameters: Schema.Struct({
    target: Schema.String.annotate({
      description: 'Root-relative file path, or a symbol name.',
    }),
    max_tokens: maxTokens,
  }),
  success: Schema.String,
  failure: Schema.String,
});

const FindImplementations = Tool.make('find_implementations', {
  description:
    'Classes that extend or implement a class/interface (rel=extends|implements), transitively (d=depth). a=ambiguous u=unresolved.',
  parameters: symbolParams,
  success: Schema.String,
});

export const IndexerToolkit = Toolkit.make(
  SearchSymbols,
  GetFileOutline,
  GetSymbolContext,
  FindReferences,
  FindCallers,
  FindCallees,
  FindImporters,
  FindImplementations,
);

const json = (value: unknown) => JSON.stringify(value ?? null);

const countOutline = (nodes: readonly OutlineNode[]): number =>
  nodes.reduce((n, node) => n + 1 + countOutline(node.m ?? []), 0);

/** Times the handler and records it; recording never alters the result. */
const instrument = <A, E, F = never>(
  metrics: MetricsService['Service'],
  tool: string,
  maxTokens: number | undefined,
  results: (value: A) => number | undefined,
  effect: Effect.Effect<A, E>,
  /** A message turns the result into a tool failure (`isError`). */
  missing?: (value: A) => string | undefined,
): Effect.Effect<string, F> =>
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
      Effect.flatMap(({ value, text }) => {
        const message = missing?.(value);
        return message === undefined
          ? Effect.succeed(text)
          : Effect.fail(message as F);
      }),
    );
  });

/** The tool handler table the MCP layer serves; also callable in-process. */
export const toolHandlers = (defaultMaxTokens: number | undefined) =>
  Effect.gen(function* () {
    const query = yield* QueryService;
    const metrics = yield* MetricsService;
    const symbolTool =
      <A, E>(
        tool: string,
        run: (name: string, o: RefOptions) => Effect.Effect<A, E>,
        count: (r: A) => number = (r) => (r as readonly unknown[]).length,
      ) =>
      ({
        symbol,
        path,
        max_tokens,
        includeUnresolved,
      }: {
        symbol: string;
        path?: string;
        max_tokens?: number;
        includeUnresolved?: boolean;
      }) => {
        const budget = max_tokens ?? defaultMaxTokens;
        return instrument(
          metrics,
          tool,
          budget,
          count,
          run(symbol, { path, maxTokens: budget, includeUnresolved }),
        );
      };
    return IndexerToolkit.of({
      find_references: symbolTool(
        'find_references',
        query.findReferences,
        (r) => r.hits.length,
      ),
      find_callers: symbolTool(
        'find_callers',
        query.findCallers,
        (r) => r.hits.length,
      ),
      find_callees: symbolTool('find_callees', query.findCallees),
      find_implementations: symbolTool(
        'find_implementations',
        query.findImplementations,
      ),
      find_importers: ({ target, max_tokens }) => {
        const budget = max_tokens ?? defaultMaxTokens;
        return instrument<ImporterHit[] | undefined, unknown, string>(
          metrics,
          'find_importers',
          budget,
          (r) => r?.length,
          query.findImporters(target, { maxTokens: budget }),
          (r) =>
            r === undefined
              ? `No indexed file or symbol matches "${target}".`
              : undefined,
        );
      },
      search_symbols: ({ query: q, limit, max_tokens }) => {
        const budget = max_tokens ?? defaultMaxTokens;
        const blank = q.trim() === '';
        return instrument<
          Effect.Success<ReturnType<typeof query.searchSymbols>> | undefined,
          unknown,
          string
        >(
          metrics,
          'search_symbols',
          budget,
          (r) => r?.hits.length,
          blank
            ? Effect.succeed(undefined)
            : query.searchSymbols(q, { maxTokens: budget, limit }),
          (r) => (r === undefined ? 'Query must not be empty.' : undefined),
        );
      },
      get_file_outline: ({ path }) =>
        instrument<OutlineNode[] | undefined, unknown, string>(
          metrics,
          'get_file_outline',
          undefined,
          (r) => (r === undefined ? undefined : countOutline(r)),
          query.fileOutline(path),
          (r) =>
            r === undefined ? `File "${path}" is not in the index.` : undefined,
        ),
      get_symbol_context: ({ symbol, max_tokens }) => {
        const budget = max_tokens ?? defaultMaxTokens;
        return instrument<SymbolContext | undefined, unknown, string>(
          metrics,
          'get_symbol_context',
          budget,
          () => undefined,
          query.symbolContext(symbol, { maxTokens: budget }),
          (r) =>
            r === undefined
              ? `No indexed symbol matches "${symbol}".`
              : undefined,
        );
      },
    });
  });

export const handlers = (defaultMaxTokens: number | undefined) =>
  IndexerToolkit.toLayer(toolHandlers(defaultMaxTokens));

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
