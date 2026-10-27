import { Context, Data, Effect, Layer } from 'effect';
import type { SQLInputValue } from 'node:sqlite';
import { openDatabase } from './database';

export class SqliteError extends Data.TaggedError('SqliteError')<{
  readonly cause: unknown;
}> {}

export type Params = readonly SQLInputValue[];

export interface SqliteClientShape {
  readonly run: (
    sql: string,
    params?: Params,
  ) => Effect.Effect<{ changes: number; lastInsertRowid: number }, SqliteError>;
  readonly all: <T>(
    sql: string,
    params?: Params,
  ) => Effect.Effect<T[], SqliteError>;
  readonly get: <T>(
    sql: string,
    params?: Params,
  ) => Effect.Effect<T | undefined, SqliteError>;
  /** Runs the effect between BEGIN and COMMIT; rolls back on failure. */
  readonly transaction: <A, E, R>(
    body: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | SqliteError, R>;
  readonly close: Effect.Effect<void>;
}

export class SqliteClient extends Context.Service<
  SqliteClient,
  SqliteClientShape
>()('indexer/SqliteClient') {
  static layer = (file: string): Layer.Layer<SqliteClient, SqliteError> =>
    Layer.effect(
      SqliteClient,
      Effect.acquireRelease(
        Effect.try({
          try: () => openDatabase(file),
          catch: (cause) => new SqliteError({ cause }),
        }),
        (db) =>
          Effect.sync(() => {
            if (db.isOpen) db.close();
          }),
      ).pipe(
        Effect.map((db) => {
          const attempt = <A>(f: () => A) =>
            Effect.try({
              try: f,
              catch: (cause) => new SqliteError({ cause }),
            });
          const exec = (sql: string) => attempt(() => db.exec(sql));
          return SqliteClient.of({
            run: (sql, params = []) =>
              attempt(() => {
                const r = db.prepare(sql).run(...params);
                return {
                  changes: Number(r.changes),
                  lastInsertRowid: Number(r.lastInsertRowid),
                };
              }),
            all: <T>(sql: string, params: Params = []) =>
              attempt(() => db.prepare(sql).all(...params) as T[]),
            get: <T>(sql: string, params: Params = []) =>
              attempt(() => db.prepare(sql).get(...params) as T | undefined),
            transaction: (body) =>
              Effect.uninterruptibleMask((restore) =>
                Effect.flatMap(exec('BEGIN'), () =>
                  restore(body).pipe(
                    Effect.tap(() => exec('COMMIT')),
                    Effect.onError(() => Effect.ignore(exec('ROLLBACK'))),
                  ),
                ),
              ),
            close: Effect.sync(() => {
              if (db.isOpen) db.close();
            }),
          });
        }),
      ),
    );
}
