import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '@ascua/assistant';
import { FileAccessError } from '../../files/project-files';
import { filesCapability } from './files-capability';

const ctx = { signal: new AbortController().signal };
const big = 'a'.repeat(70_000);

const registry = new ToolRegistry(
  [
    filesCapability({
      list: async (_p, dir) => {
        if (dir === '..') throw new FileAccessError('file.outside');
        return [{ name: 'a.ts', path: 'a.ts', dir: false }];
      },
      index: async () => ({
        files: ['src/A.ts', 'src/b.ts', 'src/c.ts', 'README.md'],
        truncated: true,
      }),
      read: async (_p, path) => {
        if (path === 'bin') return { kind: 'binary', size: 9 };
        if (path === 'huge') return { kind: 'too-large', size: 5e6 };
        return {
          kind: 'text',
          text: path === 'big' ? big : 'hola',
          size: 4,
          version: 'v',
          editable: true,
          openable: true,
        };
      },
    }),
  ],
  { confirm: async () => false },
);

describe('filesCapability', () => {
  it('is read only', () => {
    expect(registry.list().every((t) => t.effect === 'read')).toBe(true);
    expect(registry.list().map((t) => t.name)).toEqual([
      'files_list_dir',
      'files_search',
      'files_read',
    ]);
  });

  it('lists a dir and maps path escapes to invalid input', async () => {
    expect(
      await registry.call('files_list_dir', { projectId: 'p' }, ctx),
    ).toMatchObject({
      ok: true,
    });
    expect(
      await registry.call('files_list_dir', { projectId: 'p', dir: '..' }, ctx),
    ).toMatchObject({ ok: false, error: 'invalidInput' });
  });

  it('searches case-insensitively, caps and passes truncated through', async () => {
    const r = await registry.call(
      'files_search',
      { projectId: 'p', query: 'SRC/', limit: 2 },
      ctx,
    );
    expect(r).toEqual({
      ok: true,
      value: { files: ['src/A.ts', 'src/b.ts'], more: true, truncated: true },
    });
  });

  it('reads text capped at 60k and returns only kind and size for others', async () => {
    const t = await registry.call(
      'files_read',
      { projectId: 'p', path: 'big' },
      ctx,
    );
    expect(t).toMatchObject({ ok: true, value: { truncated: true } });
    expect((t as { value: { text: string } }).value.text).toHaveLength(60_000);
    expect(
      await registry.call('files_read', { projectId: 'p', path: 'bin' }, ctx),
    ).toEqual({
      ok: true,
      value: { kind: 'binary', size: 9 },
    });
    expect(
      await registry.call('files_read', { projectId: 'p', path: 'huge' }, ctx),
    ).toEqual({
      ok: true,
      value: { kind: 'too-large', size: 5e6 },
    });
  });
});
