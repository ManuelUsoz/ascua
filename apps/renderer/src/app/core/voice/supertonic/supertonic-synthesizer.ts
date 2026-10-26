import { isDevMode } from '@angular/core';
import { encodeError } from '@ascua/ipc';
import type {
  LoadProgress,
  SpeakOptions,
  SpeechSynthesizer,
  SpokenClip,
} from '../ports';
import type {
  SupertonicErrorCode,
  SupertonicRequest,
  SupertonicResponse,
} from './supertonic-protocol';

/** The slice of `Worker` this adapter needs, so tests can fake it. */
export interface SynthWorkerLike {
  onmessage: ((event: { data: SupertonicResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(message: SupertonicRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface ClipPlayer {
  play(
    pcm: Float32Array,
    sampleRate: number,
    signal: AbortSignal,
  ): Promise<void>;
  stop(): void;
}

const SILENT: SpokenClip = { play: () => Promise.resolve() };

function failure(code: SupertonicErrorCode): Error {
  return new Error(encodeError({ code }));
}

/**
 * Supertonic 3 in a Web Worker. Nothing is downloaded until the first
 * `load`/`render`, and the worker (~0.8 GB) is dropped after `idleMs` idle.
 */
export class SupertonicSynthesizer implements SpeechSynthesizer {
  private worker?: SynthWorkerLike;
  private loading?: Promise<void>;
  private onProgress: (progress: LoadProgress) => void = () => undefined;
  private settleLoad?: { resolve: () => void; reject: (e: Error) => void };
  private nextId = 0;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private readonly idleMs: number;
  private readonly pending = new Map<
    number,
    { resolve: (clip: SpokenClip) => void; reject: (error: Error) => void }
  >();

  constructor(
    private readonly createWorker: () => SynthWorkerLike,
    private readonly player: ClipPlayer,
    options: { idleMs?: number } = {},
  ) {
    this.idleMs = options.idleMs ?? 300_000;
  }

  load(onProgress: (progress: LoadProgress) => void): Promise<void> {
    this.onProgress = onProgress;
    this.loading ??= new Promise<void>((resolve, reject) => {
      this.settleLoad = { resolve, reject };
      const worker = this.createWorker();
      this.worker = worker;
      worker.onmessage = (event) => this.handle(event.data);
      worker.onerror = () => this.fail(failure('voice.modelFailed'));
      worker.postMessage({ type: 'load', engine: { kind: 'supertonic' } });
    });
    this.loading.catch(() => this.reset());
    return this.loading;
  }

  async render(sentence: string, options: SpeakOptions): Promise<SpokenClip> {
    this.clearIdle();
    await this.load(this.onProgress);
    const worker = this.worker;
    if (!worker) throw failure('voice.ttsUnavailable');
    const id = this.nextId++;
    return new Promise<SpokenClip>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({
        type: 'render',
        id,
        text: sentence,
        language: options.language,
        style: options.style,
      });
    }).finally(() => this.armIdle());
  }

  stop(): void {
    this.player.stop();
    // Drop pending results: callers have moved on, so settle them as silence.
    for (const p of this.pending.values()) p.resolve(SILENT);
    this.pending.clear();
  }

  dispose(): void {
    this.clearIdle();
    this.fail(new Error('disposed'));
    this.reset();
  }

  private handle(message: SupertonicResponse): void {
    switch (message.type) {
      case 'progress':
        this.onProgress({
          engine: 'tts',
          loaded: message.loaded,
          total: message.total,
        });
        return;
      case 'ready':
        if (isDevMode()) {
          console.info(
            '[ascua:voice]',
            'supertonic',
            message.device,
            message.threads,
          );
        }
        this.settleLoad?.resolve();
        this.settleLoad = undefined;
        return;
      case 'result': {
        const p = this.pending.get(message.id);
        if (!p) return; // stopped meanwhile
        this.pending.delete(message.id);
        p.resolve({
          play: (signal) =>
            this.player.play(message.audio, message.sampleRate, signal),
        });
        return;
      }
      case 'error': {
        const error = failure(message.code);
        if (message.id === undefined) {
          this.fail(error);
          return;
        }
        this.pending.get(message.id)?.reject(error);
        this.pending.delete(message.id);
      }
    }
  }

  private armIdle(): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (this.pending.size === 0) this.reset();
    }, this.idleMs);
  }

  private clearIdle(): void {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private fail(error: Error): void {
    this.settleLoad?.reject(error);
    this.settleLoad = undefined;
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
  }

  private reset(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.loading = undefined;
  }
}
