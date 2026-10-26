import type { Language, VOICE_ERROR_CODES } from '@ascua/ipc';

export type VoiceErrorCode = (typeof VOICE_ERROR_CODES)[number];

/** The worker picks the model profile from the device it detects. */
export type WhisperEngine =
  | { kind: 'whisper' }
  | { kind: 'fake'; phrases: string[] };

export type WhisperDeviceKind = 'webgpu' | 'wasm';

export type WhisperRequest =
  | { type: 'load'; engine: WhisperEngine }
  | {
      type: 'transcribe';
      id: number;
      audio: Float32Array;
      language: Language;
      /** Vocabulary hint: project, pista and app names. */
      prompt?: string;
    };

export type WhisperResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; device?: WhisperDeviceKind; threads?: number }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; code: VoiceErrorCode };
