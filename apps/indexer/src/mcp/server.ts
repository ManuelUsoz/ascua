import { Cause, Clock, Effect, Exit, Layer, Schema } from 'effect';
import { McpProtocol, McpServer, Tool, Toolkit } from 'effect/ai';
import { MetricsService } from '../metrics/metrics-service';
import { ParserUtil } from '../parser-util';
import {
  estimateTokens,
  QueryService,
  type ImporterHit,
  type OutlineNode,
  type RefOptions,
  type Ambiguous,
  type SymbolContext,
} from '../query/query-service';

const maxTokens = Schema.optionalKey(Schema.Int).annotateKey({
  description: 'Token budget for the response (estimate: chars/4).',
});

const within = Schema.optionalKey(Schema.String).annotateKey({
  description:
    'Only USING files under this root-relative path prefix (path is the definition file).',
});

const excludeSpecs = Schema.optionalKey(Schema.Boolean).annotateKey({
  description: 'Drop hits from .spec./.test. files.',
});

export const ONLY_TS =
  ' Only TypeScript files (.ts/.mts/.cts/.tsx) are indexed; HTML templates and other languages are not.';

const SearchSymbols = Tool.make('search_symbols', {
  description:
    'Full-text search of indexed symbols (functions, classes, methods) by name, signature or path, ranked (exact name, declarations over members, code over specs). Returns compact hits: n=name k=kind p=path l=[start,end] o=owner.' +
    ONLY_TS,
  parameters: Schema.Struct({
    query: Schema.String,
    limit: Schema.optionalKey(Schema.Int),
    kind: Schema.optionalKey(
      Schema.Literals(['class', 'interface', 'function', 'method', 'variable']),
    ).annotateKey({
      description: 'Only this symbol kind.',
    }),
    owner: Schema.optionalKey(Schema.String).annotateKey({
      description: 'Only members of this class/interface.',
    }),
    path: Schema.optionalKey(Schema.String).annotateKey({
      description: 'Only files under this root-relative path prefix.',
    }),
    excludeSpecs: Schema.optionalKey(Schema.Boolean).annotateKey({
      description: 'Drop symbols from .spec./.test. files.',
    }),
    max_tokens: maxTokens,
  }),
  success: Schema.String,
  failure: Schema.String,
});

const GetFileOutline = Tool.make('get_file_outline', {
  description:
    'Symbols of one file (root-relative path; `file` is accepted as alias), methods nested under their class in m.' +
    ONLY_TS,
  parameters: Schema.Struct({
    path: Schema.optionalKey(Schema.String),
    file: Schema.optionalKey(Schema.String).annotateKey({
      description: 'Alias of path.',
    }),
  }),
  success: Schema.String,
  failure: Schema.String,
});

const GetSymbolContext = Tool.make('get_symbol_context', {
  description:
    'Source lines of a symbol, by name, Owner.name, path#name or numeric id from search_symbols. An ambiguous name returns {candidates} (id,n,o,p,l). signatureOnly returns just the first line; maxLines caps the lines; truncated=true when the source was cut.' +
    ONLY_TS,
  parameters: Schema.Struct({
    symbol: Schema.Union([Schema.String, Schema.Finite]),
    signatureOnly: Schema.optionalKey(Schema.Boolean),
    maxLines: Schema.optionalKey(Schema.Int),
    max_tokens: maxTokens,
  }),
  success: Schema.String,
  failure: Schema.String,
});

const symbolParams = Schema.Struct({
  symbol: Schema.String.annotate({
    description:
      'Name, Owner.name (e.g. RoomState.open) or path#name. A bare name with several definitions adds candidates (id,n,o,p,l) to the output (get_symbol_context returns only candidates); retry with one of those forms.',
  }),
  path: Schema.optionalKey(Schema.String).annotateKey({
    description: 'Root-relative file of the definition, to disambiguate.',
  }),
  max_tokens: maxTokens,
});

const refParams = Schema.Struct({
  ...symbolParams.fields,
  includeUnresolved: Schema.optionalKey(Schema.Boolean).annotateKey({
    description:
      'Opt in to name-only matches for short/generic names; the output reports how many were omitted.',
  }),
  within,
  excludeSpecs,
});

const referenceParams = Schema.Struct({
  ...refParams.fields,
  role: Schema.optionalKey(
    Schema.Literals(['call', 'new', 'ref', 'type']),
  ).annotateKey({ description: 'Only uses with this role.' }),
});

const calleeParams = Schema.Struct({
  ...symbolParams.fields,
  onlyResolved: Schema.optionalKey(Schema.Boolean).annotateKey({
    description: 'Drop unresolved (u) callees.',
  }),
});

