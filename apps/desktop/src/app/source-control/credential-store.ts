import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Credential, ProviderId } from '@ascua/source-control';

type Stored = Partial<Record<ProviderId, string>>;

/**
 * Credentials encrypted with the OS keychain (safeStorage). Without
 * encryption they live in memory only and are never written to disk.
 */
export class CredentialStore {
  private memory: Partial<Record<ProviderId, Credential>> = {};

  private file(): string {
    return join(app.getPath('userData'), 'source-control.json');
  }

  private readAll(): Stored {
    try {
      const file = this.file();
      if (existsSync(file)) {
        return JSON.parse(readFileSync(file, 'utf8')) as Stored;
      }
    } catch {
      // Best-effort.
    }
    return {};
  }

  private writeAll(all: Stored): void {
    try {
      mkdirSync(app.getPath('userData'), { recursive: true });
      writeFileSync(this.file(), JSON.stringify(all));
    } catch {
      // Persistence is best-effort.
    }
  }

  load(provider: ProviderId): Credential | null {
    const cached = this.memory[provider];
    if (cached) return cached;
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const raw = this.readAll()[provider];
      if (!raw) return null;
      const json = safeStorage.decryptString(Buffer.from(raw, 'base64'));
      const credential = JSON.parse(json) as Credential;
      return credential.accessToken ? credential : null;
    } catch {
      return null;
    }
  }

  save(credential: Credential): void {
    this.memory[credential.provider] = credential;
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn(
        'safeStorage unavailable: source-control credential kept in memory only',
      );
      return;
    }
    try {
      const all = this.readAll();
      all[credential.provider] = safeStorage
        .encryptString(JSON.stringify(credential))
        .toString('base64');
      this.writeAll(all);
    } catch {
      console.warn('Could not persist source-control credential');
    }
  }

  clear(provider: ProviderId): void {
    delete this.memory[provider];
    const all = this.readAll();
    if (provider in all) {
      delete all[provider];
      this.writeAll(all);
    }
  }
}
