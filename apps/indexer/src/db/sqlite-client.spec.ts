import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { SqliteClient, SqliteError } from './sqlite-client';

const run = <A, E>(program: Effect.Effect<A, E, SqliteClient>): Promise<A> =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(SqliteClient.layer(':memory:')),
      Effect.scoped,
    ) as Effect.Effect<A, never>,
  );

describe('SqliteClient', () => {
  it('runs and reads rows', async () => {
    const rows = await run(
      Effect.gen(function* () {
        const db = yield* SqliteClient;
        yield* db.run(
          'INSERT INTO files (path, content_hash, language) VALUES (?, ?, ?)',
          ['a.ts', 'h', 'typescript'],
        );
        return yield* db.all<{ path: string }>('SELECT path FROM files');
      }),
    );
    expect(rows).toEqual([{ path: 'a.ts' }]);
  });

  it('get returns undefined when missing', async () => {
    const row = await run(
      Effect.flatMap(SqliteClient, (db) => db.get('SELECT * FROM files')),
    );
    expect(row).toBeUndefined();
  });

  it('maps failures to SqliteError', async () => {
    const error = await run(
      Effect.flatMap(SqliteClient, (db) =>
        Effect.flip(db.run('SELECT * FROM nope')),
      ),
    );
    expect(error).toBeInstanceOf(SqliteError);
  });

  it('rolls back a failed transaction', async () => {
    const n = await run(
      Effect.gen(function* () {
        const db = yield* SqliteClient;
        yield* Effect.ignore(
          db.transaction(
            Effect.gen(function* () {
              yield* db.run(
                'INSERT INTO files (path, content_hash, language) VALUES (?, ?, ?)',
                ['a.ts', 'h', 'typescript'],
              );
              return yield* Effect.fail('boom');
            }),
          ),
        );
        const row = yield* db.get<{ n: number }>(
          'SELECT COUNT(*) AS n FROM files',
        );
        return row?.n;
      }),
    );
    expect(n).toBe(0);
  });
});
