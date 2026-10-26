import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_VOICE_SETTINGS,
  type Language,
  type VoiceStyle,
} from '@ascua/ipc';
import { JsonSettingsRepository } from './json-settings-repository';

describe('JsonSettingsRepository', () => {
  let dir: string;
  let file: string;
  const make = (os: Language = 'en') =>
    new JsonSettingsRepository(file, () => os);
  const voice = DEFAULT_VOICE_SETTINGS;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ascua-settings-'));
    file = join(dir, 'settings.json');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('gives the OS language and default voice, writing nothing, when the file is missing', async () => {
    expect(await make('en').get()).toEqual({ language: 'en', voice });
    expect(existsSync(file)).toBe(false);
  });

  it('persists an update', async () => {
    await make('es').update({ language: 'en' });
    expect(await make('es').get()).toEqual({ language: 'en', voice });
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
      version: 1,
      language: 'en',
    });
  });

  it('ignores an invalid language', async () => {
    const repository = make('es');
    const result = await repository.update({ language: 'fr' as Language });
    expect(result).toEqual({ language: 'es', voice });
    expect(existsSync(file)).toBe(false);
  });

  it('lands two concurrent updates in order', async () => {
    const repository = make('es');
    const first = repository.update({ language: 'en' });
    const second = repository.update({ language: 'es' });
    expect((await first).language).toBe('en');
    expect((await second).language).toBe('es');
    expect((await make('en').get()).language).toBe('es');
  });

  it('gives the default for a corrupt file', async () => {
    await writeFile(file, '{ not json', 'utf8');
    expect(await make('en').get()).toEqual({ language: 'en', voice });
  });

  it('gives the default for an unknown stored language', async () => {
    await writeFile(file, JSON.stringify({ version: 1, language: 'fr' }));
    expect(await make('es').get()).toEqual({ language: 'es', voice });
  });

  it('persists a voice patch, style included', async () => {
    await make().update({ voice: { style: 'M2', autoSpeak: true } });
    expect((await make().get()).voice).toEqual({
      enabled: true,
      autoSpeak: true,
      style: 'M2',
    });
  });

  it('keeps voice on a language change and the reverse', async () => {
    const repository = make('es');
    await repository.update({ voice: { style: 'M1' } });
    await repository.update({ language: 'en' });
    await repository.update({ voice: { enabled: false } });
    expect(await make('es').get()).toEqual({
      language: 'en',
      voice: { enabled: false, autoSpeak: false, style: 'M1' },
    });
  });

  it('ignores invalid voice values', async () => {
    const result = await make().update({
      voice: {
        enabled: 'yes' as unknown as boolean,
        style: 'X9' as VoiceStyle,
      },
    });
    expect(result.voice).toEqual(voice);
    expect(existsSync(file)).toBe(false);
  });
});
