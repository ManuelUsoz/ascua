import { readFile } from 'node:fs/promises';
import {
  LANGUAGES,
  type Language,
  type Settings,
  type SettingsPatch,
} from '@ascua/ipc';
import { writeJsonAtomic } from '../storage/atomic-json';

interface SettingsFile {
  version: 1;
  language?: Language;
}

const isLanguage = (value: unknown): value is Language =>
  LANGUAGES.includes(value as Language);

export class JsonSettingsRepository {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly osLanguage: () => Language,
  ) {}

  async get(): Promise<Settings> {
    return { language: (await this.read()).language ?? this.osLanguage() };
  }

  update(patch: SettingsPatch): Promise<Settings> {
    const run = this.queue.then(
      () => this.apply(patch),
      () => this.apply(patch),
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async apply(patch: SettingsPatch): Promise<Settings> {
    const stored = await this.read();
    const language = isLanguage(patch.language)
      ? patch.language
      : stored.language;
    if (language && language !== stored.language) {
      await writeJsonAtomic(this.file, { version: 1, language });
    }
    return { language: language ?? this.osLanguage() };
  }

  private async read(): Promise<Partial<SettingsFile>> {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8')) as unknown;
      const language = (data as Partial<SettingsFile> | null)?.language;
      return isLanguage(language) ? { language } : {};
    } catch {
      return {};
    }
  }
}
