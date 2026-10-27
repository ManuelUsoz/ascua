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
  ) => Effect.Effect<SymbolHit[], SqliteError>;
  readonly fileOutline: (
    path: string,
  ) => Effect.Effect<OutlineNode[], SqliteError>;
  readonly symbolContext: (
    ref: string | number,
    options?: SearchOptions,
  ) => Effect.Effect<SymbolContext | undefined, SqliteError | PlatformError>;
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

/** Quotes each token; the last one matches by prefix. */
export const toFtsQuery = (input: string): string => {
  const tokens = input.match(/[\p{L}\p{N}_]+/gu) ?? [];
  return tokens
    .map((t, i) => `"${t}"${i === tokens.length - 1 ? '*' : ''}`)
    .join(' ');
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
            if (match === '') return [];
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
            for (const row of rows) {
              const item = hit(row);
              const cost = estimateTokens(JSON.stringify(item));
              if (used + cost > maxTokens) break;
              used += cost;
              out.push(item);
            }
            return out;
          });

        const fileOutline: QueryServiceShape['fileOutline'] = (file) =>
          Effect.gen(function* () {
            const rows = yield* db.all<JoinedRow>(
              `SELECT ${COLUMNS} FROM symbols s
               JOIN files f ON f.id = s.file_id
               WHERE f.path = ? ORDER BY s.start_line`,
              [file.replaceAll('\\', '/')],
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

        return QueryService.of({ searchSymbols, fileOutline, symbolContext });
      }),
    );
}
