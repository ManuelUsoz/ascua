import { readFile } from 'node:fs/promises';
import {
  DEFAULT_VOICE_SETTINGS,
  LANGUAGES,
  VOICE_STYLES,
  type Language,
  type Settings,
  type SettingsPatch,
  type VoiceSettings,
  type VoiceStyle,
} from '@ascua/ipc';
import { writeJsonAtomic } from '../storage/atomic-json';

interface SettingsFile {
  version: 1;
  language?: Language;
  voice?: Partial<VoiceSettings>;
}

const isLanguage = (value: unknown): value is Language =>
  LANGUAGES.includes(value as Language);

const isStyle = (value: unknown): value is VoiceStyle =>
  VOICE_STYLES.includes(value as VoiceStyle);

/** Keeps only the valid fields of a voice object. */
function validVoice(value: unknown): Partial<VoiceSettings> {
  const raw = (value ?? {}) as Partial<Record<keyof VoiceSettings, unknown>>;
  const voice: Partial<VoiceSettings> = {};
  if (typeof raw.enabled === 'boolean') voice.enabled = raw.enabled;
  if (typeof raw.autoSpeak === 'boolean') voice.autoSpeak = raw.autoSpeak;
  if (isStyle(raw.style)) voice.style = raw.style;
  return voice;
}

export class JsonSettingsRepository {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly osLanguage: () => Language,
  ) {}

  async get(): Promise<Settings> {
    const stored = await this.read();
    return {
      language: stored.language ?? this.osLanguage(),
      voice: { ...DEFAULT_VOICE_SETTINGS, ...stored.voice },
    };
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
    const voice = { ...stored.voice, ...validVoice(patch.voice) };
    const changed =
      language !== stored.language ||
      JSON.stringify(voice) !== JSON.stringify(stored.voice ?? {});
    if (changed) {
      const file: SettingsFile = { version: 1, voice };
      if (language) file.language = language;
      await writeJsonAtomic(this.file, file);
    }
    return {
      language: language ?? this.osLanguage(),
      voice: { ...DEFAULT_VOICE_SETTINGS, ...voice },
    };
  }

  private async read(): Promise<Partial<SettingsFile>> {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8')) as unknown;
      const file = data as Partial<SettingsFile> | null;
      return {
        ...(isLanguage(file?.language) ? { language: file.language } : {}),
        voice: validVoice(file?.voice),
      };
    } catch {
      return {};
    }
  }
}
