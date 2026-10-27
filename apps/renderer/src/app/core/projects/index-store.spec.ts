import { TestBed } from '@angular/core/testing';
import type { AscuaApi, IndexProgress } from '@ascua/ipc';
import { vi } from 'vitest';
import { ASCUA_API } from '../bridge/ascua-api';
import { IndexStore } from './index-store';

function setup(indexProject: () => Promise<unknown>) {
  let push: (p: IndexProgress) => void = () => undefined;
  const api = {
    indexProject: vi.fn(indexProject),
    onIndexProgress: (cb: (p: IndexProgress) => void) => {
      push = cb;
      return () => undefined;
    },
  } as unknown as AscuaApi;
  TestBed.configureTestingModule({
    providers: [{ provide: ASCUA_API, useValue: api }],
  });
  return {
    store: TestBed.inject(IndexStore),
    api,
    push: (p: IndexProgress) => push(p),
  };
}

describe('IndexStore', () => {
  it('tracks pushed progress per project', async () => {
    const { store, push, api } = setup(async () => undefined);
    await store.start('a');
    expect(api.indexProject).toHaveBeenCalledWith('a');
    push({ projectId: 'a', done: 2, total: 5, state: 'running' });
    expect(store.progress('a')?.done).toBe(2);
    expect(store.progress('b')).toBeUndefined();
  });

  it('does not restart a running index', async () => {
    const { store, api } = setup(async () => undefined);
    await store.start('a');
    await store.start('a');
    expect(api.indexProject).toHaveBeenCalledTimes(1);
  });

  it('does not restart a finished index', async () => {
    const { store, api, push } = setup(async () => undefined);
    await store.start('a');
    push({ projectId: 'a', done: 5, total: 5, state: 'done' });
    await store.start('a');
    expect(api.indexProject).toHaveBeenCalledTimes(1);
  });

  it('maps a returned error to the error state', async () => {
    const { store } = setup(async () => ({ code: 'indexer.failed' }));
    await store.start('a');
    expect(store.progress('a')?.state).toBe('error');
    expect(store.progress('a')?.error?.code).toBe('indexer.failed');
  });

  it('tolerates an absent bridge', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: ASCUA_API, useValue: undefined }],
    });
    const store = TestBed.inject(IndexStore);
    await store.start('a');
    expect(store.progress('a')).toBeUndefined();
  });
});
