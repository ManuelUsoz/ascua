import { describe, expect, it } from 'vitest';
import {
  SupertonicEngine,
  styleFromJson,
  type TensorFactory,
} from './supertonic-engine';

interface Fake {
  type: string;
  data: ArrayLike<number | bigint>;
  dims: number[];
}

const tensor: TensorFactory = (type, data, dims) =>
  ({ type, data, dims }) as Fake;

function setup(durationSeconds = 1) {
  const calls: { name: string; feeds: Record<string, Fake> }[] = [];
  const session = (name: string, out: (f: Record<string, Fake>) => object) => ({
    run: (feeds: Record<string, unknown>) => {
      calls.push({ name, feeds: feeds as Record<string, Fake> });
      return Promise.resolve(out(feeds as Record<string, Fake>));
    },
  });
  const sampleRate = 100;
  const engine = new SupertonicEngine({
    sessions: {
      dp: session('dp', () => ({ duration: { data: [durationSeconds] } })),
      textEnc: session('enc', () => ({ text_emb: { tag: 'emb' } })),
      vectorEst: session('vec', (f) => ({
        denoised_latent: { data: f['noisy_latent'].data },
      })),
      vocoder: session('voc', () => ({
        wav_tts: { data: new Float32Array(10_000).fill(0.5) },
      })),
    },
    tensor,
    config: {
      ae: { sample_rate: sampleRate, base_chunk_size: 10 },
      ttl: { chunk_compress_factor: 2, latent_dim: 3 },
    },
    indexer: Array.from({ length: 300 }, (_, i) => i),
    random: () => 0.5,
  });
  const style = styleFromJson(
    {
      style_ttl: {
        dims: [1, 2, 2],
        data: [
          [
            [1, 2],
            [3, 4],
          ],
        ],
      },
      style_dp: { dims: [1, 1, 2], data: [[[5, 6]]] },
    },
    tensor,
  );
  return { engine, calls, style };
}

describe('SupertonicEngine', () => {
  it('builds style tensors with their dims', () => {
    const { style } = setup();
    expect(style.ttl).toMatchObject({ dims: [1, 2, 2] });
    expect(Array.from((style.ttl as Fake).data as number[])).toEqual([
      1, 2, 3, 4,
    ]);
    expect(style.dp).toMatchObject({ dims: [1, 1, 2] });
  });

  it('feeds the documented names and shapes', async () => {
    const { engine, calls, style } = setup();
    await engine.synthesize('hi', 'en', style, 2, 1);
    const dp = calls.find((c) => c.name === 'dp')!;
    expect(Object.keys(dp.feeds)).toEqual([
      'text_ids',
      'style_dp',
      'text_mask',
    ]);
    expect(dp.feeds['text_ids'].type).toBe('int64');
    // "<en>hi.</en>" is 12 code points
    expect(dp.feeds['text_ids'].dims).toEqual([1, 12]);
    expect(dp.feeds['text_mask'].dims).toEqual([1, 1, 12]);
    const vec = calls.find((c) => c.name === 'vec')!;
    expect(Object.keys(vec.feeds)).toEqual([
      'noisy_latent',
      'text_emb',
      'style_ttl',
      'latent_mask',
      'text_mask',
      'current_step',
      'total_step',
    ]);
    // 1 s * 100 Hz = 100 samples, chunk 20 -> 5 latent frames, dim 6
    expect(vec.feeds['noisy_latent'].dims).toEqual([1, 6, 5]);
    expect(vec.feeds['latent_mask'].dims).toEqual([1, 1, 5]);
  });

  it('runs the vector estimator once per step', async () => {
    const { engine, calls, style } = setup();
    await engine.synthesize('hi', 'en', style, 5, 1);
    expect(calls.filter((c) => c.name === 'vec')).toHaveLength(5);
    const steps = calls
      .filter((c) => c.name === 'vec')
      .map((c) => c.feeds['current_step'].data[0]);
    expect(steps).toEqual([0, 1, 2, 3, 4]);
  });

  it('scales the duration by speed and trims the output', async () => {
    const slow = await setup(2).engine.synthesize(
      'hi',
      'en',
      setup().style,
      1,
      1,
    );
    const fast = await setup(2).engine.synthesize(
      'hi',
      'en',
      setup().style,
      1,
      2,
    );
    expect(slow.audio.length).toBe(200);
    expect(fast.audio.length).toBe(100);
    expect(slow.sampleRate).toBe(100);
  });
});
