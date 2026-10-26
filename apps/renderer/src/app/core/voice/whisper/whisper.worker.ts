/// <reference lib="webworker" />
import type { Language } from '@ascua/ipc';
import { configureRuntime, detectDevice } from '../runtime/voice-runtime';
import {
  WHISPER_CPU,
  whisperProfile,
  type WhisperProfile,
} from '../voice-models';
import type {
  WhisperDeviceKind,
  WhisperEngine,
  WhisperRequest,
  WhisperResponse,
} from './whisper-protocol';
import {
  decoderPrompt,
  stripPrompt,
  type PromptTokenizer,
} from './whisper-prompt';

interface TensorLike {
  tolist(): (number | bigint)[][];
}

interface Transcriber {
  (
    audio: Float32Array,
    options: Record<string, unknown>,
  ): Promise<{ text: string } | { text: string }[]>;
  processor(audio: Float32Array): Promise<{ input_features: unknown }>;
  tokenizer: PromptTokenizer & {
    decode(ids: number[], options: Record<string, unknown>): string;
  };
  model: {
    generate(options: Record<string, unknown>): Promise<TensorLike>;
  };
}

const LANGUAGE_NAMES: Record<Language, string> = {
  es: 'spanish',
  en: 'english',
};

/** Whisper decodes at most 448 positions; the prompt prefix takes its share. */
const MAX_TARGET_POSITIONS = 448;

let transcriber: Transcriber | undefined;
let phrases: string[] | undefined;
let next = 0;

function post(message: WhisperResponse): void {
  self.postMessage(message);
}

async function build(
  profile: WhisperProfile,
  device: WhisperDeviceKind,
): Promise<Transcriber> {
  const { pipeline } = await import('@huggingface/transformers');
  const files = new Map<string, { loaded: number; total: number }>();
  return (await pipeline('automatic-speech-recognition', profile.model, {
    revision: profile.revision,
    dtype: profile.dtype as never,
    device,
    progress_callback: (info: {
      status: string;
      file?: string;
      loaded?: number;
      total?: number;
    }) => {
      if (info.status !== 'progress' || !info.file) return;
      files.set(info.file, {
        loaded: info.loaded ?? 0,
        total: info.total ?? 0,
      });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      post({ type: 'progress', loaded, total });
    },
  })) as unknown as Transcriber;
}

async function load(
  engine: WhisperEngine,
): Promise<{ device: WhisperDeviceKind; threads: number }> {
  if (engine.kind === 'fake') {
    phrases = engine.phrases;
    return { device: 'wasm', threads: 1 };
  }
  const { env } = await import('@huggingface/transformers');
  configureRuntime(env as unknown as Parameters<typeof configureRuntime>[0]);
  // Read after the session exists: it reflects ORT's own fallback to 1.
  const threads = () =>
    (env.backends.onnx.wasm as { numThreads?: number } | undefined)
      ?.numThreads ?? 1;
  const device = await detectDevice();
  const profile = whisperProfile(device);
  if (device.kind === 'webgpu') {
    try {
      transcriber = await build(profile, 'webgpu');
      return { device: 'webgpu', threads: threads() };
    } catch {
      // WebGPU session failed: fall through to the cpu profile on wasm.
    }
  }
  transcriber = await build(
    device.kind === 'webgpu' ? WHISPER_CPU : profile,
    'wasm',
  );
  return { device: 'wasm', threads: threads() };
}

async function transcribeWithPrompt(
  asr: Transcriber,
  audio: Float32Array,
  language: Language,
  prompt: string,
): Promise<string> {
  const { input_features } = await asr.processor(audio);
  const { ids, prefixLength } = decoderPrompt(asr.tokenizer, language, prompt);
  const out = await asr.model.generate({
    inputs: input_features,
    decoder_input_ids: ids,
    max_new_tokens: MAX_TARGET_POSITIONS - prefixLength,
  });
  const row = (out.tolist()[0] ?? []).map(Number);
  return asr.tokenizer
    .decode(stripPrompt(row, prefixLength), { skip_special_tokens: true })
    .trim();
}

async function transcribe(
  audio: Float32Array,
  language: Language,
  prompt?: string,
): Promise<string> {
  if (phrases) {
    const text = phrases[next % Math.max(phrases.length, 1)] ?? '';
    next += 1;
    return text;
  }
  if (!transcriber) throw new Error('not loaded'); // i18n-ignore
  if (prompt?.trim()) {
    return transcribeWithPrompt(transcriber, audio, language, prompt);
  }
  const out = await transcriber(audio, {
    language: LANGUAGE_NAMES[language],
    task: 'transcribe',
  });
  return (Array.isArray(out) ? (out[0]?.text ?? '') : out.text).trim();
}

self.onmessage = (event: MessageEvent<WhisperRequest>) => {
  const message = event.data;
  if (message.type === 'load') {
    load(message.engine).then(
      ({ device, threads }) => post({ type: 'ready', device, threads }),
      (error: unknown) => {
        console.error('[ascua:voice]', 'load', error);
        post({ type: 'error', code: 'voice.modelFailed' });
      },
    );
    return;
  }
  const { id } = message;
  transcribe(message.audio, message.language, message.prompt).then(
    (text) => post({ type: 'result', id, text }),
    (error: unknown) => {
      console.error('[ascua:voice]', 'transcribe', error);
      post({ type: 'error', id, code: 'voice.modelFailed' });
    },
  );
};
