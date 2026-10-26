import { TestBed } from '@angular/core/testing';
import type { NoteSummary } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { NoteStore } from './note-store';

const note = (name: string, links: string[] = []): NoteSummary => ({
  name,
  headings: [],
  links,
  updatedAt: 1,
});

function setup(api: unknown): NoteStore {
  TestBed.configureTestingModule({
    providers: [{ provide: ASCUA_API, useValue: api }],
  });
  return TestBed.inject(NoteStore);
}

describe('NoteStore', () => {
  it('loads the notes and finds them case-insensitively', async () => {
    const store = setup({ listNotes: vi.fn(async () => [note('Ideas')]) });
    await store.reload();
    expect(store.loaded()).toBe(true);
    expect(store.byName('ideas')?.name).toBe('Ideas');
    expect(store.byName('nope')).toBeUndefined();
  });

  it('computes backlinks', async () => {
    const store = setup({
      listNotes: vi.fn(async () => [
        note('A', ['b']),
        note('B', ['B']),
        note('C'),
      ]),
    });
    await store.reload();
    expect(store.backlinks('B').map((n) => n.name)).toEqual(['A']);
  });

  it('reloads after create and returns errors as values', async () => {
    const listNotes = vi.fn(async () => [note('X')]);
    const createNote = vi
      .fn()
      .mockResolvedValueOnce({ name: 'X', text: '# X\n', version: 'v' })
      .mockRejectedValueOnce(new Error('boom'));
    const store = setup({ listNotes, createNote });
    await store.reload();
    const ok = await store.create('X');
    expect(ok.ok).toBe(true);
    expect(listNotes).toHaveBeenCalledTimes(3);
    const bad = await store.create('X');
    expect(bad.ok).toBe(false);
  });

  it('reports noDesktop without the bridge', async () => {
    const store = setup(undefined);
    expect(store.available).toBe(false);
    expect(await store.remove('X')).toEqual({
      ok: false,
      error: { code: 'noDesktop' },
    });
  });
});
