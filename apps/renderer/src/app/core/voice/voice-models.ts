import type { VoiceDevice } from './runtime/voice-runtime';

export interface ModelFile {
  path: string;
  bytes: number;
}

export type WhisperDtype = string | Record<string, string>;

/** One Whisper build: where it lives, how it is quantized and what it weighs. */
export interface WhisperProfile {
  id: 'gpu' | 'cpu';
  model: string;
  /** Pinned Hugging Face commit, like SUPERTONIC.revision. */
  revision: string;
  dtype: WhisperDtype;
  files: ModelFile[];
  /** Sum of `files`. */
  bytes: number;
}

const sum = (files: ModelFile[]): number =>
  files.reduce((total, f) => total + f.bytes, 0);

const GPU_FILES: ModelFile[] = [
  { path: 'onnx/encoder_model_q4f16.onnx', bytes: 369974078 },
  { path: 'onnx/decoder_model_merged_q4f16.onnx', bytes: 193505017 },
  { path: 'tokenizer.json', bytes: 2480617 },
];

const CPU_FILES: ModelFile[] = [
  { path: 'onnx/encoder_model_quantized.onnx', bytes: 92326160 },
  { path: 'onnx/decoder_model_merged_quantized.onnx', bytes: 156750845 },
  { path: 'tokenizer.json', bytes: 2480466 },
  { path: 'tokenizer_config.json', bytes: 282683 },
  { path: 'preprocessor_config.json', bytes: 6459 },
];

/** WebGPU with shader-f16. About 566 MB. */
export const WHISPER_GPU: WhisperProfile = {
  id: 'gpu',
  model: 'onnx-community/whisper-large-v3-turbo',
  revision: '360ebcde2559d60bb474678be3c1de9ef347d01a',
  dtype: { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' },
  files: GPU_FILES,
  bytes: sum(GPU_FILES),
};

/** wasm, or WebGPU without f16. About 252 MB. */
export const WHISPER_CPU: WhisperProfile = {
  id: 'cpu',
  model: 'onnx-community/whisper-small',
  revision: '36050c46d777d46dc4b5f43f6d90574fc38f8732',
  dtype: 'q8',
  files: CPU_FILES,
  bytes: sum(CPU_FILES),
};

/** The one place that picks the Whisper model for a device. */
export function whisperProfile(device: VoiceDevice): WhisperProfile {
  return device.kind === 'webgpu' && device.f16 ? WHISPER_GPU : WHISPER_CPU;
}

/** ONNX execution providers for Supertonic, best first. */
export function supertonicProviders(device: VoiceDevice): string[] {
  return device.kind === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'];
}

/** Pinned: the upstream GitHub repo is archived, so the revision must not float. */
export const SUPERTONIC = {
  repo: 'supertone-oss-archive/supertonic-3',
  revision: 'aafc6e32416a594460b32413efc49d7fe4ce6d46',
  files: [
    { path: 'onnx/duration_predictor.onnx', bytes: 3700147 },
    { path: 'onnx/text_encoder.onnx', bytes: 36416150 },
    { path: 'onnx/vector_estimator.onnx', bytes: 256534781 },
    { path: 'onnx/vocoder.onnx', bytes: 101424195 },
    { path: 'onnx/tts.json', bytes: 8253 },
    { path: 'onnx/unicode_indexer.json', bytes: 277676 },
  ] satisfies ModelFile[],
} as const;

export const SUPERTONIC_STEPS = 5;
export const SUPERTONIC_SPEED = 1.05;

export function supertonicUrl(path: string): string {
  return `https://huggingface.co/${SUPERTONIC.repo}/resolve/${SUPERTONIC.revision}/${path}`;
}
