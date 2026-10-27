import { Context, Data, Effect, FileSystem, Layer, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { SqliteClient, type SqliteError } from '../db/sqlite-client';
import { resolveSpecifier } from '../query-util';
import { readPathAliases } from '../scan/tsconfig-paths';
import { Ranking } from './ranking';
import { inScope, type Scope } from './scope';

export const DEFAULT_MAX_TOKENS = 2000;

/** Ambiguity candidates returned at most. */
const MAX_CANDIDATES = 10;

export interface SearchOptions {
  readonly maxTokens?: number;
  readonly limit?: number;
  /** search_symbols: only this symbol kind. */
  readonly kind?: string;
  /** search_symbols: only members of this class/interface. */
  readonly owner?: string;
  /** search_symbols: root-relative path prefix. */
  readonly path?: string;
  /** search_symbols: drop `.spec.` / `.test.` files. */
  readonly excludeSpecs?: boolean;
  /** get_symbol_context: first line only (the declaration). */
  readonly signatureOnly?: boolean;
  /** get_symbol_context: cap on returned source lines. */
  readonly maxLines?: number;
}

/** Backslashes to `/`, leading `./` dropped. */
export const normalizePath = (p: string): string =>
  p.replaceAll('\\', '/').replace(/^(\.\/)+/, '');

/** Compact hit: n=name k=kind p=path l=[start,end] o=owner g=signature. */
export interface SymbolHit {
  readonly id: number;
  readonly n: string;
  readonly k: string;
  readonly p: string;
  readonly l: readonly [number, number];
  readonly o?: string;
  readonly g?: string;
}

export interface SearchResult {
  readonly hits: SymbolHit[];
  readonly truncated?: true;
}

export interface OutlineNode {
  readonly id: number;
  readonly n: string;
  readonly k: string;
  readonly l: readonly [number, number];
  readonly g?: string;
  readonly m?: readonly OutlineNode[];
}

export interface SymbolContext {
  readonly id: number;
  readonly n: string;
  readonly k: string;
  readonly p: string;
  readonly l: readonly [number, number];
  readonly src: string;
  readonly truncated?: true;
}

/** Several definitions matched a bare name: pick one (`Owner.name`, `path#name`, id). */
export interface Candidate {
  readonly id: number;
  readonly n: string;
  readonly o?: string;
  readonly p: string;
  readonly l: number;
}

export interface Ambiguous {
  readonly candidates: readonly Candidate[];
  /** Candidates dropped by the cap. */
  readonly moreCandidates?: number;
}

export interface QueryServiceShape {
  readonly searchSymbols: (
    query: string,
    options?: SearchOptions,
  ) => Effect.Effect<SearchResult, SqliteError>;
  readonly fileOutline: (
    path: string,
  ) => Effect.Effect<OutlineNode[] | undefined, SqliteError>;
  readonly symbolContext: (
    ref: string | number,
    options?: SearchOptions,
  ) => Effect.Effect<
    SymbolContext | Ambiguous | undefined,
    SqliteError | PlatformError
  >;
  readonly findReferences: (
    name: string,
    options?: RefOptions,
  ) => Effect.Effect<HitsResult<ReferenceHit> | undefined, SqliteError>;
  readonly findCallers: (
    name: string,
    options?: RefOptions,
  ) => Effect.Effect<HitsResult<CallerHit> | undefined, SqliteError>;
  readonly findCallees: (
    name: string,
    options?: RefOptions,
  ) => Effect.Effect<CalleeHit[] | Ambiguous | undefined, SqliteError>;
  /** `target` is a root-relative file path or a symbol name. */
  readonly findImporters: (
    target: string,
    options?: Scope & SearchOptions,
  ) => Effect.Effect<ImporterHit[] | Ambiguous | undefined, SqliteError>;
  readonly findImplementations: (
    name: string,
    options?: RefOptions,
  ) => Effect.Effect<ImplGroups | undefined, SqliteError>;
  /** Line search over indexed files; covers what the symbol index skips. */
  readonly searchText: (
    pattern: string,
    options?: TextSearchOptions,
  ) => Effect.Effect<
    TextSearchResult,
    SqliteError | PlatformError | InvalidPattern
  >;
}

export class InvalidPattern extends Data.TaggedError('InvalidPattern')<{
  readonly message: string;
}> {}

export interface TextSearchOptions extends Scope {
  readonly regex?: boolean;
  readonly caseSensitive?: boolean;
  readonly limit?: number;
  readonly maxTokens?: number;
}

export interface TextHit {
  readonly p: string;
  readonly l: number;
  readonly text: string;
  /** Innermost enclosing symbol, from the index (may be stale). */
  readonly e?: string;
}

export interface TextSearchResult {
  readonly hits: TextHit[];
  readonly truncated?: true;
}

/** Implementations bucketed by relation; only non-empty keys appear. */
export interface ImplGroups {
  extends?: ImplHit[];
  implements?: ImplHit[];
  satisfies?: ImplHit[];
  truncated?: true;
  /** Ambiguous name: hits merge every definition; retry with one of these. */
  candidates?: readonly Candidate[];
  moreCandidates?: number;
}

export interface RefOptions extends SearchOptions, Scope {
  /** Root-relative path disambiguating which definition is meant. */
  readonly path?: string;
  /** Keep name-only (unresolved) matches even when resolved ones exist. */
  readonly includeUnresolved?: boolean;
  /** find_references: only this occurrence role (call/new/ref/type). */
  readonly role?: string;
  /** find_implementations: only this relation. */
  readonly relation?: string;
  /** find_callees: drop unresolved callees. */
  readonly onlyResolved?: boolean;
}

/** Definition: n=name k=kind p=path l=[start,end]. */
interface Def {
  readonly id: number;
  readonly n: string;
  readonly k: string;
  readonly p: string;
  readonly l: readonly [number, number];
  readonly o: string | null;
}

interface DefRow {
  id: number;
  name: string;
  kind: string;
  start_line: number;
  end_line: number;
  owner: string | null;
  path: string;
}

const toDef = (r: DefRow): Def => ({
  id: r.id,
  n: r.name,
  k: r.kind,
  p: r.path,
  l: [r.start_line, r.end_line],
  o: r.owner,
});

const placeholder = (name: string): Def => ({
  id: -1,
  n: name,
  k: 'unknown',
  p: '',
  l: [0, 0],
  o: null,
});

interface ImportInfo {
  kind: string;
  local_name: string | null;
  imported_name: string | null;
  target_path: string | null;
}

interface OccRow {
  name: string;
  qualifier: string | null;
  role: string;
  line: number;
  col: number;
  path: string;
  binding?: string | null;
  receiver_type?: string | null;
  e_id: number | null;
  e_name: string | null;
  e_kind: string | null;
  e_start: number | null;
  e_end: number | null;
}

interface ImporterRow {
  path: string;
  kind: string;
  imported_name: string | null;
  local_name: string | null;
  specifier: string;
  line: number;
}

interface RelRow extends DefRow {
  rel: string;
  target_name: string;
  target_qualifier: string | null;
}

/** p=path l=line r=role e=enclosing a=ambiguous u=unresolved-by-name. */
export interface ReferenceHit {
  readonly p: string;
  readonly l: number;
  readonly r: string;
  readonly e?: string;
  readonly a?: true;
  readonly u?: true;
}

/** Hits plus the count of name-only matches hidden (omitted only when > 0). */
export interface HitsResult<T> {
  readonly hits: T[];
  readonly omitted?: number;
  /** The token budget cut hits (not pagination: raise max_tokens). */
  readonly truncated?: true;
  readonly candidates?: readonly Candidate[];
  readonly moreCandidates?: number;
}

/** Enclosing symbol of the calls: calls=lines. */
export interface CallerHit {
  readonly n: string;
  readonly k: string;
  readonly p: string;
  readonly l?: readonly [number, number];
  readonly calls: readonly number[];
  readonly a?: true;
  readonly u?: true;
}

export interface CalleeHit {
  readonly from: string;
  /** Owner class and file of the caller. */
  readonly o?: string;
  readonly p: string;
  readonly n: string;
  readonly l: number;
  readonly r: string;
  readonly to?: readonly {
    n: string;
    k: string;
    p: string;
    l: readonly [number, number];
  }[];
  readonly a?: true;
  readonly u?: true;
}

/** s=specifier re=re-export row indirect=via a barrel (via=file reached). */
export interface ImporterHit {
  readonly p: string;
  readonly l: number;
  readonly s: string;
  readonly re?: true;
  readonly indirect?: true;
  readonly via?: string;
}

export interface ImplHit {
  readonly n: string;
  readonly k: string;
  readonly p: string;
  readonly l: readonly [number, number];
  readonly rel: string;
  readonly d?: number;
  readonly a?: true;
  readonly u?: true;
}

interface JoinedRow {
  id: number;
  name: string;
  kind: string;
  start_line: number;
  end_line: number;
  signature: string | null;
  owner: string | null;
  path: string;
}

/** Rough token estimate: chars / 4. */
export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / 4);

