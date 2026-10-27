import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCached } from './cached-fetch';
import { ModelCache, type BlobStore, type StoredBlob } from './model-cache';

function memoryCache() {
  const map = new Map<string, StoredBlob>();
  const store: BlobStore = {
    get: (k) => Promise.resolve(map.get(k)),
    set: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
  };
  return { cache: new ModelCache(store), map };
}

function respond(bytes: number[]) {
  return vi.fn().mockResolvedValue(new Response(new Uint8Array(bytes)));
}

describe('fetchCached', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a cache hit without fetching', async () => {
    const { cache, map } = memoryCache();
    map.set('u', { body: new Uint8Array([1, 2]).buffer, type: '' });
    const fetchMock = respond([]);
    vi.stubGlobal('fetch', fetchMock);
    const body = await fetchCached('u', cache);
    expect(new Uint8Array(body)).toEqual(new Uint8Array([1, 2]));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches on a miss, reports progress and stores the file', async () => {
    const { cache, map } = memoryCache();
    vi.stubGlobal('fetch', respond([1, 2, 3]));
    const progress: [number, number][] = [];
    const body = await fetchCached('u', cache, {
      bytes: 3,
      onProgress: (l, t) => progress.push([l, t]),
    });
    expect(new Uint8Array(body)).toEqual(new Uint8Array([1, 2, 3]));
    expect(progress.at(-1)).toEqual([3, 3]);
    expect(map.has('u')).toBe(true);
  });

  it('rejects a size mismatch and stores nothing', async () => {
    const { cache, map } = memoryCache();
    vi.stubGlobal('fetch', respond([1, 2]));
    await expect(fetchCached('u', cache, { bytes: 3 })).rejects.toThrow(
      /size mismatch/,
    );
    expect(map.size).toBe(0);
  });

  it('passes the abort signal to fetch', async () => {
    const { cache } = memoryCache();
    const fetchMock = vi
      .fn()
      .mockImplementation((_u: string, init: { signal: AbortSignal }) =>
        init.signal.aborted
          ? Promise.reject(new DOMException('aborted', 'AbortError'))
          : Promise.resolve(new Response(new Uint8Array(1))),
      );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchCached('u', cache, { signal: controller.signal }),
    ).rejects.toThrow();
  });
});
