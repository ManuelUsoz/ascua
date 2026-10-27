import { describe, expect, it } from 'vitest';
import { ModelCache, type BlobStore, type StoredBlob } from './model-cache';

class MemoryStore implements BlobStore {
  readonly data = new Map<string, StoredBlob>();
  get(key: string): Promise<StoredBlob | undefined> {
    return Promise.resolve(this.data.get(key));
  }
  set(key: string, value: StoredBlob): Promise<void> {
    this.data.set(key, value);
    return Promise.resolve();
  }
}

describe('ModelCache', () => {
  it('misses when nothing is stored', async () => {
    const cache = new ModelCache(new MemoryStore());
    expect(await cache.match('https://x/a')).toBeUndefined();
  });

  it('keeps body and content-type after put', async () => {
    const cache = new ModelCache(new MemoryStore());
    await cache.put(
      'https://x/a',
      new Response('{"a":1}', {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const hit = await cache.match('https://x/a');
    expect(hit?.headers.get('content-type')).toBe('application/json');
    expect(await hit?.json()).toEqual({ a: 1 });
  });

  it('can be read more than once', async () => {
    const cache = new ModelCache(new MemoryStore());
    await cache.put('u', new Response('abc'));
    expect(await (await cache.match('u'))?.text()).toBe('abc');
    expect(await (await cache.match('u'))?.text()).toBe('abc');
  });
});