/** Quotes each token; every token matches by prefix. */
export const toFtsQuery = (input: string): string => {
  const tokens = input.match(/[\p{L}\p{N}_]+/gu) ?? [];
  return tokens.map((t) => `"${t}"*`).join(' ');
};

const compact = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null),
  ) as T;

const hit = (r: JoinedRow): SymbolHit =>
  compact({
    id: r.id,
    n: r.name,
    k: r.kind,
    p: r.path,
    l: [r.start_line, r.end_line] as const,
    o: r.owner ?? undefined,
    g: r.signature ?? undefined,
  });

const candidatesOf = (r: {
  candidates?: readonly Candidate[];
  more: number;
}): Ambiguous => ({
  candidates: r.candidates ?? [],
  ...(r.more > 0 && { moreCandidates: r.more }),
});

const COLUMNS =
  's.id, s.name, s.kind, s.start_line, s.end_line, s.signature, s.owner, f.path';

export class QueryService extends Context.Service<
  QueryService,
  QueryServiceShape
>()('indexer/QueryService') {
  /** `root` resolves indexed (root-relative) paths when reading sources. */
  static readonly layer = (
    root: string,
  ): Layer.Layer<
    QueryService,
    never,
    SqliteClient | FileSystem.FileSystem | Path.Path
  > =>
    Layer.effect(
      QueryService,
      Effect.gen(function* () {
        const db = yield* SqliteClient;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const aliases = yield* readPathAliases(root);

        const searchSymbols: QueryServiceShape['searchSymbols'] = (
          query,
          {
            maxTokens = DEFAULT_MAX_TOKENS,
            limit = 20,
            kind,
            owner,
            path: prefix,
            excludeSpecs,
          } = {},
        ) =>
          Effect.gen(function* () {
            const base = toFtsQuery(query);
            if (base === '') return { hits: [] };
            // `push to talk` also matches the single-token name PushToTalk
            // (unicode61 does not split camelCase).
            const words = query.match(/[\p{L}\p{N}_]+/gu) ?? [];
            const match =
              words.length > 1 ? `(${base}) OR "${words.join('')}"*` : base;
            const filters: string[] = [];
            const params: (string | number)[] = [match];
            if (kind !== undefined) {
              filters.push('AND s.kind = ?');
              params.push(kind);
            }
            if (owner !== undefined) {
              filters.push('AND s.owner = ?');
              params.push(owner);
            }
            if (prefix !== undefined) {
              filters.push("AND f.path LIKE ? ESCAPE '\\'");
              params.push(
                `${normalizePath(prefix).replace(/[\\%_]/g, '\\$&')}%`,
              );
            }
            if (excludeSpecs === true) {
              filters.push(
                "AND f.path NOT LIKE '%.spec.%' AND f.path NOT LIKE '%.test.%'",
              );
            }
            params.push(query.trim(), Math.max(limit * 5, 100));
            const fetched = yield* db.all<JoinedRow>(
              `SELECT ${COLUMNS} FROM symbols_fts
               JOIN symbols s ON s.id = symbols_fts.rowid
               JOIN files f ON f.id = s.file_id
               WHERE symbols_fts MATCH ? ${filters.join(' ')}
               ORDER BY (s.name = ?) DESC, bm25(symbols_fts)
               LIMIT ?`,
              params,
            );
            const rows = Ranking.sort(
              fetched,
              (r) => ({
                name: r.name,
                kind: r.kind,
                path: r.path,
                owner: r.owner,
              }),
              { text: query.trim() },
            ).slice(0, limit);
            const out: SymbolHit[] = [];
            let used = 0;
            let truncated = false;
            for (const row of rows) {
              const item = hit(row);
              const cost = estimateTokens(JSON.stringify(item));
              if (out.length > 0 && used + cost > maxTokens) {
                truncated = true;
                break;
              }
              used += cost;
              out.push(item);
            }
            return truncated
              ? { hits: out, truncated: true as const }
              : { hits: out };
          });

        const fileOutline: QueryServiceShape['fileOutline'] = (file) =>
          Effect.gen(function* () {
            const normalized = normalizePath(file);
            const known = yield* db.get<{ path: string }>(
              'SELECT path FROM files WHERE path = ?',
              [normalized],
            );
            if (known === undefined) return undefined;
            const rows = yield* db.all<JoinedRow>(
              `SELECT ${COLUMNS} FROM symbols s
               JOIN files f ON f.id = s.file_id
               WHERE f.path = ? ORDER BY s.start_line`,
              [normalized],
            );
            const node = (r: JoinedRow, m?: OutlineNode[]): OutlineNode =>
              compact({
                id: r.id,
                n: r.name,
                k: r.kind,
                l: [r.start_line, r.end_line] as const,
                g: r.signature ?? undefined,
                m: m && m.length > 0 ? m : undefined,
              });
            const members = new Map<string, JoinedRow[]>();
            for (const r of rows) {
              if (r.owner !== null) {
                members.set(r.owner, [...(members.get(r.owner) ?? []), r]);
              }
            }
            const tops = rows.filter(
              (r) =>
                r.owner === null ||
                !rows.some((o) => o.owner === null && o.name === r.owner),
            );
            return tops.map((r) =>
              node(
                r,
                r.owner === null
                  ? (members.get(r.name) ?? []).map((c) => node(c))
                  : undefined,
              ),
            );
          });

        const symbolContext: QueryServiceShape['symbolContext'] = (
          ref,
          { maxTokens = DEFAULT_MAX_TOKENS, signatureOnly, maxLines } = {},
        ) =>
          Effect.gen(function* () {
            const resolved = yield* resolveSymbol(ref);
            if (resolved.candidates !== undefined) {
              return candidatesOf(resolved);
            }
            const target = resolved.targets[0];
            if (target === undefined) return undefined;
            const row = yield* db.get<JoinedRow>(
              `SELECT ${COLUMNS} FROM symbols s
               JOIN files f ON f.id = s.file_id
               WHERE s.id = ?`,
              [target.id],
            );
            if (row === undefined) return undefined;
            const text = yield* fs.readFileString(path.join(root, row.path));
            const lineCap = signatureOnly === true ? 1 : (maxLines ?? Infinity);
            const lines = text
              .split(/\r?\n/)
              .slice(row.start_line - 1, row.end_line)
              .slice(0, Math.max(1, lineCap));
            const kept: string[] = [];
            let used = 0;
            for (const line of lines) {
              used += estimateTokens(line) + 1;
              if (used > maxTokens) break;
              kept.push(line);
            }
            return compact({
              id: row.id,
              n: row.name,
              k: row.kind,
              p: row.path,
              l: [row.start_line, row.end_line] as const,
              src: kept.join('\n'),
              truncated:
                kept.length < lines.length ? (true as const) : undefined,
            }) as SymbolContext;
          });

        // ---- cross-file resolution (name + import target, at query time) ----

        const MAX_DEPTH = 5;
        const topLevel = (r: Def): boolean => r.o === null;

        /** Per-call resolver with its own caches. */
        const makeResolver = () => {
          const defCache = new Map<string, Def[]>();
          const impCache = new Map<string, ImportInfo[]>();

          const defsInPath = (p: string, name: string | null) =>
            Effect.gen(function* () {
              const key = `${p}\0${name ?? ''}`;
              const cached = defCache.get(key);
              if (cached !== undefined) return cached;
              const rows = yield* db.all<DefRow>(
                `SELECT s.id, s.name, s.kind, s.start_line, s.end_line, s.owner, f.path
                 FROM symbols s JOIN files f ON f.id = s.file_id
                 WHERE f.path = ? ${name === null ? '' : 'AND s.name = ?'}
                 ORDER BY s.start_line`,
                name === null ? [p] : [p, name],
              );
              const out = rows.map(toDef);
              defCache.set(key, out);
              return out;
            });

          const importsOfPath = (p: string) =>
            Effect.gen(function* () {
              const cached = impCache.get(p);
              if (cached !== undefined) return cached;
              const rows = yield* db.all<ImportInfo>(
                `SELECT i.kind, i.local_name, i.imported_name, i.target_path
                 FROM imports i JOIN files f ON f.id = i.file_id
                 WHERE f.path = ?`,
                [p],
              );
              impCache.set(p, rows);
              return rows;
            });

          const dedupe = (defs: Def[]): Def[] => [
            ...new Map(defs.map((d) => [d.id, d])).values(),
          ];

          /** Level 6: definition in `p`, else follow re-export rows. */
          const resolveInPath = (
            p: string,
            name: string,
            visited: ReadonlySet<string>,
            depth: number,
          ): Effect.Effect<Def[], SqliteError> =>
            Effect.gen(function* () {
              const key = `${p}\0${name}`;
              if (depth > MAX_DEPTH || visited.has(key)) return [];
              const direct = yield* defsInPath(p, name);
              if (direct.length > 0) return direct;
              const seen = new Set(visited).add(key);
              const out: Def[] = [];
              for (const r of yield* importsOfPath(p)) {
                if (r.kind !== 'reexport' || r.target_path === null) continue;
                if (r.imported_name === '*' && r.local_name === null) {
                  out.push(
                    ...(yield* resolveInPath(
                      r.target_path,
                      name,
                      seen,
                      depth + 1,
                    )),
                  );
                } else if (r.local_name === name && r.imported_name !== null) {
                  const inner =
                    r.imported_name === 'default' ? name : r.imported_name;
                  out.push(
                    ...(yield* resolveInPath(
                      r.target_path,
                      inner,
                      seen,
                      depth + 1,
                    )),
                  );
                }
              }
              return dedupe(out);
            });

          /** Best-effort default export: same name, else top-level defs. */
          const resolveDefault = (target: string, name: string) =>
            Effect.gen(function* () {
              const named = yield* resolveInPath(target, name, new Set(), 0);
              if (named.length > 0) return named;
              return (yield* defsInPath(target, null)).filter(topLevel);
            });

          /** Hook for languages with package-level visibility (Java); no-op for TS. */
          const sameModuleDefs = (
            filePath: string,
            name: string,
          ): Effect.Effect<Def[]> =>
            filePath === name ? Effect.succeed([]) : Effect.succeed([]);

          /** Resolves occurrence `name` (with `qualifier`) written in `filePath`. */
          const resolve = (
            filePath: string,
            name: string,
            qualifier: string | null,
            receiverType: string | null = null,
          ): Effect.Effect<Def[], SqliteError> =>
            Effect.gen(function* () {
              const imports = yield* importsOfPath(filePath);
              const imported = imports.filter(
                (i) => i.kind === 'import' && i.target_path !== null,
              );
              // 0: member of a known receiver type (class/interface/Effect service)
              let type = receiverType;
              if (
                type === null &&
                qualifier !== null &&
                /^[A-Z]\w*$/.test(qualifier) &&
                !imported.some(
                  (i) => i.local_name === qualifier && i.imported_name === '*',
                )
              ) {
                type = qualifier;
              }
              if (type !== null) {
                const members = yield* db.all<DefRow>(
                  `SELECT s.id, s.name, s.kind, s.start_line, s.end_line, s.owner, f.path
                   FROM symbols s JOIN files f ON f.id = s.file_id
                   WHERE s.name = ? AND s.owner IN (?, ?)
                   ORDER BY s.id`,
                  [name, type, `${type}Shape`],
                );
                const out = members.map(toDef);
                if (out.length > 0) {
                  // X.of({ name }): the const arrow implementing the shape member
                  const ofFiles = yield* db.all<{ path: string }>(
                    `SELECT DISTINCT f.path FROM occurrences o
                     JOIN files f ON f.id = o.file_id
                     WHERE o.name = 'of' AND o.qualifier = ?`,
                    [type],
                  );
                  for (const f of ofFiles) {
                    out.push(
                      ...(yield* defsInPath(f.path, name)).filter(topLevel),
                    );
                  }
                }
                if (out.length > 0) return dedupe(out);
                if (receiverType !== null) return [];
              }
              // member call on an unknown receiver: unresolved
              if (
                qualifier !== null &&
                qualifier !== 'this' &&
                !imported.some(
                  (i) => i.local_name === qualifier && i.imported_name === '*',
                )
              ) {
                return [];
              }
              // 3: namespace qualifier (ns.f())
              if (qualifier !== null) {
                const out: Def[] = [];
                for (const i of imported) {
                  if (i.local_name === qualifier && i.imported_name === '*') {
                    out.push(
                      ...(yield* resolveInPath(
                        i.target_path as string,
                        name,
                        new Set(),
                        0,
                      )),
                    );
                  }
                }
                if (out.length > 0) return dedupe(out);
              }
              // 1: defined in the same file
              const local = yield* defsInPath(filePath, name);
              if (local.length > 0) return local;
              // 2: explicit named/default import
              const explicit: Def[] = [];
              for (const i of imported) {
                if (i.local_name !== name || i.imported_name === '*') continue;
                const target = i.target_path as string;
                explicit.push(
                  ...(i.imported_name === 'default' || i.imported_name === null
                    ? yield* resolveDefault(target, name)
                    : yield* resolveInPath(
                        target,
                        i.imported_name,
                        new Set(),
                        0,
                      )),
                );
              }
              if (explicit.length > 0) return dedupe(explicit);
              // 4: same-module implicit visibility
              const sameModule = yield* sameModuleDefs(filePath, name);
              if (sameModule.length > 0) return sameModule;
              // 5: wildcard imports whose target defines the name
              const wild: Def[] = [];
              for (const i of imported) {
                if (i.imported_name === '*' && i.local_name === null) {
                  wild.push(
                    ...(yield* resolveInPath(
                      i.target_path as string,
                      name,
                      new Set(),
                      0,
                    )),
                  );
                }
              }
              return dedupe(wild);
            });

          return { resolve, defsInPath, importsOfPath };
        };

        /**
         * `ref` is a bare name, `Owner.name`, `path#name` or a numeric id.
         * Several definitions with nothing narrowing them -> `candidates`.
         */
        const resolveSymbol = (ref: string | number, file?: string) =>
          Effect.gen(function* () {
            const select = `SELECT s.id, s.name, s.kind, s.start_line, s.end_line, s.owner, f.path
               FROM symbols s JOIN files f ON f.id = s.file_id`;
            const asRef = String(ref);
            if (/^\d+$/.test(asRef)) {
              const rows = yield* db.all<DefRow>(`${select} WHERE s.id = ?`, [
                Number(asRef),
              ]);
              return {
                name: rows[0]?.name ?? asRef,
                targets: rows.map(toDef),
                candidates: undefined,
                more: 0,
                narrowed: true,
              };
            }
            let name = asRef;
            let where = file === undefined ? undefined : normalizePath(file);
            const hash = name.indexOf('#');
            if (hash > 0) {
              where = normalizePath(name.slice(0, hash));
              name = name.slice(hash + 1);
            }
            const query = (n: string, owner?: string) =>
              db.all<DefRow>(
                `${select} WHERE s.name = ?
                 ${owner === undefined ? '' : 'AND s.owner = ?'}
                 ${where === undefined ? '' : 'AND f.path = ?'}
                 ORDER BY s.id`,
                [
                  n,
                  ...(owner === undefined ? [] : [owner]),
                  ...(where === undefined ? [] : [where]),
                ],
              );
            let rows: DefRow[] = [];
            let owned = false;
            const dot = name.lastIndexOf('.');
            if (dot > 0 && dot < name.length - 1) {
              rows = yield* query(name.slice(dot + 1), name.slice(0, dot));
              if (rows.length > 0) {
                owned = true;
                name = name.slice(dot + 1);
              }
            }
            if (rows.length === 0) rows = yield* query(name);
            const narrowed = owned || where !== undefined;
            const ranked =
              !narrowed && rows.length > 1
                ? Ranking.sort(
                    rows,
                    (r) => ({
                      name: r.name,
                      kind: r.kind,
                      path: r.path,
                      owner: r.owner,
                    }),
                    { text: name },
                  )
                : undefined;
            const candidates = ranked?.slice(0, MAX_CANDIDATES).map((r) => ({
              id: r.id,
              n: r.name,
              ...(r.owner !== null && { o: r.owner }),
              p: r.path,
              l: r.start_line,
            }));
            const more = ranked ? ranked.length - MAX_CANDIDATES : 0;
            return {
              name,
              targets: rows.map(toDef),
              candidates,
              more: Math.max(more, 0),
              narrowed,
            };
          });

        const occurrencesNamed = (name: string) =>
          db.all<OccRow>(
            `SELECT o.name, o.qualifier, o.role, o.line, o.col, f.path,
                    o.binding, o.receiver_type,
                    s.id AS e_id, s.name AS e_name, s.kind AS e_kind,
                    s.start_line AS e_start, s.end_line AS e_end
             FROM occurrences o JOIN files f ON f.id = o.file_id
             LEFT JOIN symbols s ON s.id = o.enclosing_symbol_id
             WHERE o.name = ? ORDER BY f.path, o.line, o.col`,
            [name],
          );

        const cap = <T>(items: readonly T[], maxTokens: number): T[] =>
          capCut(items, maxTokens).items;
        /** Like `cap`, also reporting whether the budget cut anything. */
        const capCut = <T>(items: readonly T[], maxTokens: number) => {
          const out: T[] = [];
          let used = 0;
          let cut = false;
          for (const item of items) {
            const cost = estimateTokens(JSON.stringify(item));
            if (out.length > 0 && used + cost > maxTokens) {
              cut = true;
              break;
            }
            used += cost;
            out.push(item);
          }
          return { items: out, cut };
        };

        /** Importers of `paths`, following re-export barrels. */
        const importerHits = (paths: string[], symbol?: string) =>
          Effect.gen(function* () {
            const out: ImporterHit[] = [];
            const seenRows = new Set<string>();
            let frontier = paths;
            const visited = new Set(paths);
            for (
              let depth = 0;
              depth <= MAX_DEPTH && frontier.length > 0;
              depth++
            ) {
              const next: string[] = [];
              for (const tp of frontier) {
                const rows = yield* db.all<ImporterRow>(
                  `SELECT f.path, i.kind, i.imported_name, i.local_name, i.specifier, i.line
                   FROM imports i JOIN files f ON f.id = i.file_id
                   WHERE i.target_path = ? ORDER BY f.path, i.line`,
                  [tp],
                );
                for (const row of rows) {
                  // Symbol mode: only imports that can bring that name.
                  if (
                    symbol !== undefined &&
                    depth === 0 &&
                    !['*', 'default', symbol].includes(row.imported_name ?? '*')
                  ) {
                    continue;
                  }
                  const key = `${row.path}\0${row.line}\0${tp}`;
                  if (seenRows.has(key)) continue;
                  seenRows.add(key);
                  out.push({
                    p: row.path,
                    l: row.line,
                    s: row.specifier,
                    ...(row.kind === 'reexport' && { re: true as const }),
                    ...(depth > 0 && { indirect: true as const, via: tp }),
                  });
                  if (row.kind === 'reexport' && !visited.has(row.path)) {
                    visited.add(row.path);
                    next.push(row.path);
                  }
                }
              }
              frontier = next;
            }
            return out;
          });

        /** Imports whose module specifier is exactly `spec` (packages). */
        const importersBySpecifier = (spec: string) =>
          Effect.gen(function* () {
            const rows = yield* db.all<ImporterRow>(
              `SELECT f.path, i.kind, i.imported_name, i.local_name, i.specifier, i.line
               FROM imports i JOIN files f ON f.id = i.file_id
               WHERE i.specifier = ? ORDER BY f.path, i.line`,
              [spec],
            );
            return rows.map(
              (r): ImporterHit => ({ p: r.path, l: r.line, s: r.specifier }),
            );
          });

        /** Files importing any of `paths` (directly or via barrels). */
        const importerPaths = (paths: string[]) =>
          Effect.gen(function* () {
            return new Set((yield* importerHits(paths)).map((h) => h.p));
          });

        /** Occurrences of `name` that resolve to a target (or are unresolved). */
        const matching = (
          name: string,
          file: string | undefined,
          roles: readonly string[] | undefined,
          includeUnresolved = false,
          scope: Scope = {},
        ) =>
          Effect.gen(function* () {
            const resolved = yield* resolveSymbol(name, file);
            const { targets } = resolved;
            const candidates = resolved.candidates;
            name = resolved.name;
            const ids = new Set(targets.map((t) => t.id));
            const r = makeResolver();
            let out: {
              occ: OccRow;
              ambiguous: boolean;
              unresolved: boolean;
            }[] = [];
            for (const occ of yield* occurrencesNamed(name)) {
              if (roles !== undefined && !roles.includes(occ.role)) continue;
              if (!inScope(occ.path, scope)) continue;
              if (
                occ.binding != null &&
                targets.some((t) =>
                  ['function', 'method', 'class'].includes(t.k),
                )
              ) {
                continue;
              }
              const defs = yield* r.resolve(
                occ.path,
                occ.name,
                occ.qualifier,
                occ.receiver_type ?? null,
              );
              if (defs.length === 0) {
                out.push({ occ, ambiguous: false, unresolved: true });
              } else if (defs.some((d) => ids.has(d.id))) {
                out.push({
                  occ,
                  ambiguous: defs.length > 1,
                  unresolved: false,
                });
              }
            }
            // name-only matches: dropped only for short names
            const before = out.length;
            // one target chosen: name-only hits survive only in files that
            // are, or import (directly or via barrels), the definition file
            const only = targets.length === 1 ? targets[0] : undefined;
            const narrowedOnly =
              !includeUnresolved && resolved.narrowed && only !== undefined
                ? only
                : undefined;
            const reach = narrowedOnly
              ? yield* importerPaths([narrowedOnly.p])
              : new Set<string>();
            const reachable = (h: { occ: OccRow }) =>
              narrowedOnly !== undefined &&
              (h.occ.path === narrowedOnly.p || reach.has(h.occ.path));
            if (narrowedOnly !== undefined) {
              out = out.filter((h) => !h.unresolved || reachable(h));
            }
            if (!includeUnresolved && name.length < 6) {
              out = out.filter((h) => !h.unresolved || reachable(h));
            }
            // unknown-receiver member calls lose to resolved hits
            if (!includeUnresolved && out.some((h) => !h.unresolved)) {
              out = out.filter(
                (h) =>
                  !h.unresolved ||
                  h.occ.qualifier === null ||
                  h.occ.receiver_type != null,
              );
            }
            const omitted = before - out.length;
            // resolved first, unresolved last
            out.sort((a, b) => Number(a.unresolved) - Number(b.unresolved));
            return {
              targets,
              hits: out,
              omitted,
              candidates,
              more: resolved.more,
            };
          });

        const flags = (m: { ambiguous: boolean; unresolved: boolean }) => ({
          ...(m.ambiguous && { a: true as const }),
          ...(m.unresolved && { u: true as const }),
        });

        const findReferences: QueryServiceShape['findReferences'] = (
          name,
          {
            path: file,
            maxTokens = DEFAULT_MAX_TOKENS,
            includeUnresolved,
            role,
            within,
            excludeSpecs,
          } = {},
        ) =>
          Effect.gen(function* () {
            const { targets, hits, omitted, candidates, more } =
              yield* matching(
                name,
                file,
                role === undefined ? undefined : [role],
                includeUnresolved,
                { within, excludeSpecs },
              );
            if (targets.length === 0 && hits.length === 0 && omitted === 0) {
              return undefined;
            }
            const items: ReferenceHit[] = hits.map((h) => ({
              p: h.occ.path,
              l: h.occ.line,
              r: h.occ.role,
              ...(h.occ.e_name !== null && { e: h.occ.e_name }),
              ...flags(h),
            }));
            const capped = capCut(items, maxTokens);
            return {
              hits: capped.items,
              ...(omitted > 0 && { omitted }),
              ...(capped.cut && { truncated: true as const }),
              ...(candidates !== undefined && { candidates }),
              ...(more > 0 && { moreCandidates: more }),
            };
          });

        const findCallers: QueryServiceShape['findCallers'] = (
          name,
          {
            path: file,
            maxTokens = DEFAULT_MAX_TOKENS,
            includeUnresolved,
            within,
            excludeSpecs,
          } = {},
        ) =>
          Effect.gen(function* () {
            const { targets, hits, omitted, candidates, more } =
              yield* matching(name, file, ['call', 'new'], includeUnresolved, {
                within,
                excludeSpecs,
              });
            if (targets.length === 0 && hits.length === 0 && omitted === 0) {
              return undefined;
            }
            const groups = new Map<string, CallerHit>();
            for (const h of hits) {
              const key = `${h.occ.path}\0${h.occ.e_id ?? 'top'}\0${Number(h.unresolved)}`;
              const g = groups.get(key);
              if (g !== undefined) {
                (g.calls as number[]).push(h.occ.line);
                continue;
              }
              groups.set(key, {
                n: h.occ.e_name ?? '(top-level)',
                k: h.occ.e_kind ?? 'module',
                p: h.occ.path,
                ...(h.occ.e_start !== null && {
                  l: [h.occ.e_start, h.occ.e_end as number] as const,
                }),
                calls: [h.occ.line],
                ...flags(h),
              });
            }
            const capped = capCut([...groups.values()], maxTokens);
            return {
              hits: capped.items,
              ...(omitted > 0 && { omitted }),
              ...(capped.cut && { truncated: true as const }),
              ...(candidates !== undefined && { candidates }),
              ...(more > 0 && { moreCandidates: more }),
            };
          });

        const findCallees: QueryServiceShape['findCallees'] = (
          name,
          { path: file, maxTokens = DEFAULT_MAX_TOKENS, onlyResolved } = {},
        ) =>
          Effect.gen(function* () {
            const resolved = yield* resolveSymbol(name, file);
            if (resolved.candidates !== undefined) {
              return candidatesOf(resolved);
            }
            if (resolved.targets.length === 0) return undefined;
            const r = makeResolver();
            const out: CalleeHit[] = [];
            // A class also owns the calls of its member methods.
            const sources: Def[] = [];
            for (const t of resolved.targets) {
              sources.push(t);
              if (t.k === 'class') {
                const members = yield* db.all<DefRow>(
                  `SELECT s.id, s.name, s.kind, s.start_line, s.end_line, s.owner, f.path
                   FROM symbols s JOIN files f ON f.id = s.file_id
                   WHERE s.owner = ? AND f.path = ? ORDER BY s.id`,
                  [t.n, t.p],
                );
                sources.push(...members.map(toDef));
              }
            }
            for (const t of sources) {
              const occs = yield* db.all<OccRow>(
                `SELECT o.name, o.qualifier, o.role, o.line, o.col, f.path,
                        o.binding, o.receiver_type, NULL AS e_id, NULL AS e_name, NULL AS e_kind,
                        NULL AS e_start, NULL AS e_end
                 FROM occurrences o JOIN files f ON f.id = o.file_id
                 WHERE o.enclosing_symbol_id = ? AND o.role IN ('call','new')
                 ORDER BY o.line, o.col`,
                [t.id],
              );
              for (const occ of occs) {
                const defs = yield* r.resolve(
                  occ.path,
                  occ.name,
                  occ.qualifier,
                  occ.receiver_type ?? null,
                );
                out.push({
                  from: t.n,
                  ...(t.o !== null && { o: t.o }),
                  p: t.p,
                  n:
                    occ.qualifier === null
                      ? occ.name
                      : `${occ.qualifier}.${occ.name}`,
                  l: occ.line,
                  r: occ.role,
                  ...(defs.length > 0
                    ? {
                        to: defs.map((d) => ({
                          n: d.n,
                          k: d.k,
                          p: d.p,
                          l: d.l,
                        })),
                      }
                    : { u: true as const }),
                  ...(defs.length > 1 && { a: true as const }),
                });
              }
            }
            out.sort((a, b) => Number(a.u === true) - Number(b.u === true));
            return cap(
              onlyResolved === true ? out.filter((c) => c.u !== true) : out,
              maxTokens,
            );
          });

        const findImporters: QueryServiceShape['findImporters'] = (
          target,
          { maxTokens = DEFAULT_MAX_TOKENS, within, excludeSpecs } = {},
        ) =>
          Effect.gen(function* () {
            const asPath = normalizePath(target);
            const file = yield* db.get<{ path: string }>(
              'SELECT path FROM files WHERE path = ?',
              [asPath],
            );
            if (
              file === undefined &&
              !target.startsWith('.') &&
              !/\.[a-z]+$/i.test(target)
            ) {
              const known = new Set(
                (yield* db.all<{ path: string }>('SELECT path FROM files')).map(
                  (r) => r.path,
                ),
              );
              const resolvedPath = resolveSpecifier('', target, known, aliases);
              const viaSpec =
                resolvedPath !== null
                  ? yield* importerHits([resolvedPath])
                  : yield* importersBySpecifier(target);
              const scoped = viaSpec.filter((h) =>
                inScope(h.p, { within, excludeSpecs }),
              );
              if (scoped.length > 0) return cap(scoped, maxTokens);
            }
            const symbol = file === undefined ? target : undefined;
            let paths: string[] = [];
            if (file !== undefined) paths = [file.path];
            else {
              const resolved = yield* resolveSymbol(target);
              if (resolved.candidates !== undefined) {
                return candidatesOf(resolved);
              }
              paths = [...new Set(resolved.targets.map((t) => t.p))];
            }
            if (paths.length === 0) return undefined;
            const out = (yield* importerHits(paths, symbol)).filter((h) =>
              inScope(h.p, { within, excludeSpecs }),
            );
            return cap(out, maxTokens);
          });

        const findImplementations: QueryServiceShape['findImplementations'] = (
          name,
          {
            path: file,
            maxTokens = DEFAULT_MAX_TOKENS,
            relation,
            within,
            excludeSpecs,
          } = {},
        ) =>
          Effect.gen(function* () {
            const r = makeResolver();
            const resolved = yield* resolveSymbol(name, file);
            name = resolved.name;
            let targets = resolved.targets;
            const defined = targets.length > 0;
            const seen = new Set(targets.map((t) => t.id));
            const out: ImplHit[] = [];
            const emitted = new Set<string>();
            // With no definition found, fall back to relations naming it
            // (reported as unresolved).
            if (targets.length === 0) targets = [placeholder(name)];
            for (
              let depth = 0;
              depth < MAX_DEPTH && targets.length > 0;
              depth++
            ) {
              const ids = new Set(targets.map((t) => t.id));
              const names = [...new Set(targets.map((t) => t.n))];
              const next: Def[] = [];
              for (const n of names) {
                const rels = yield* db.all<RelRow>(
                  `SELECT r.kind AS rel, r.target_name, r.target_qualifier,
                          s.id, s.name, s.kind, s.start_line, s.end_line, s.owner, f.path
                   FROM relations r JOIN symbols s ON s.id = r.symbol_id
                   JOIN files f ON f.id = r.file_id
                   WHERE r.target_name = ? ORDER BY f.path, s.start_line`,
                  [n],
                );
                for (const rel of rels) {
                  const defs = yield* r.resolve(
                    rel.path,
                    rel.target_name,
                    rel.target_qualifier,
                  );
                  const unresolved = defs.length === 0;
                  if (!unresolved && !defs.some((d) => ids.has(d.id))) continue;
                  const impl = toDef(rel);
                  // key by the relation itself, not the shared placeholder id
                  const key = `${rel.rel}\0${impl.id}\0${rel.target_name}\0${rel.target_qualifier ?? ''}`;
                  if (emitted.has(key)) continue;
                  emitted.add(key);
                  out.push({
                    n: impl.n,
                    k: impl.k,
                    p: impl.p,
                    l: impl.l,
                    rel: rel.rel,
                    ...(depth > 0 && { d: depth + 1 }),
                    ...(defs.length > 1 && { a: true as const }),
                    ...(unresolved && { u: true as const }),
                  });
                  if (!unresolved && !seen.has(impl.id)) {
                    seen.add(impl.id);
                    next.push(impl);
                  }
                }
              }
              targets = next;
            }
            if (!defined && out.length === 0) return undefined;
            out.sort((a, b) => Number(a.u === true) - Number(b.u === true));
            const groups: ImplGroups = {};
            let budget = maxTokens;
            for (const rel of ['extends', 'implements', 'satisfies'] as const) {
              if (relation !== undefined && relation !== rel) continue;
              const bucket = out.filter(
                (hit) =>
                  hit.rel === rel && inScope(hit.p, { within, excludeSpecs }),
              );
              if (bucket.length === 0) continue;
              const kept = budget > 0 ? cap(bucket, budget) : [];
              if (kept.length > 0) {
                groups[rel] = kept;
                budget -= estimateTokens(JSON.stringify(kept));
              }
              if (kept.length < bucket.length) groups.truncated = true;
            }
            if (resolved.candidates !== undefined) {
              groups.candidates = resolved.candidates;
              if (resolved.more > 0) groups.moreCandidates = resolved.more;
            }
            return groups;
          });

        // Reads files from disk (the db stores no content): `text` reflects
        // edits made after the last index, while `e` may be stale.
        const searchText: QueryServiceShape['searchText'] = (
          pattern,
          {
            regex = false,
            caseSensitive = false,
            within,
            excludeSpecs,
            limit = 50,
            maxTokens = DEFAULT_MAX_TOKENS,
          } = {},
        ) =>
          Effect.gen(function* () {
            let re: RegExp;
            try {
              re = new RegExp(
                regex
                  ? pattern
                  : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                caseSensitive ? '' : 'i',
              );
            } catch (e) {
              return yield* new InvalidPattern({
                message: e instanceof Error ? e.message : String(e),
              });
            }
            const scope: Scope = {
              within: within === undefined ? undefined : normalizePath(within),
              excludeSpecs,
            };
            const paths = (yield* db.all<{ path: string }>(
              'SELECT path FROM files ORDER BY path',
            ))
              .map((r) => r.path)
              .filter((p) => inScope(p, scope));
            const hits: TextHit[] = [];
            let truncated = false;
            for (const p of paths) {
              if (hits.length >= limit) {
                truncated = true;
                break;
              }
              const content = yield* fs
                .readFileString(path.join(root, p))
                .pipe(Effect.orElseSucceed(() => undefined));
              if (content === undefined) continue;
              const found: { l: number; text: string }[] = [];
              const lines = content.split(/\r?\n/);
              for (let i = 0; i < lines.length; i++) {
                if (!re.test(lines[i])) continue;
                const t = lines[i].trim();
                found.push({
                  l: i + 1,
                  text: t.length > 200 ? `${t.slice(0, 200)}…` : t,
                });
              }
              if (found.length === 0) continue;
              const syms = yield* db.all<{
                name: string;
                start_line: number;
                end_line: number;
              }>(
                `SELECT s.name, s.start_line, s.end_line FROM symbols s
                 JOIN files f ON f.id = s.file_id WHERE f.path = ?`,
                [p],
              );
              for (const f of found) {
                if (hits.length >= limit) {
                  truncated = true;
                  break;
                }
                let best: (typeof syms)[number] | undefined;
                for (const s of syms) {
                  if (s.start_line > f.l || s.end_line < f.l) continue;
                  if (
                    best === undefined ||
                    s.end_line - s.start_line < best.end_line - best.start_line
                  )
                    best = s;
                }
                hits.push(
                  best === undefined
                    ? { p, l: f.l, text: f.text }
                    : { p, l: f.l, text: f.text, e: best.name },
                );
              }
            }
            const capped = capCut(hits, maxTokens);
            return capped.cut || truncated
              ? { hits: capped.items, truncated: true as const }
              : { hits: capped.items };
          });

        return QueryService.of({
          searchText,
          searchSymbols,
          fileOutline,
          symbolContext,
          findReferences,
          findCallers,
          findCallees,
          findImporters,
          findImplementations,
        });
      }),
    );
}
