import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Credential } from '@ascua/source-control';
import {
  SafeStorageCredentialStore,
  type SecretCipher,
} from './credential-store';

const credential: Credential = {
  provider: 'github',
  accessToken: 'gho_secret',
  tokenType: 'bearer',
  scopes: ['repo'],
};

const cipher = (available = true): SecretCipher => ({
  available: () => available,
  encrypt: (s) => Buffer.from(s.split('').reverse().join('')),
  decrypt: (b) => b.toString().split('').reverse().join(''),
});

describe('SafeStorageCredentialStore', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ascua-sc-'));
    file = join(dir, 'source-control.json');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('round trips through disk without storing the token in clear', async () => {
    expect(
      await new SafeStorageCredentialStore(file, cipher()).save(credential),
    ).toBe(true);
    expect(await readFile(file, 'utf8')).not.toContain('gho_secret');
    const fresh = new SafeStorageCredentialStore(file, cipher());
    expect(await fresh.load('github')).toEqual(credential);
    await fresh.remove('github');
    expect(
      await new SafeStorageCredentialStore(file, cipher()).load('github'),
    ).toBe(undefined);
  });

  it('keeps the credential in memory only when the cipher is unavailable', async () => {
    const store = new SafeStorageCredentialStore(file, cipher(false));
    expect(await store.save(credential)).toBe(false);
    expect(await store.load('github')).toEqual(credential);
    await expect(readFile(file, 'utf8')).rejects.toThrow();
  });

  it('treats a corrupt file or entry as absent', async () => {
    await writeFile(file, '{nope');
    expect(
      await new SafeStorageCredentialStore(file, cipher()).load('github'),
    ).toBe(undefined);
    await writeFile(
      file,
      JSON.stringify({ version: 1, credentials: { github: 'AAAA' } }),
    );
    const store = new SafeStorageCredentialStore(file, cipher());
    expect(await store.load('github')).toBe(undefined);
    expect(JSON.parse(await readFile(file, 'utf8')).credentials).toEqual({});
  });
});
