import { posix } from 'node:path';
import { Effect, FileSystem, Path } from 'effect';
import type { PathAlias } from '../query-util';

const CONFIGS = ['tsconfig.base.json', 'tsconfig.json'] as const;

/** Strips line and block comments and trailing commas, which tsconfig allows. */
const parseLoose = (text: string): unknown => {
  const stripped = text
    .replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(stripped);
};

/**
 * `compilerOptions.paths` of the first root tsconfig that has any, as
 * root-relative aliases. Unreadable or malformed configs mean no aliases.
 */
export const readPathAliases = (
  root: string,
): Effect.Effect<
  readonly PathAlias[],
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    for (const name of CONFIGS) {
      const text = yield* fs
        .readFileString(path.join(root, name))
        .pipe(Effect.orElseSucceed(() => ''));
      if (!text) continue;
      try {
        const options = (
          parseLoose(text) as {
            compilerOptions?: {
              baseUrl?: string;
              paths?: Record<string, string[]>;
            };
          }
        ).compilerOptions;
        if (!options?.paths) continue;
        const base = (options.baseUrl ?? '.').replace(/\\/g, '/');
        return Object.entries(options.paths).map(([pattern, targets]) => ({
          pattern,
          targets: targets.map((target) =>
            posix.normalize(posix.join(base, target)),
          ),
        }));
      } catch {
        continue;
      }
    }
    return [];
  });
