import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeError } from '@ascua/ipc';
import type { LoadProgress } from '../ports';
import type {
  SupertonicRequest,
  SupertonicResponse,
} from './supertonic-protocol';
import {
  SupertonicSynthesizer,
  type SynthWorkerLike,
} from './supertonic-synthesizer';

class FakeWorker implements SynthWorkerLike {
  onmessage: ((event: { data: SupertonicResponse }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: SupertonicRequest[] = [];
  terminated = false;
  postMessage(message: SupertonicRequest): void {
    this.sent.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: SupertonicResponse): void {
    this.onmessage?.({ data });
  }
}

function setup(idleMs?: number) {
  const workers: FakeWorker[] = [];
  const player = {
    play: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  };
  const synth = new SupertonicSynthesizer(
    () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    player,
    { idleMs },
  );
  return { synth, workers, player };
}

const opts = { language: 'es', style: 'F1' } as const;
const flush = () => Promise.resolve().then(() => Promise.resolve());

describe('SupertonicSynthesizer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is lazy and forwards progress', async () => {
    const { synth, workers } = setup();
    expect(workers).toHaveLength(0);
    const seen: LoadProgress[] = [];
    const loading = synth.load((p) => seen.push(p));
    workers[0].reply({ type: 'progress', loaded: 5, total: 10 });
    workers[0].reply({ type: 'ready' });
    await loading;
    expect(seen).toEqual([{ engine: 'tts', loaded: 5, total: 10 }]);
    await synth.load(() => undefined);
    expect(workers).toHaveLength(1);
  });

  it('logs the device the sessions were built on', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { synth, workers } = setup();
    const loading = synth.load(() => undefined);
    workers[0].reply({ type: 'ready', threads: 3, device: 'webgpu' });
    await loading;
    expect(info).toHaveBeenCalledWith(
      '[ascua:voice]',
      'supertonic',
      'webgpu',
      3,
    );
    info.mockRestore();
  });

  it('renders by id and plays through the player', async () => {
    const { synth, workers, player } = setup();
    const rendering = synth.render('Hola.', opts);
    await flush();
    workers[0].reply({ type: 'ready' });
    await flush();
    const sent = workers[0].sent.find((m) => m.type === 'render');
    expect(sent).toMatchObject({ text: 'Hola.', language: 'es', style: 'F1' });
    const audio = new Float32Array(3);
    workers[0].reply({ type: 'result', id: 0, audio, sampleRate: 44100 });
    const clip = await rendering;
    const signal = new AbortController().signal;
    await clip.play(signal);
    expect(player.play).toHaveBeenCalledWith(audio, 44100, signal);
  });

  it('stop drops a pending result and stops the player', async () => {
    const { synth, workers, player } = setup();
    const rendering = synth.render('Hola.', opts);
    await flush();
    workers[0].reply({ type: 'ready' });
    await flush();
    synth.stop();
    workers[0].reply({
      type: 'result',
      id: 0,
      audio: new Float32Array(1),
      sampleRate: 1,
    });
    const clip = await rendering;
    await clip.play(new AbortController().signal);
    expect(player.stop).toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it('terminates when idle and reloads on the next render', async () => {
    const { synth, workers } = setup(1000);
    const first = synth.render('Hola.', opts);
    await flush();
    workers[0].reply({ type: 'ready' });
    await flush();
    workers[0].reply({
      type: 'result',
      id: 0,
      audio: new Float32Array(1),
      sampleRate: 1,
    });
    await first;
    vi.advanceTimersByTime(1000);
    expect(workers[0].terminated).toBe(true);
    void synth.render('Otra.', opts);
    await flush();
    expect(workers).toHaveLength(2);
  });

  it('rejects with an encoded error code', async () => {
    const { synth, workers } = setup();
    const rendering = synth.render('Hola.', opts);
    await flush();
    workers[0].reply({ type: 'ready' });
    await flush();
    workers[0].reply({ type: 'error', id: 0, code: 'voice.ttsUnavailable' });
    const error = await rendering.catch((e: Error) => e);
    expect(decodeError((error as Error).message)?.code).toBe(
      'voice.ttsUnavailable',
    );
  });
});
