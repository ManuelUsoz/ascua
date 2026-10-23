import { readFile } from 'node:fs/promises';
import type { Credential, ProviderId } from '@ascua/source-control';
import { isProviderId } from '@ascua/source-control';
import { writeJsonAtomic } from '../storage/atomic-json';

export interface SecretCipher {
  available(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

/** Subset of Electron's `safeStorage` we use. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(data: Buffer): string;
}

/**
 * The Linux `basic_text` fallback counts as available on purpose (repo
 * decision): the secret is still persisted through safeStorage.
 */
export function electronCipher(safeStorage: SafeStorageLike): SecretCipher {
  return {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (data) => safeStorage.decryptString(data),
  };
}

interface CredentialFile {
  version: 1;
  credentials: Partial<Record<ProviderId, string>>;
}

const isCredential = (value: unknown): value is Credential => {
  const c = value as Partial<Credential> | null;
  return (
    typeof c === 'object' &&
    c !== null &&
    isProviderId(c.provider) &&
    typeof c.accessToken === 'string' &&
    c.accessToken.length > 0
  );
};

export class SafeStorageCredentialStore {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly memory = new Map<ProviderId, Credential>();

  constructor(
    private readonly file: string,
    private readonly cipher: SecretCipher,
  ) {}

  async load(provider: ProviderId): Promise<Credential | undefined> {
    const held = this.memory.get(provider);
    if (held) return held;
    const stored = (await this.read()).credentials[provider];
    if (!stored || !this.cipher.available()) return undefined;
    try {
      const parsed: unknown = JSON.parse(
        this.cipher.decrypt(Buffer.from(stored, 'base64')),
      );
      if (isCredential(parsed) && parsed.provider === provider) {
        this.memory.set(provider, parsed);
        return parsed;
      }
    } catch {
      // Undecryptable: treated as absent.
    }
    await this.remove(provider);
    return undefined;
  }

  /** Resolves to whether the credential reached the disk. */
  save(credential: Credential): Promise<boolean> {
    this.memory.set(credential.provider, credential);
    return this.enqueue(async () => {
      if (!this.cipher.available()) return false;
      const file = await this.read();
      file.credentials[credential.provider] = this.cipher
        .encrypt(JSON.stringify(credential))
        .toString('base64');
      await writeJsonAtomic(this.file, file);
      return true;
    });
  }

  remove(provider: ProviderId): Promise<void> {
    this.memory.delete(provider);
    return this.enqueue(async () => {
      const file = await this.read();
      if (!(provider in file.credentials)) return;
      delete file.credentials[provider];
      await writeJsonAtomic(this.file, file);
    });
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read(): Promise<CredentialFile> {
    try {
      const data = JSON.parse(
        await readFile(this.file, 'utf8'),
      ) as Partial<CredentialFile> | null;
      const raw = data?.credentials;
      const credentials: CredentialFile['credentials'] = {};
      if (raw && typeof raw === 'object') {
        for (const [key, value] of Object.entries(raw)) {
          if (isProviderId(key) && typeof value === 'string') {
            credentials[key] = value;
          }
        }
      }
      return { version: 1, credentials };
    } catch {
      return { version: 1, credentials: {} };
    }
  }
}
