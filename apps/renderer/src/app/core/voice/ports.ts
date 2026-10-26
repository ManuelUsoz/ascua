import type { Language, VoiceStyle } from '@ascua/ipc';

/** Records the microphone. `stop()` resolves 16 kHz mono PCM. */
export interface AudioCapture {
  start(): Promise<void>;
  stop(): Promise<Float32Array>;
  cancel(): void;
}

export interface LoadProgress {
  engine: 'stt' | 'tts';
  loaded: number;
  total: number;
}

export type VoiceState =
  | 'idle'
  | 'loadingModel'
  | 'listening'
  | 'transcribing'
  | 'speaking';

export interface SpeechRecognizer {
  load(onProgress: (progress: LoadProgress) => void): Promise<void>;
  transcribe(
    audio: Float32Array,
    language: Language,
    signal: AbortSignal,
    prompt?: string,
  ): Promise<string>;
  dispose(): void;
}

export interface SpeakOptions {
  language: Language;
  style: VoiceStyle;
}

/** A rendered sentence, ready to play. Rendering is split from playing so the queue can render one ahead. */
export interface SpokenClip {
  play(signal: AbortSignal): Promise<void>;
}

export interface SpeechSynthesizer {
  load(onProgress: (progress: LoadProgress) => void): Promise<void>;
  render(sentence: string, options: SpeakOptions): Promise<SpokenClip>;
  stop(): void;
  dispose(): void;
}
