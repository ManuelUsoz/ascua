import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import {
  PERMISSION_MODES,
  isAgentProviderId,
  type AgentProviderId,
  type PermissionMode,
  type ReasoningEffort,
} from '@ascua/chat';
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
  chatDefaults?: ChatDefaults;
}

type ChatDefaults = NonNullable<Settings['chatDefaults']>;

const EFFORTS: readonly ReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

const cleanChatDefaults = (value: unknown): ChatDefaults | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const out: ChatDefaults = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isAgentProviderId(key)) continue;
    if (typeof raw !== 'object' || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const clean: NonNullable<ChatDefaults[AgentProviderId]> = {};
    if (PERMISSION_MODES.includes(entry['permissionMode'] as PermissionMode)) {
      clean.permissionMode = entry['permissionMode'] as PermissionMode;
    }
    if (typeof entry['model'] === 'string' && entry['model'] !== '') {
      clean.model = entry['model'];
    }
    if (EFFORTS.includes(entry['effort'] as ReasoningEffort)) {
      clean.effort = entry['effort'] as ReasoningEffort;
    }
    if (Object.keys(clean).length > 0) out[key] = clean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

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
    if (stored.chatDefaults) settings.chatDefaults = stored.chatDefaults;
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
    const patched =
      patch.chatDefaults === undefined
        ? undefined
        : cleanChatDefaults(patch.chatDefaults);
    const chatDefaults =
      patch.chatDefaults === undefined ? stored.chatDefaults : patched;
    if (
      (language && language !== stored.language) ||
      cloneDir !== stored.cloneDir ||
      chatProvider !== stored.chatProvider ||
      JSON.stringify(chatDefaults) !== JSON.stringify(stored.chatDefaults)
    ) {
      const file: SettingsFile = { version: 1 };
      if (language) file.language = language;
      if (cloneDir) file.cloneDir = cloneDir;
      if (chatProvider) file.chatProvider = chatProvider;
      if (chatDefaults) file.chatDefaults = chatDefaults;
      await writeJsonAtomic(this.file, file);
    }
    return this.view({ language, cloneDir, chatProvider, chatDefaults });
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
      const chatDefaults = cleanChatDefaults(file?.chatDefaults);
      if (chatDefaults) stored.chatDefaults = chatDefaults;
      return stored;
    } catch {
      return {};
    }
  }
}