const implParams = Schema.Struct({
  ...symbolParams.fields,
  relation: Schema.optionalKey(
    Schema.Literals(['extends', 'implements', 'satisfies']),
  ).annotateKey({ description: 'Only this relation.' }),
  within,
  excludeSpecs,
});

const FindReferences = Tool.make('find_references', {
  description:
    'All uses of a symbol across files, resolved through imports and re-exports. p=path l=line r=role(call/new/ref/type) e=enclosing symbol a=ambiguous u=only matched by name (unresolved). Output is {hits, omitted, truncated}: omitted=N (only when > 0) counts name-only matches hidden because their file never imports the definition (or short generic names); not pagination: pass includeUnresolved to see them; truncated=true means the token budget cut hits (raise max_tokens). Uses in Angular templates (e.g. <app-foo>) are not found.' +
    ONLY_TS,
  parameters: referenceParams,
  success: Schema.String,
  failure: Schema.String,
});

const FindCallers = Tool.make('find_callers', {
  description:
    'Who calls or instantiates a symbol, grouped by enclosing function/method (n,k,p,l) with call lines in calls. a=ambiguous (several definitions match) u=unresolved (matched by name only, no definition found). Output is {hits, omitted, truncated}: omitted=N counts name-only matches in files that never import the definition (not pagination); truncated=true means the token budget cut hits.' +
    ONLY_TS,
  parameters: refParams,
  success: Schema.String,
  failure: Schema.String,
});

const FindCallees = Tool.make('find_callees', {
  description:
    'What a function/method calls or instantiates: from=caller (o=owner class, p=file; a class also lists the calls of its methods) n=callee l=line to=resolved definitions (u=unresolved, a=ambiguous). An ambiguous bare name returns {candidates} (id,n,o,p,l) instead of the list: retry with Owner.name or path#name.' +
    ONLY_TS,
  parameters: calleeParams,
  success: Schema.String,
  failure: Schema.String,
});

const FindImporters = Tool.make('find_importers', {
  description:
    'Files importing a file (root-relative path) or a symbol name. Includes importers reached through re-export barrels, marked indirect with via=barrel. re=re-export row s=specifier. An ambiguous symbol name returns {candidates} (id,n,o,p,l): retry with a path.' +
    ONLY_TS,
  parameters: Schema.Struct({
    target: Schema.optionalKey(Schema.String).annotateKey({
      description:
        'Root-relative file path (a leading ./ and backslashes are normalized), or a symbol name.',
    }),
    path: Schema.optionalKey(Schema.String).annotateKey({
      description: 'Alias of target.',
    }),
    within,
    excludeSpecs,
    max_tokens: maxTokens,
  }),
  success: Schema.String,
  failure: Schema.String,
});

const FindImplementations = Tool.make('find_implementations', {
  description:
    'Who extends, implements or satisfies a class/interface, transitively (d=depth). Output is an object grouped by relation: extends (subclasses/sub-interfaces), implements (classes), satisfies (objects declared `x satisfies I` or `const x: I = {...}`); only non-empty keys appear, truncated=true when the token budget cut results. Each hit keeps rel. a=ambiguous u=unresolved. An ambiguous name also adds candidates (id,n,o,p,l); hits then merge all definitions.' +
    ONLY_TS,
  parameters: implParams,
  success: Schema.String,
  failure: Schema.String,
});

