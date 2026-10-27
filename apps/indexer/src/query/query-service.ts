import { Context, Effect, FileSystem, Layer, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { SqliteClient, type SqliteError } from '../db/sqlite-client';

export const DEFAULT_MAX_TOKENS = 2000;

export interface SearchOptions {
  readonly maxTokens?: number;
  readonly limit?: number;
}

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
  ) => Effect.Effect<SymbolContext | undefined, SqliteError | PlatformError>;
  readonly findReferences: (
    name: string,
    options?: RefOptions,
  ) => Effect.Effect<HitsResult<ReferenceHit>, SqliteError>;
  readonly findCallers: (
    name: string,
    options?: RefOptions,
  ) => Effect.Effect<HitsResult<CallerHit>, SqliteError>;
  readonly findCallees: (
    name: string,
    options?: RefOptions,
  ) => Effect.Effect<CalleeHit[], SqliteError>;
  /** `target` is a root-relative file path or a symbol name. */
  readonly findImporters: (
    target: string,
    options?: SearchOptions,
  ) => Effect.Effect<ImporterHit[] | undefined, SqliteError>;
  readonly findImplementations: (
    name: string,
    options?: RefOptions,
  ) => Effect.Effect<ImplHit[], SqliteError>;
}

export interface RefOptions extends SearchOptions {
  /** Root-relative path disambiguating which definition is meant. */
  readonly path?: string;
  /** Keep name-only (unresolved) matches even when resolved ones exist. */
  readonly includeUnresolved?: boolean;
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

        const searchSymbols: QueryServiceShape['searchSymbols'] = (
          query,
          { maxTokens = DEFAULT_MAX_TOKENS, limit = 20 } = {},
        ) =>
          Effect.gen(function* () {
            const match = toFtsQuery(query);
            if (match === '') return { hits: [] };
            const rows = yield* db.all<JoinedRow>(
              `SELECT ${COLUMNS} FROM symbols_fts
               JOIN symbols s ON s.id = symbols_fts.rowid
               JOIN files f ON f.id = s.file_id
               WHERE symbols_fts MATCH ?
               ORDER BY (s.name = ?) DESC, bm25(symbols_fts)
               LIMIT ?`,
              [match, query.trim(), limit],
            );
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
            const normalized = file.replaceAll('\\', '/');
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
          { maxTokens = DEFAULT_MAX_TOKENS } = {},
        ) =>
          Effect.gen(function* () {
            const byId = typeof ref === 'number' || /^\d+$/.test(ref);
            const row = yield* db.get<JoinedRow>(
              `SELECT ${COLUMNS} FROM symbols s
               JOIN files f ON f.id = s.file_id
               WHERE ${byId ? 's.id' : 's.name'} = ?
               ORDER BY s.id LIMIT 1`,
              [byId ? Number(ref) : ref],
            );
            if (row === undefined) return undefined;
            const text = yield* fs.readFileString(path.join(root, row.path));
            const lines = text
              .split(/\r?\n/)
              .slice(row.start_line - 1, row.end_line);
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

        const targetsOf = (name: string, file?: string) =>
          Effect.gen(function* () {
            const rows = yield* db.all<DefRow>(
              `SELECT s.id, s.name, s.kind, s.start_line, s.end_line, s.owner, f.path
               FROM symbols s JOIN files f ON f.id = s.file_id
               WHERE s.name = ? ${file === undefined ? '' : 'AND f.path = ?'}
               ORDER BY s.id`,
              file === undefined ? [name] : [name, file.replaceAll('\\', '/')],
            );
            return rows.map(toDef);
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

        const cap = <T>(items: readonly T[], maxTokens: number): T[] => {
          const out: T[] = [];
          let used = 0;
          for (const item of items) {
            const cost = estimateTokens(JSON.stringify(item));
            if (out.length > 0 && used + cost > maxTokens) break;
            used += cost;
            out.push(item);
          }
          return out;
        };

        /** Occurrences of `name` that resolve to a target (or are unresolved). */
        const matching = (
          name: string,
          file: string | undefined,
          roles: readonly string[] | undefined,
          includeUnresolved = false,
        ) =>
          Effect.gen(function* () {
            const targets = yield* targetsOf(name, file);
            const ids = new Set(targets.map((t) => t.id));
            const r = makeResolver();
            let out: {
              occ: OccRow;
              ambiguous: boolean;
              unresolved: boolean;
            }[] = [];
            for (const occ of yield* occurrencesNamed(name)) {
              if (roles !== undefined && !roles.includes(occ.role)) continue;
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
            if (!includeUnresolved && name.length < 6) {
              out = out.filter((h) => !h.unresolved);
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
            return { targets, hits: out, omitted };
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
          } = {},
        ) =>
          Effect.gen(function* () {
            const { hits, omitted } = yield* matching(
              name,
              file,
              undefined,
              includeUnresolved,
            );
            const items: ReferenceHit[] = hits.map((h) => ({
              p: h.occ.path,
              l: h.occ.line,
              r: h.occ.role,
              ...(h.occ.e_name !== null && { e: h.occ.e_name }),
              ...flags(h),
            }));
            return {
              hits: cap(items, maxTokens),
              ...(omitted > 0 && { omitted }),
            };
          });

        const findCallers: QueryServiceShape['findCallers'] = (
          name,
          {
            path: file,
            maxTokens = DEFAULT_MAX_TOKENS,
            includeUnresolved,
          } = {},
        ) =>
          Effect.gen(function* () {
            const { hits, omitted } = yield* matching(
              name,
              file,
              ['call', 'new'],
              includeUnresolved,
            );
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
            return {
              hits: cap([...groups.values()], maxTokens),
              ...(omitted > 0 && { omitted }),
            };
          });

        const findCallees: QueryServiceShape['findCallees'] = (
          name,
          { path: file, maxTokens = DEFAULT_MAX_TOKENS } = {},
        ) =>
          Effect.gen(function* () {
            const targets = yield* targetsOf(name, file);
            const r = makeResolver();
            const out: CalleeHit[] = [];
            for (const t of targets) {
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
            return cap(out, maxTokens);
          });

        const findImporters: QueryServiceShape['findImporters'] = (
          target,
          { maxTokens = DEFAULT_MAX_TOKENS } = {},
        ) =>
          Effect.gen(function* () {
            const asPath = target.replaceAll('\\', '/');
            const file = yield* db.get<{ path: string }>(
              'SELECT path FROM files WHERE path = ?',
              [asPath],
            );
            const symbol = file === undefined ? target : undefined;
            const paths: string[] =
              file !== undefined
                ? [file.path]
                : [...new Set((yield* targetsOf(target)).map((t) => t.p))];
            if (paths.length === 0) return undefined;
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
            return cap(out, maxTokens);
          });

        const findImplementations: QueryServiceShape['findImplementations'] = (
          name,
          { path: file, maxTokens = DEFAULT_MAX_TOKENS } = {},
        ) =>
          Effect.gen(function* () {
            const r = makeResolver();
            let targets = yield* targetsOf(name, file);
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
            out.sort((a, b) => Number(a.u === true) - Number(b.u === true));
            return cap(out, maxTokens);
          });

        return QueryService.of({
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
