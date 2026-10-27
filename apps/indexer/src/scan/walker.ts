import { Effect, FileSystem, Path, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import ignore, { type Ignore } from 'ignore';
import { ParserUtil } from '../parser-util';

const ALWAYS_SKIPPED: ReadonlySet<string> = new Set(['.git', 'node_modules']);

interface Rules {
  readonly base: string;
  readonly matcher: Ignore;
}

/**
 * Supported source files under `root` as root-relative, forward-slash paths.
 * Honours the root and nested .gitignore files (best effort, via `ignore`).
 */
export const walkFiles = (
  root: string,
): Stream.Stream<string, PlatformError, FileSystem.FileSystem | Path.Path> =>
  walkDir(root, root, []);

const walkDir = (
  root: string,
  dir: string,
  inherited: readonly Rules[],
): Stream.Stream<string, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const gitignore = path.join(dir, '.gitignore');
      const rules = (yield* fs.exists(gitignore))
        ? [
            ...inherited,
            {
              base: dir,
              matcher: ignore().add(yield* fs.readFileString(gitignore)),
            },
          ]
        : inherited;

      const isIgnored = (full: string, isDirectory: boolean): boolean =>
        rules.some(({ base, matcher }) => {
          const relative = path.relative(base, full).split(path.sep).join('/');
          return matcher.ignores(isDirectory ? `${relative}/` : relative);
        });

      const entries = yield* fs.readDirectory(dir);
      const files: string[] = [];
      const directories: string[] = [];
      for (const entry of [...entries].sort()) {
        if (ALWAYS_SKIPPED.has(entry)) continue;
        const full = path.join(dir, entry);
        // Symlinks are not followed: no cycles, no files outside the root.
        const link = yield* Effect.option(fs.readLink(full));
        if (link._tag === 'Some') continue;
        const info = yield* fs.stat(full);
        if (info.type === 'Directory') {
          if (!isIgnored(full, true)) directories.push(full);
        } else if (
          info.type === 'File' &&
          ParserUtil.canParse(entry) &&
          !isIgnored(full, false)
        ) {
          files.push(path.relative(root, full).split(path.sep).join('/'));
        }
      }
      return Stream.concat(
        Stream.fromArray(files),
        Stream.flatMap(Stream.fromArray(directories), (child) =>
          walkDir(root, child, rules),
        ),
      );
    }),
  );
