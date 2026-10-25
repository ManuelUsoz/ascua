import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { isAgentProviderId, type AgentProviderId } from '@ascua/chat';
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
  cloneDir?: string;
  chatProvider?: AgentProviderId;
}

const isCloneDir = (value: unknown): value is string =>
  typeof value === 'string' && value !== '' && isAbsolute(value);

const isLanguage = (value: unknown): value is Language =>
  LANGUAGES.includes(value as Language);

export class JsonSettingsRepository {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly osLanguage: () => Language,
  ) {}

  async get(): Promise<Settings> {
    const stored = await this.read();
    return this.view(stored);
  }

  private view(stored: Partial<SettingsFile>): Settings {
    const settings: Settings = {
      language: stored.language ?? this.osLanguage(),
    };
    if (stored.cloneDir) settings.cloneDir = stored.cloneDir;
    if (stored.chatProvider) settings.chatProvider = stored.chatProvider;
    return settings;
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
    const cloneDir = isCloneDir(patch.cloneDir)
      ? patch.cloneDir
      : stored.cloneDir;
    const chatProvider = isAgentProviderId(patch.chatProvider)
      ? patch.chatProvider
      : stored.chatProvider;
    if (
      (language && language !== stored.language) ||
      cloneDir !== stored.cloneDir ||
      chatProvider !== stored.chatProvider
    ) {
      const file: SettingsFile = { version: 1 };
      if (language) file.language = language;
      if (cloneDir) file.cloneDir = cloneDir;
      if (chatProvider) file.chatProvider = chatProvider;
      await writeJsonAtomic(this.file, file);
    }
    return this.view({ language, cloneDir, chatProvider });
  }

  private async read(): Promise<Partial<SettingsFile>> {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8')) as unknown;
      const file = data as Partial<SettingsFile> | null;
      const stored: Partial<SettingsFile> = {};
      if (isLanguage(file?.language)) stored.language = file.language;
      if (isCloneDir(file?.cloneDir)) stored.cloneDir = file.cloneDir;
      if (isAgentProviderId(file?.chatProvider)) {
        stored.chatProvider = file.chatProvider;
      }
      return stored;
    } catch {
      return {};
    }
  }
}
