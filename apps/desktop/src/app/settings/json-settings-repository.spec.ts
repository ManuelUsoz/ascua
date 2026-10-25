import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Language } from '@ascua/ipc';
import { JsonSettingsRepository } from './json-settings-repository';

describe('JsonSettingsRepository', () => {
  let dir: string;
  let file: string;
  const make = (os: Language = 'en') =>
    new JsonSettingsRepository(file, () => os);

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ascua-settings-'));
    file = join(dir, 'settings.json');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('gives the OS language and writes nothing when the file is missing', async () => {
    expect(await make('en').get()).toEqual({ language: 'en' });
    expect(existsSync(file)).toBe(false);
  });

  it('persists an update', async () => {
    await make('es').update({ language: 'en' });
    expect(await make('es').get()).toEqual({ language: 'en' });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      version: 1,
      language: 'en',
    });
  });

  it('ignores an invalid language', async () => {
    const repository = make('es');
    const result = await repository.update({ language: 'fr' as Language });
    expect(result).toEqual({ language: 'es' });
    expect(existsSync(file)).toBe(false);
  });

  it('lands two concurrent updates in order', async () => {
    const repository = make('es');
    const first = repository.update({ language: 'en' });
    const second = repository.update({ language: 'es' });
    expect(await first).toEqual({ language: 'en' });
    expect(await second).toEqual({ language: 'es' });
    expect(await make('en').get()).toEqual({ language: 'es' });
  });

  it('gives the default for a corrupt file', async () => {
    await writeFile(file, '{ not json', 'utf8');
    expect(await make('en').get()).toEqual({ language: 'en' });
  });

  it('persists chatProvider and drops an invalid one', async () => {
    await make('en').update({ chatProvider: 'claude' });
    expect(await make('en').get()).toEqual({
      language: 'en',
      chatProvider: 'claude',
    });
    const result = await make('en').update({
      chatProvider: 'nope' as 'claude',
    });
    expect(result.chatProvider).toBe('claude');
    await writeFile(file, JSON.stringify({ version: 1, chatProvider: 'x' }));
    expect(await make('en').get()).toEqual({ language: 'en' });
  });

  it('gives the default for an unknown stored language', async () => {
    await writeFile(file, JSON.stringify({ version: 1, language: 'fr' }));
    expect(await make('es').get()).toEqual({ language: 'es' });
  });
});
