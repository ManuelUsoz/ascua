import type { FileEntry } from '@ascua/ipc';

export interface TreeRow {
  entry: FileEntry;
  depth: number;
}

/** Flattens the loaded directories into the rows the tree shows (root dir key is ''). */
export function visibleRows(
  children: ReadonlyMap<string, readonly FileEntry[]>,
  expanded: ReadonlySet<string>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (dir: string, depth: number): void => {
    for (const entry of children.get(dir) ?? []) {
      rows.push({ entry, depth });
      if (entry.dir && expanded.has(entry.path)) walk(entry.path, depth + 1);
    }
  };
  walk('', 0);
  return rows;
}

/** Case-insensitive path filter: basename matches first, then the rest of the path. */
export function filterIndex(files: readonly string[], query: string, limit = 200): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const byName: string[] = [];
  const byPath: string[] = [];
  for (const file of files) {
    const lower = file.toLowerCase();
    if (!lower.includes(q)) continue;
    const base = lower.slice(lower.lastIndexOf('/') + 1);
    (base.includes(q) ? byName : byPath).push(file);
    if (byName.length >= limit) break;
  }
  return [...byName, ...byPath].slice(0, limit);
}
