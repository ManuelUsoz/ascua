import { describe, expect, it } from 'vitest';
import { decodeError } from '@ascua/ipc';
import type { LoadProgress } from '../ports';
import type { WhisperRequest, WhisperResponse } from './whisper-protocol';
import { WhisperRecognizer, type WorkerLike } from './whisper-recognizer';

class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: WhisperResponse }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: WhisperRequest[] = [];
  terminated = false;
  postMessage(message: WhisperRequest): void {
    this.sent.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: WhisperResponse): void {
    this.onmessage?.({ data });
  }
}

const ENGINE = { kind: 'fake', phrases: ['hola'] } as const;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function setup() {
  const workers: FakeWorker[] = [];
  const recognizer = new WhisperRecognizer(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  }, ENGINE);
  return { workers, recognizer };
}

describe('WhisperRecognizer', () => {
  it('is lazy and loads once, forwarding progress', async () => {
    const { workers, recognizer } = setup();
    expect(workers).toHaveLength(0);
    const seen: LoadProgress[] = [];
    const a = recognizer.load((p) => seen.push(p));
    const b = recognizer.load((p) => seen.push(p));
    expect(workers).toHaveLength(1);
    expect(workers[0].sent).toEqual([{ type: 'load', engine: ENGINE }]);
    workers[0].reply({ type: 'progress', loaded: 5, total: 10 });
    workers[0].reply({ type: 'ready' });
    await Promise.all([a, b]);
    expect(seen).toEqual([{ engine: 'stt', loaded: 5, total: 10 }]);
  });

  it('resolves results by id', async () => {
    const { workers, recognizer } = setup();
    const load = recognizer.load(() => undefined);
    workers[0].reply({ type: 'ready' });
    await load;
    const signal = new AbortController().signal;
    const first = recognizer.transcribe(new Float32Array(4), 'es', signal);
    const second = recognizer.transcribe(new Float32Array(4), 'en', signal);
    await tick();
    const ids = workers[0].sent
      .filter((m) => m.type === 'transcribe')
      .map((m) => (m as { id: number }).id);
    expect(ids).toHaveLength(2);
    workers[0].reply({ type: 'result', id: ids[1], text: 'two' });
    workers[0].reply({ type: 'result', id: ids[0], text: 'one' });
    expect(await first).toBe('one');
    expect(await second).toBe('two');
  });

  it('forwards the vocabulary prompt', async () => {
    const { workers, recognizer } = setup();
    const load = recognizer.load(() => undefined);
    workers[0].reply({ type: 'ready' });
    await load;
    void recognizer.transcribe(
      new Float32Array(2),
      'es',
      new AbortController().signal,
      'Ascua, Proyecto',
    );
    await tick();
    expect(workers[0].sent[1]).toMatchObject({
      type: 'transcribe',
      prompt: 'Ascua, Proyecto',
    });
  });

  it('rejects with an encoded error code', async () => {
    const { workers, recognizer } = setup();
    const load = recognizer.load(() => undefined);
    workers[0].reply({ type: 'error', code: 'voice.modelFailed' });
    const error = await load.catch((e: Error) => e);
    expect(decodeError((error as Error).message)?.code).toBe(
      'voice.modelFailed',
    );
    await tick();
    expect(workers[0].terminated).toBe(true);
  });

  it('drops the result when aborted', async () => {
    const { workers, recognizer } = setup();
    const load = recognizer.load(() => undefined);
    workers[0].reply({ type: 'ready' });
    await load;
    const ctrl = new AbortController();
    const result = recognizer.transcribe(
      new Float32Array(2),
      'es',
      ctrl.signal,
    );
    await tick();
    ctrl.abort();
    await expect(result).rejects.toThrow();
    const id = (workers[0].sent[1] as { id: number }).id;
    expect(() =>
      workers[0].reply({ type: 'result', id, text: 'late' }),
    ).not.toThrow();
  });

  it('terminates the worker on dispose', async () => {
    const { workers, recognizer } = setup();
    const load = recognizer.load(() => undefined);
    workers[0].reply({ type: 'ready' });
    await load;
    recognizer.dispose();
    expect(workers[0].terminated).toBe(true);
  });
});
