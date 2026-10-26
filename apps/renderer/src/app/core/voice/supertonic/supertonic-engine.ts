/*
 * Ported from supertone-oss-archive/supertonic @ 1e9799e9, web/helper.js
 * (TextToSpeech._infer, sampleNoisyLatent, loadVoiceStyle), batch size 1.
 * MIT License, Copyright (c) 2025 Supertone Inc. See THIRD_PARTY_NOTICES.md.
 *
 * Typed arrays replace the example's nested JS arrays. The onnxruntime tensor
 * factory and sessions are injected so tests run without onnxruntime.
 */
import type { Language } from '@ascua/ipc';
import { lengthToMask, preprocessText, toTextIds } from './supertonic-text';

export interface SupertonicConfig {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { chunk_compress_factor: number; latent_dim: number };
}

export type TensorFactory = (
  type: 'int64' | 'float32',
  data: BigInt64Array | Float32Array,
  dims: number[],
) => unknown;

export interface OutputTensor {
  data: ArrayLike<number>;
}

export interface InferenceSessionLike {
  run(feeds: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface SupertonicSessions {
  dp: InferenceSessionLike;
  textEnc: InferenceSessionLike;
  vectorEst: InferenceSessionLike;
  vocoder: InferenceSessionLike;
}

export interface Style {
  ttl: unknown;
  dp: unknown;
}

interface StyleJson {
  style_ttl: { dims: number[]; data: unknown };
  style_dp: { dims: number[]; data: unknown };
}

export function styleFromJson(json: StyleJson, tensor: TensorFactory): Style {
  const build = (part: StyleJson['style_ttl']) =>
    tensor(
      'float32',
      Float32Array.from((part.data as number[]).flat(Infinity) as number[]),
      part.dims,
    );
  return { ttl: build(json.style_ttl), dp: build(json.style_dp) };
}

export interface SupertonicEngineDeps {
  sessions: SupertonicSessions;
  tensor: TensorFactory;
  config: SupertonicConfig;
  indexer: ArrayLike<number>;
  random?: () => number;
}

export interface SynthesisResult {
  audio: Float32Array;
  sampleRate: number;
}

export class SupertonicEngine {
  private readonly random: () => number;

  constructor(private readonly deps: SupertonicEngineDeps) {
    this.random = deps.random ?? Math.random;
  }

  async synthesize(
    text: string,
    language: Language,
    style: Style,
    steps: number,
    speed: number,
  ): Promise<SynthesisResult> {
    const { sessions, tensor, config, indexer } = this.deps;
    const ids = toTextIds(preprocessText(text, language), indexer);
    const len = ids.length;
    const textIds = tensor(
      'int64',
      BigInt64Array.from(ids, (x) => BigInt(x)),
      [1, len],
    );
    const textMask = tensor('float32', lengthToMask(len), [1, 1, len]);

    const dpOut = await sessions.dp.run({
      text_ids: textIds,
      style_dp: style.dp,
      text_mask: textMask,
    });
    const duration = (dpOut['duration'] as OutputTensor).data[0] / speed;

    const encOut = await sessions.textEnc.run({
      text_ids: textIds,
      style_ttl: style.ttl,
      text_mask: textMask,
    });
    const textEmb = encOut['text_emb'];

    const sampleRate = config.ae.sample_rate;
    const chunkSize =
      config.ae.base_chunk_size * config.ttl.chunk_compress_factor;
    const latentDim = config.ttl.latent_dim * config.ttl.chunk_compress_factor;
    const wavLen = Math.floor(duration * sampleRate);
    const latentLen = Math.floor((wavLen + chunkSize - 1) / chunkSize);

    let xt = this.noisyLatent(latentDim, latentLen);
    const latentMask = tensor('float32', lengthToMask(latentLen), [
      1,
      1,
      latentLen,
    ]);
    const totalStep = tensor('float32', Float32Array.of(steps), [1]);

    for (let step = 0; step < steps; step++) {
      const out = await sessions.vectorEst.run({
        noisy_latent: tensor('float32', xt, [1, latentDim, latentLen]),
        text_emb: textEmb,
        style_ttl: style.ttl,
        latent_mask: latentMask,
        text_mask: textMask,
        current_step: tensor('float32', Float32Array.of(step), [1]),
        total_step: totalStep,
      });
      xt = new Float32Array((out['denoised_latent'] as OutputTensor).data);
    }

    const voc = await sessions.vocoder.run({
      latent: tensor('float32', xt, [1, latentDim, latentLen]),
    });
    const wav = (voc['wav_tts'] as OutputTensor).data;
    const audio = new Float32Array(Math.min(wavLen, wav.length));
    for (let i = 0; i < audio.length; i++) audio[i] = wav[i] ?? 0;
    return { audio, sampleRate };
  }

  /** Box-Muller noise, masked to the latent length (all of it for batch 1). */
  private noisyLatent(latentDim: number, latentLen: number): Float32Array {
    const xt = new Float32Array(latentDim * latentLen);
    for (let i = 0; i < xt.length; i++) {
      const u1 = Math.max(0.0001, this.random());
      const u2 = this.random();
      xt[i] = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    }
    return xt;
  }
}
