import { createHash } from 'node:crypto';
import { Effect, FileSystem, Path, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { SqliteClient, type SqliteError } from '../db/sqlite-client';
import type { Language } from '../db/models';
import { ParserUtil } from '../parser-util';
import { walkFiles } from './walker';

export interface ChangedFile {
  /** Root-relative, forward slashes. */
  readonly path: string;
  readonly contentHash: string;
  readonly language: Language;
}

export interface Changes {
  readonly changed: readonly ChangedFile[];
  /** Indexed paths that no longer exist on disk. */
  readonly deleted: readonly string[];
}

/** Files whose sha256 differs from the stored one, plus vanished paths. */
export const changedFiles = (
  root: string,
): Effect.Effect<
  Changes,
  PlatformError | SqliteError,
  FileSystem.FileSystem | Path.Path | SqliteClient
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const db = yield* SqliteClient;

    const stored = new Map(
      (yield* db.all<{ path: string; content_hash: string }>(
        'SELECT path, content_hash FROM files',
      )).map((row) => [row.path, row.content_hash]),
    );

    const seen = new Set<string>();
    const changed = yield* walkFiles(root).pipe(
      Stream.mapEffect((relative) =>
        Effect.map(fs.readFile(path.join(root, relative)), (bytes) => {
          seen.add(relative);
          return {
            path: relative,
            contentHash: createHash('sha256').update(bytes).digest('hex'),
            language: ParserUtil.grammarOf(relative) as Language,
          } satisfies ChangedFile;
        }),
      ),
      Stream.filter((file) => stored.get(file.path) !== file.contentHash),
      Stream.runCollect,
    );

    const deleted = [...stored.keys()].filter((p) => !seen.has(p));
    return { changed, deleted };
  });
