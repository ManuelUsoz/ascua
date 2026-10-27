import { isSpecPath } from './ranking';

export interface Scope {
  /** Root-relative path prefix of the files to keep. */
  readonly within?: string;
  readonly excludeSpecs?: boolean;
}

const normalize = (p: string): string =>
  p.replaceAll('\\', '/').replace(/^(\.\/)+/, '');

/** True when `path` passes the `within` prefix and spec filters. */
export const inScope = (path: string, scope: Scope): boolean => {
  if (scope.within !== undefined && !path.startsWith(normalize(scope.within))) {
    return false;
  }
  return !(scope.excludeSpecs === true && isSpecPath(path));
};
