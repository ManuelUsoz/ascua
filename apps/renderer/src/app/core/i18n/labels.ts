import type { Translation } from '@jsverse/transloco';
import type { UiLabelKey, UiLabels } from '@ascua/ipc';
import { CATALOGS } from './loader';

type Catalogs = Record<string, () => Promise<Translation>>;

function lookup(tree: unknown, path: string[]): string | undefined {
  let node: unknown = tree;
  for (const part of path) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' && node ? node : undefined;
}

/**
 * The visible text of `keys` in `lang`, read straight from the catalogs (no
 * Transloco state). `scope.x.y` comes from `<scope>/<lang>`, anything else from
 * the root catalog. Each catalog is loaded once; missing keys are left out.
 */
export async function resolveLabels(
  keys: readonly UiLabelKey[],
  lang: string,
  catalogs: Catalogs = CATALOGS,
): Promise<UiLabels> {
  const loaded = new Map<string, Promise<Translation | undefined>>();
  const catalog = (path: string): Promise<Translation | undefined> => {
    let found = loaded.get(path);
    if (!found) {
      const load = catalogs[path];
      found = load ? load().catch(() => undefined) : Promise.resolve(undefined);
      loaded.set(path, found);
    }
    return found;
  };

  const labels: UiLabels = {};
  await Promise.all(
    keys.map(async (key) => {
      const [head, ...rest] = key.split('.');
      const scoped = `${head}/${lang}` in catalogs;
      const tree = await catalog(scoped ? `${head}/${lang}` : lang);
      const value = lookup(tree, scoped ? rest : [head, ...rest]);
      if (value) labels[key] = value;
    }),
  );
  return labels;
}