const SearchText = Tool.make('search_text', {
  description:
    'Free-text or regex search over the source lines of indexed .ts files, for what the symbol index does not cover (class fields such as `readonly open = signal(false)`, string literals, comments). Hits: p=path l=line text=trimmed line e=enclosing symbol. Output is {hits, truncated}.' +
    ONLY_TS,
  parameters: Schema.Struct({
    pattern: Schema.String,
    regex: Schema.optionalKey(Schema.Boolean).annotateKey({
      description: 'Treat pattern as a regular expression (default: literal).',
    }),
    caseSensitive: Schema.optionalKey(Schema.Boolean),
    within: Schema.optionalKey(Schema.String).annotateKey({
      description: 'Only files under this root-relative path prefix.',
    }),
    excludeSpecs,
    limit: Schema.optionalKey(Schema.Int),
    max_tokens: maxTokens,
  }),
  success: Schema.String,
  failure: Schema.String,
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
  SearchText,
);

/** Unknown-symbol message, with a pointer to the text search. */
const noSymbol = (name: string | number): string =>
  `No indexed symbol matches "${name}". Class fields that are not functions are not indexed: try search_text.`;

/** Message when the target looks like a file whose language is not indexed. */
const unindexed = (target: string): string | undefined =>
  /\.(?:[cm]?jsx?|json|mjs|cjs|py|md|html?|s?css|less|ya?ml|toml|sh|go|rs|java|rb|php|vue|svelte|txt|lock)$/i.test(
    target,
  ) && !ParserUtil.canParse(target)
    ? `"${target}" is not indexed: unsupported language (only .ts/.mts/.cts/.tsx).`
    : undefined;

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
        run: (name: string, o: RefOptions) => Effect.Effect<A | undefined, E>,
        count: (r: A) => number,
      ) =>
      ({
        symbol,
        max_tokens,
        ...rest
      }: {
        symbol: string;
        path?: string;
        max_tokens?: number;
        includeUnresolved?: boolean;
        within?: string;
        excludeSpecs?: boolean;
        role?: string;
        relation?: string;
        onlyResolved?: boolean;
      }) => {
        const budget = max_tokens ?? defaultMaxTokens;
        return instrument<A | undefined, E, string>(
          metrics,
          tool,
          budget,
          (r) => (r === undefined ? undefined : count(r)),
          run(symbol, { ...rest, maxTokens: budget }),
          (r) => (r === undefined ? noSymbol(symbol) : undefined),
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
      find_callees: symbolTool('find_callees', query.findCallees, (r) =>
        Array.isArray(r) ? r.length : 0,
      ),
      find_implementations: symbolTool(
        'find_implementations',
        query.findImplementations,
        (r) =>
          (r.extends?.length ?? 0) +
          (r.implements?.length ?? 0) +
          (r.satisfies?.length ?? 0),
      ),
      find_importers: ({
        target: t,
        path: p,
        within,
        excludeSpecs,
        max_tokens,
      }) => {
        const target = t ?? p ?? '';
        const budget = max_tokens ?? defaultMaxTokens;
        return instrument<
          ImporterHit[] | Ambiguous | undefined,
          unknown,
          string
        >(
          metrics,
          'find_importers',
          budget,
          (r) => (Array.isArray(r) ? r.length : undefined),
          target.trim() === ''
            ? Effect.succeed(undefined)
            : query.findImporters(target, {
                maxTokens: budget,
                within,
                excludeSpecs,
              }),
          (r) =>
            r === undefined
              ? target.trim() === ''
                ? 'Pass target (or path).'
                : (unindexed(target) ?? noSymbol(target))
              : undefined,
        );
      },
      search_symbols: ({
        query: q,
        limit,
        kind,
        owner,
        path,
        excludeSpecs,
        max_tokens,
      }) => {
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
            : query.searchSymbols(q, {
                maxTokens: budget,
                limit,
                kind,
                owner,
                path,
                excludeSpecs,
              }),
          (r) => (r === undefined ? 'Query must not be empty.' : undefined),
        );
      },
      get_file_outline: ({ path: p, file }) => {
        const path = p ?? file ?? '';
        return instrument<OutlineNode[] | undefined, unknown, string>(
          metrics,
          'get_file_outline',
          undefined,
          (r) => (r === undefined ? undefined : countOutline(r)),
          path === '' ? Effect.succeed(undefined) : query.fileOutline(path),
          (r) =>
            r === undefined
              ? path === ''
                ? 'Pass path (or file).'
                : (unindexed(path) ?? `File "${path}" is not in the index.`)
              : undefined,
        );
      },
      get_symbol_context: ({ symbol, signatureOnly, maxLines, max_tokens }) => {
        const budget = max_tokens ?? defaultMaxTokens;
        return instrument<
          SymbolContext | Ambiguous | undefined,
          unknown,
          string
        >(
          metrics,
          'get_symbol_context',
          budget,
          () => undefined,
          query.symbolContext(symbol, {
            maxTokens: budget,
            signatureOnly,
            maxLines,
          }),
          (r) => (r === undefined ? noSymbol(symbol) : undefined),
        );
      },
      search_text: ({
        pattern,
        regex,
        caseSensitive,
        within,
        excludeSpecs,
        limit,
        max_tokens,
      }) => {
        const budget = max_tokens ?? defaultMaxTokens;
        const blank = pattern === '';
        return instrument<
          | Effect.Success<ReturnType<typeof query.searchText>>
          | { readonly invalid: string }
          | undefined,
          unknown,
          string
        >(
          metrics,
          'search_text',
          budget,
          (r) => (r && 'hits' in r ? r.hits.length : undefined),
          blank
            ? Effect.succeed(undefined)
            : query
                .searchText(pattern, {
                  regex,
                  caseSensitive,
                  within,
                  excludeSpecs,
                  limit,
                  maxTokens: budget,
                })
                .pipe(
                  Effect.catchTag('InvalidPattern', (e) =>
                    Effect.succeed({ invalid: e.message }),
                  ),
                ),
          (r) =>
            r === undefined
              ? 'Pattern must not be empty.'
              : 'invalid' in r
                ? `Invalid pattern: ${r.invalid}`
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
