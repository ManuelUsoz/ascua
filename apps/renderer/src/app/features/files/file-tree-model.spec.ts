import type { FileEntry } from '@ascua/ipc';
import { describe, expect, it } from 'vitest';
import { filterIndex, visibleRows } from './file-tree-model';

const e = (path: string, dir = false): FileEntry => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  dir,
});

describe('visibleRows', () => {
  const children = new Map<string, FileEntry[]>([
    ['', [e('web', true), e('README.md')]],
    ['web', [e('web/src', true), e('web/index.ts')]],
    ['web/src', [e('web/src/app.ts')]],
  ]);

  it('shows only the root when nothing is expanded', () => {
    expect(visibleRows(children, new Set()).map((r) => r.entry.path)).toEqual(['web', 'README.md']);
  });

  it('nests expanded directories with their depth', () => {
    const rows = visibleRows(children, new Set(['web', 'web/src']));
    expect(rows.map((r) => [r.entry.path, r.depth])).toEqual([
      ['web', 0],
      ['web/src', 1],
      ['web/src/app.ts', 2],
      ['web/index.ts', 1],
      ['README.md', 0],
    ]);
  });

  it('skips expanded directories that are not loaded yet', () => {
    expect(visibleRows(children, new Set(['web/src'])).length).toBe(2);
  });
});

describe('filterIndex', () => {
  const files = ['docs/index.md', 'src/index.ts', 'index-notes/readme.md', 'README.md'];

  it('is case-insensitive and puts basename matches first', () => {
    expect(filterIndex(files, 'INDEX')).toEqual([
      'docs/index.md',
      'src/index.ts',
      'index-notes/readme.md',
    ]);
  });

  it('returns nothing for a blank query and honours the limit', () => {
    expect(filterIndex(files, '  ')).toEqual([]);
    expect(filterIndex(files, 'index', 1)).toEqual(['docs/index.md']);
  });
});
