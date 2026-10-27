import { Console, Context, Effect, FileSystem, Layer, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { symbolFromDefinition } from '../db/models';
import { SqliteClient, SqliteError } from '../db/sqlite-client';
import { QueryUtil } from '../query-util';
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

            let done = 0;
            let skipped = 0;
            for (const file of changed) {
              // A file that fails to parse is skipped (logged to stderr), not fatal.
              const failure = yield* Effect.tryPromise(() =>
                QueryUtil.definitionsInFile(path.join(root, file.path)),
              ).pipe(
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
              const definitions = failure.value;
              yield* db.transaction(
                Effect.gen(function* () {
                  // Delete + insert (not update): FTS path is not renamed.
                  yield* db.run('DELETE FROM files WHERE path = ?', [
                    file.path,
                  ]);
                  const { lastInsertRowid } = yield* db.run(
                    'INSERT INTO files (path, content_hash, language) VALUES (?, ?, ?)',
                    [file.path, file.contentHash, file.language],
                  );
                  for (const definition of definitions) {
                    const symbol = symbolFromDefinition(
                      lastInsertRowid,
                      definition,
                      definition.owner,
                    );
                    yield* db.run(
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
                  }
                }),
              );
              done += 1;
              yield* progress(done, total, skipped);
            }
          }),
        );

      return IndexerService.of({ indexProject });
    }),
  );
}
