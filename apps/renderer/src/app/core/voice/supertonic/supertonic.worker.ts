/// <reference lib="webworker" />
import { createModelCache } from '../runtime/model-cache';
import { fetchCached } from '../runtime/cached-fetch';
import { detectDevice, ortWasmOptions } from '../runtime/voice-runtime';
import {
  SUPERTONIC,
  SUPERTONIC_SPEED,
  SUPERTONIC_STEPS,
  supertonicProviders,
  supertonicUrl,
} from '../voice-models';
import {
  SupertonicEngine,
  styleFromJson,
  type InferenceSessionLike,
  type Style,
  type SupertonicConfig,
  type TensorFactory,
} from './supertonic-engine';
import type {
  SupertonicRequest,
  SupertonicResponse,
} from './supertonic-protocol';

const cache = createModelCache();
const styles = new Map<string, Style>();
let engine: SupertonicEngine | undefined;
let tensor: TensorFactory | undefined;
let queue: Promise<unknown> = Promise.resolve();

function post(
  message: SupertonicResponse,
  transfer: Transferable[] = [],
): void {
  self.postMessage(message, transfer);
}

const decode = (bytes: ArrayBuffer): unknown =>
  JSON.parse(new TextDecoder().decode(bytes));

async function load(): Promise<{
  threads: number;
  device: 'webgpu' | 'wasm';
}> {
  const ort = await import('onnxruntime-web');
  Object.assign(ort.env.wasm, ortWasmOptions());
  tensor = (type, data, dims) =>
    new ort.Tensor(type, data as never, dims) as unknown;

  const total = SUPERTONIC.files.reduce((sum, f) => sum + f.bytes, 0);
  const loaded = new Map<string, number>();
  const files = new Map<string, ArrayBuffer>();
  for (const file of SUPERTONIC.files) {
    files.set(
      file.path,
      await fetchCached(supertonicUrl(file.path), cache, {
        bytes: file.bytes,
        onProgress: (n) => {
          loaded.set(file.path, n);
          let sum = 0;
          for (const v of loaded.values()) sum += v;
          post({ type: 'progress', loaded: sum, total });
        },
      }),
    );
  }

  const providers = supertonicProviders(await detectDevice());
  let device: 'webgpu' | 'wasm' = providers[0] === 'webgpu' ? 'webgpu' : 'wasm';
  const session = async (path: string): Promise<InferenceSessionLike> => {
    const bytes = files.get(path) as ArrayBuffer;
    const model = new Uint8Array(bytes);
    const create = (executionProviders: string[]) =>
      ort.InferenceSession.create(model, {
        executionProviders,
        graphOptimizationLevel: 'all',
      });
    // A WebGPU session that fails to build retries on wasm.
    const created = await create(providers).catch((error: unknown) => {
      if (providers.length === 1) throw error;
      device = 'wasm';
      return create(['wasm']);
    });
    files.delete(path); // drop the buffer once the session owns a copy
    return created as unknown as InferenceSessionLike;
  };
  const dp = await session('onnx/duration_predictor.onnx');
  const textEnc = await session('onnx/text_encoder.onnx');
  const vectorEst = await session('onnx/vector_estimator.onnx');
  const vocoder = await session('onnx/vocoder.onnx');

  engine = new SupertonicEngine({
    sessions: { dp, textEnc, vectorEst, vocoder },
    tensor,
    config: decode(
      files.get('onnx/tts.json') as ArrayBuffer,
    ) as SupertonicConfig,
    indexer: decode(
      files.get('onnx/unicode_indexer.json') as ArrayBuffer,
    ) as number[],
  });
  // Read after the sessions exist: it reflects ORT's own fallback to 1.
  return { threads: (ort.env.wasm['numThreads'] as number) ?? 1, device };
}

async function style(name: string): Promise<Style> {
  const known = styles.get(name);
  if (known) return known;
  const bytes = await fetchCached(
    supertonicUrl(`voice_styles/${name}.json`),
    cache,
  );
  const built = styleFromJson(
    decode(bytes) as Parameters<typeof styleFromJson>[0],
    tensor as TensorFactory,
  );
  styles.set(name, built);
  return built;
}

async function render(
  message: Extract<SupertonicRequest, { type: 'render' }>,
): Promise<void> {
  if (!engine) throw new Error('not loaded'); // i18n-ignore
  const result = await engine.synthesize(
    message.text,
    message.language,
    await style(message.style),
    SUPERTONIC_STEPS,
    SUPERTONIC_SPEED,
  );
  post(
    {
      type: 'result',
      id: message.id,
      audio: result.audio,
      sampleRate: result.sampleRate,
    },
    [result.audio.buffer],
  );
}

self.onmessage = (event: MessageEvent<SupertonicRequest>) => {
  const message = event.data;
  if (message.type === 'load') {
    load().then(
      ({ threads, device }) => post({ type: 'ready', threads, device }),
      (error: unknown) => {
        console.error('[ascua:voice]', 'load', error);
        post({ type: 'error', code: 'voice.modelFailed' });
      },
    );
    return;
  }
  // onnxruntime sessions do not take concurrent runs: one render at a time.
  queue = queue
    .then(() => render(message))
    .catch((error: unknown) => {
      console.error('[ascua:voice]', 'render', error);
      post({ type: 'error', id: message.id, code: 'voice.ttsUnavailable' });
    });
};
