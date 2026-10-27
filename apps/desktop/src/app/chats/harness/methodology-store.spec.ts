import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_METHODOLOGY, MethodologyStore } from './methodology-store';

describe('MethodologyStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ascua-meth-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('returns the default when nothing is saved', async () => {
    await expect(new MethodologyStore(dir).load('p1')).resolves.toEqual(
      DEFAULT_METHODOLOGY,
    );
  });

  it('saves, reloads and resets', async () => {
    const store = new MethodologyStore(dir);
    const custom = { ...DEFAULT_METHODOLOGY, rules: 'only rule' };
    await store.save('p1', custom);
    await expect(new MethodologyStore(dir).load('p1')).resolves.toEqual(custom);
    await store.reset('p1');
    await expect(store.load('p1')).resolves.toEqual(DEFAULT_METHODOLOGY);
    expect(await readdir(dir)).toEqual([]);
  });

  it('rejects an invalid project id', async () => {
    await expect(new MethodologyStore(dir).load('../x')).rejects.toThrow();
  });
});
