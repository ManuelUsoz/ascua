import type { Language, VOICE_ERROR_CODES, VoiceStyle } from '@ascua/ipc';

export type SupertonicErrorCode = (typeof VOICE_ERROR_CODES)[number];

export type SupertonicRequest =
  | { type: 'load'; engine: { kind: 'supertonic' } }
  | {
      type: 'render';
      id: number;
      text: string;
      language: Language;
      style: VoiceStyle;
    };

export type SupertonicResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; threads?: number; device?: 'webgpu' | 'wasm' }
  | { type: 'result'; id: number; audio: Float32Array; sampleRate: number }
  | { type: 'error'; id?: number; code: SupertonicErrorCode };
