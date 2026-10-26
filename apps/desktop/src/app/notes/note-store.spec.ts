import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteAccessError, NoteStore } from './note-store';

describe('NoteStore', () => {
  let base: string;
  let dir: string;
  const trash = vi.fn(async () => undefined);
  const make = () => new NoteStore(dir, trash);

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'ascua-notes-'));
    dir = join(base, 'notes');
    trash.mockClear();
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('lists nothing when the folder does not exist', async () => {
    expect(await make().list()).toEqual([]);
  });

  it('creates a note with a default title and the folder on first use', async () => {
    const note = await make().create('Ideas');
    expect(note.text).toBe('# Ideas\n');
    expect(readFileSync(join(dir, 'Ideas.md'), 'utf8')).toBe('# Ideas\n');
  });

  it('rejects duplicate names ignoring case', async () => {
    const store = make();
    await store.create('Ideas');
    await expect(store.create('ideas')).rejects.toMatchObject({
      code: 'note.exists',
    });
  });

  it('rejects invalid names and path traversal', async () => {
    const store = make();
    await expect(store.create('')).rejects.toMatchObject({
      code: 'note.nameRequired',
    });
    await expect(store.create('a/b')).rejects.toMatchObject({
      code: 'note.nameInvalid',
    });
    await expect(store.read('../secret')).rejects.toBeInstanceOf(
      NoteAccessError,
    );
    await expect(store.save('..\\x', 'a')).rejects.toMatchObject({
      code: 'note.nameInvalid',
    });
  });

  it('saves with the current version and reports a conflict on a stale one', async () => {
    const store = make();
    const note = await store.create('A');
    const saved = await store.save('A', 'nuevo', note.version);
    expect(saved).toMatchObject({ ok: true });
    expect(readFileSync(join(dir, 'A.md'), 'utf8')).toBe('nuevo');
    expect(await store.save('A', 'otro', note.version)).toEqual({
      ok: false,
      conflict: true,
    });
  });

  it('refuses notes over 1 MiB', async () => {
    const store = make();
    await store.create('Big');
    await expect(
      store.save('Big', 'x'.repeat(1024 * 1024 + 1)),
    ).rejects.toMatchObject({ code: 'note.tooLarge' });
  });

  it('lists headings and distinct links, only .md files, sorted', async () => {
    const store = make();
    await store.create('B');
    await store.create('A', '# A\n\n## Parte\n[[B]] [[B#x]] [[C]]\n');
    writeFileSync(join(dir, 'ignored.txt'), 'x');
    const list = await store.list();
    expect(list.map((n) => n.name)).toEqual(['A', 'B']);
    expect(list[0].headings.map((h) => h.text)).toEqual(['A', 'Parte']);
    expect(list[0].links).toEqual(['B', 'C']);
  });

  it('sends removed notes to the trash', async () => {
    const store = make();
    await store.create('A');
    await store.remove('A');
    expect(trash).toHaveBeenCalledWith(join(dir, 'A.md'));
  });

  it('renames a note and rewrites links, leaving code alone', async () => {
    const store = make();
    await store.create('Viejo', '# Viejo\n\n[[Viejo]] y `[[Viejo]]`\n');
    await store.create('Otra', 'ver [[Viejo#H|alias]]\n```\n[[Viejo]]\n```\n');
    await store.create('Libre', 'nada\n');
    const result = await store.rename('Viejo', 'Nuevo');
    expect(result).toEqual({ name: 'Nuevo', updatedNotes: 1 });
    expect(readdirSync(dir).sort()).toEqual([
      'Libre.md',
      'Nuevo.md',
      'Otra.md',
    ]);
    expect(readFileSync(join(dir, 'Otra.md'), 'utf8')).toBe(
      'ver [[Nuevo#H|alias]]\n```\n[[Viejo]]\n```\n',
    );
    expect(readFileSync(join(dir, 'Nuevo.md'), 'utf8')).toBe(
      '# Viejo\n\n[[Nuevo]] y `[[Viejo]]`\n',
    );
  });

  it('renames when the given name differs in case from the file', async () => {
    const store = make();
    await store.create('Arquitectura');
    // On case-sensitive file systems the lowercase name is simply not found.
    const insensitive = await store.read('arquitectura').then(
      () => true,
      () => false,
    );
    const from = insensitive ? 'arquitectura' : 'Arquitectura';
    expect(await store.rename(from, 'ARQUITECTURA')).toEqual({
      name: 'ARQUITECTURA',
      updatedNotes: 0,
    });
    expect(readdirSync(dir)).toEqual(['ARQUITECTURA.md']);
  });

  it('renames only the case of a note', async () => {
    const store = make();
    await store.create('ideas');
    await store.create('Otra', '[[ideas]]\n');
    expect(await store.rename('ideas', 'Ideas')).toEqual({
      name: 'Ideas',
      updatedNotes: 1,
    });
    expect(readdirSync(dir).sort()).toEqual(['Ideas.md', 'Otra.md']);
    expect(readFileSync(join(dir, 'Otra.md'), 'utf8')).toBe('[[Ideas]]\n');
  });

  it('refuses to rename onto another note or to an invalid name', async () => {
    const store = make();
    await store.create('A');
    await store.create('Beta');
    await expect(store.rename('A', 'beta')).rejects.toMatchObject({
      code: 'note.exists',
    });
    await expect(store.rename('A', 'a/b')).rejects.toMatchObject({
      code: 'note.nameInvalid',
    });
    expect(readdirSync(dir).sort()).toEqual(['A.md', 'Beta.md']);
  });

  it('rejects renaming a missing note', async () => {
    const store = make();
    await store.create('A');
    await expect(store.rename('Nope', 'B')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('reports a missing note as ENOENT', async () => {
    const store = make();
    await store.create('A');
    await expect(store.read('Nope')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
