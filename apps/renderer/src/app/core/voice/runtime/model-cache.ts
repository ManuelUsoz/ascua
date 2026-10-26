/** Where model files live. Cache Storage throws on file://, so IndexedDB. */
export interface StoredBlob {
  body: ArrayBuffer;
  type: string;
}

export interface BlobStore {
  get(key: string): Promise<StoredBlob | undefined>;
  set(key: string, value: StoredBlob): Promise<void>;
}

/** The transformers.js `customCache` shape. */
export class ModelCache {
  constructor(private readonly store: BlobStore) {}

  async match(url: string): Promise<Response | undefined> {
    const hit = await this.store.get(url);
    if (!hit) return undefined;
    return new Response(hit.body, {
      headers: hit.type ? { 'content-type': hit.type } : {},
    });
  }

  async put(url: string, response: Response): Promise<void> {
    const type = response.headers.get('content-type') ?? '';
    const body = await response.arrayBuffer();
    await this.store.set(url, { body, type });
  }
}

const DB_NAME = 'ascua-voice-models';
const STORE = 'files';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IdbBlobStore implements BlobStore {
  private db?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  async get(key: string): Promise<StoredBlob | undefined> {
    const db = await this.open();
    const value = await request(
      db.transaction(STORE, 'readonly').objectStore(STORE).get(key),
    );
    return value as StoredBlob | undefined;
  }

  async set(key: string, value: StoredBlob): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}

export function createModelCache(): ModelCache {
  return new ModelCache(new IdbBlobStore());
}

export function deleteModelCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
