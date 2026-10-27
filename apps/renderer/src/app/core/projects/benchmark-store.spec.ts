import { TestBed } from '@angular/core/testing';
import type { AscuaApi, BenchmarkProgress } from '@ascua/ipc';
import { vi } from 'vitest';
import { ASCUA_API } from '../bridge/ascua-api';
import { BenchmarkStore } from './benchmark-store';

function setup(runBenchmark: () => Promise<unknown>) {
  let push: (p: BenchmarkProgress) => void = () => undefined;
  const api = {
    runBenchmark: vi.fn(runBenchmark),
    onBenchmarkProgress: (cb: (p: BenchmarkProgress) => void) => {
      push = cb;
      return () => undefined;
    },
  } as unknown as AscuaApi;
  TestBed.configureTestingModule({
    providers: [{ provide: ASCUA_API, useValue: api }],
  });
  return {
    store: TestBed.inject(BenchmarkStore),
    push: (p: BenchmarkProgress) => push(p),
  };
}

describe('BenchmarkStore', () => {
  it('tracks progress of the running project and keeps the report', async () => {
    let finish: (v: unknown) => void = () => undefined;
    const { store, push } = setup(() => new Promise((r) => (finish = r)));
    const run = store.run('a');
    expect(store.running()).toBe(true);
    push({ projectId: 'b', done: 9, total: 9 });
    expect(store.progress()).toEqual({ done: 0, total: 0 });
    push({ projectId: 'a', done: 2, total: 5 });
    expect(store.progress()).toEqual({ done: 2, total: 5 });
    finish({ cases: [], perTool: [] });
    await run;
    expect(store.running()).toBe(false);
    expect(store.report()).toEqual({ cases: [], perTool: [] });
  });

  it('keeps an error result', async () => {
    const { store } = setup(async () => ({ code: 'indexer.benchFailed' }));
    await store.run('a');
    expect(store.error()?.code).toBe('indexer.benchFailed');
    expect(store.report()).toBeUndefined();
  });
});
