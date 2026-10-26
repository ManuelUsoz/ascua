import type { ModelCache } from './model-cache';

export interface FetchCachedOptions {
  /** Expected size: a different length rejects and nothing is stored. */
  bytes?: number;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Downloads a model file once and keeps it in the model cache. Used by the
 * Supertonic worker; transformers.js keeps its own `customCache` path.
 */
export async function fetchCached(
  url: string,
  cache: Pick<ModelCache, 'match' | 'put'>,
  options: FetchCachedOptions = {},
): Promise<ArrayBuffer> {
  const { bytes, onProgress, signal } = options;
  const hit = await cache.match(url);
  if (hit) {
    const body = await hit.arrayBuffer();
    onProgress?.(body.byteLength, body.byteLength);
    return body;
  }

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`); // i18n-ignore
  const total = bytes ?? Number(response.headers.get('content-length') ?? 0);
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, total);
    }
  } else {
    const whole = new Uint8Array(await response.arrayBuffer());
    chunks.push(whole);
    loaded = whole.byteLength;
    onProgress?.(loaded, total);
  }
  if (bytes !== undefined && loaded !== bytes) {
    throw new Error(`size mismatch: ${loaded} of ${bytes}`); // i18n-ignore
  }

  const body = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const type = response.headers.get('content-type');
  await cache.put(
    url,
    new Response(body.buffer, {
      headers: type ? { 'content-type': type } : {},
    }),
  );
  return body.buffer;
}
