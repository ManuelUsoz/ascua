import { Console, Context, Effect, FileSystem, Layer, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { symbolFromDefinition } from '../db/models';
import { SqliteClient, SqliteError } from '../db/sqlite-client';
import { ParserUtil } from '../parser-util';
import {
  moduleKeyOf,
  QueryUtil,
  resolveSpecifier,
  type Definition,
} from '../query-util';
import { changedFiles } from '../scan/changed-files';

export interface IndexerServiceShape {
  /** Indexes changed files; prints `{done,total}` JSON lines on stdout. */
  readonly indexProject: (
    root: string,
  ) => Effect.Effect<void, PlatformError | SqliteError>;
}

export class IndexerService extends Context.Service<
  IndexerService,
  IndexerServiceShape
>()('indexer/IndexerService') {
  static readonly layer: Layer.Layer<
    IndexerService,
    never,
    SqliteClient | FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    IndexerService,
    Effect.gen(function* () {
      const db = yield* SqliteClient;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(
          Effect.provideService(SqliteClient, db),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ) as Effect.Effect<A, E>;

      const progress = (done: number, total: number, skipped = 0) =>
        Console.log(
          JSON.stringify(
            skipped > 0 ? { done, total, skipped } : { done, total },
          ),
        );

      const indexProject = (root: string) =>
        provide(
          Effect.gen(function* () {
            const { changed, deleted } = yield* changedFiles(root);
            const total = changed.length;
            yield* progress(0, total);

            for (const gone of deleted) {
              yield* db.run('DELETE FROM files WHERE path = ?', [gone]);
            }

            // Every indexed path (unchanged + changed) for import resolution.
            const known = new Set(
              (yield* db.all<{ path: string }>('SELECT path FROM files')).map(
                (row) => row.path,
              ),
            );
            for (const file of changed) known.add(file.path);

            let done = 0;
            let skipped = 0;
            for (const file of changed) {
              // A file that fails to parse is skipped (logged to stderr), not fatal.
              const failure = yield* Effect.tryPromise(async () => {
                const tree = await ParserUtil.parseFile(
                  path.join(root, file.path),
                );
                try {
                  return {
                    definitions: QueryUtil.definitionsIn(tree),
                    imports: QueryUtil.importsIn(tree),
                    occurrences: QueryUtil.occurrencesIn(tree),
                  };
                } finally {
                  tree.delete();
                }
              }).pipe(
                Effect.map((value) => ({ value }) as const),
                Effect.catch((error) => Effect.succeed({ error })),
              );
              if ('error' in failure) {
                skipped += 1;
                const reason =
                  failure.error instanceof Error
                    ? (failure.error.cause ?? failure.error)
                    : failure.error;
                yield* Console.error(
                  `skipped ${file.path}: ${reason instanceof Error ? reason.message : String(reason)}`,
                );
                done += 1;
                yield* progress(done, total, skipped);
                continue;
              }
              const { definitions, imports, occurrences } = failure.value;
              yield* db.transaction(
                Effect.gen(function* () {
                  // Delete + insert (not update): FTS path is not renamed.
                  yield* db.run('DELETE FROM files WHERE path = ?', [
                    file.path,
                  ]);
                  const { lastInsertRowid } = yield* db.run(
                    'INSERT INTO files (path, content_hash, language, module) VALUES (?, ?, ?, ?)',
                    [
                      file.path,
                      file.contentHash,
                      file.language,
                      moduleKeyOf(file.path),
                    ],
                  );
                  const ids = new Map<string, number>();
                  const keyOf = (d: Definition) =>
                    `${d.kind}|${d.name}|${d.startLine}|${d.endLine}`;
                  for (const definition of definitions) {
                    const symbol = symbolFromDefinition(
                      lastInsertRowid,
                      definition,
                      definition.owner,
                    );
                    const inserted = yield* db.run(
                      'INSERT INTO symbols (file_id, name, kind, start_line, end_line, signature, owner) VALUES (?, ?, ?, ?, ?, ?, ?)',
                      [
                        symbol.fileId,
                        symbol.name,
                        symbol.kind,
                        symbol.startLine,
                        symbol.endLine,
                        symbol.signature ?? null,
                        symbol.owner ?? null,
                      ],
                    );
                    ids.set(keyOf(definition), inserted.lastInsertRowid);
                    const heritage = [
                      ['extends', definition.extends],
                      ['implements', definition.implements],
                    ] as const;
                    for (const [kind, refs] of heritage) {
                      for (const ref of refs ?? []) {
                        yield* db.run(
                          'INSERT INTO relations (file_id, symbol_id, kind, target_name, target_qualifier) VALUES (?, ?, ?, ?, ?)',
                          [
                            lastInsertRowid,
                            inserted.lastInsertRowid,
                            kind,
                            ref.name,
                            ref.qualifier ?? null,
                          ],
                        );
                      }
                    }
                  }
                  for (const imp of imports) {
                    const target = resolveSpecifier(
                      file.path,
                      imp.specifier,
                      known,
                    );
                    yield* db.run(
                      'INSERT INTO imports (file_id, kind, local_name, imported_name, specifier, target_path, target_module, line) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                      [
                        lastInsertRowid,
                        imp.kind,
                        imp.localName,
                        imp.importedName,
                        imp.specifier,
                        target,
                        target ? moduleKeyOf(target) : null,
                        imp.line,
                      ],
                    );
                  }
                  for (const occ of occurrences) {
                    yield* db.run(
                      'INSERT INTO occurrences (file_id, name, qualifier, role, line, col, enclosing_symbol_id, binding, receiver_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                      [
                        lastInsertRowid,
                        occ.name,
                        occ.qualifier ?? null,
                        occ.role,
                        occ.line,
                        occ.col,
                        (occ.enclosing && ids.get(keyOf(occ.enclosing))) ??
                          null,
                        occ.binding ?? null,
                        occ.receiverType ?? null,
                      ],
                    );
                  }
                }),
              );
              known.add(file.path);
              done += 1;
              yield* progress(done, total, skipped);
            }

            // Re-resolve imports whose target is missing or was deleted, so a
            // newly added file is found by importers that were not re-parsed.
            const current = new Set(
              (yield* db.all<{ path: string }>('SELECT path FROM files')).map(
                (row) => row.path,
              ),
            );
            const stale = yield* db.all<{
              id: number;
              path: string;
              specifier: string;
              target_path: string | null;
            }>(
              `SELECT i.id, f.path, i.specifier, i.target_path
                 FROM imports i JOIN files f ON f.id = i.file_id
                WHERE i.specifier LIKE '.%'`,
            );
            for (const row of stale) {
              if (row.target_path !== null && current.has(row.target_path)) {
                continue;
              }
              const target = resolveSpecifier(row.path, row.specifier, current);
              if (target === row.target_path) continue;
              yield* db.run(
                'UPDATE imports SET target_path = ?, target_module = ? WHERE id = ?',
                [target, target ? moduleKeyOf(target) : null, row.id],
              );
            }
          }),
        );

      return IndexerService.of({ indexProject });
    }),
  );
}
