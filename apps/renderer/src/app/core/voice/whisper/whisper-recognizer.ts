import { isDevMode } from '@angular/core';
import { encodeError, type Language } from '@ascua/ipc';
import type { LoadProgress, SpeechRecognizer } from '../ports';
import type {
  VoiceErrorCode,
  WhisperEngine,
  WhisperRequest,
  WhisperResponse,
} from './whisper-protocol';

/** The slice of `Worker` this adapter needs, so tests can fake it. */
export interface WorkerLike {
  onmessage: ((event: { data: WhisperResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(message: WhisperRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

function failure(code: VoiceErrorCode): Error {
  return new Error(encodeError({ code }));
}

/** Speech to text in a Web Worker. Rejections carry an encoded `AscuaError`. */
export class WhisperRecognizer implements SpeechRecognizer {
  private worker?: WorkerLike;
  private loading?: Promise<void>;
  private onProgress: (progress: LoadProgress) => void = () => undefined;
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (text: string) => void; reject: (error: Error) => void }
  >();
  private settleLoad?: { resolve: () => void; reject: (e: Error) => void };

  constructor(
    private readonly createWorker: () => WorkerLike,
    private readonly engine: WhisperEngine,
  ) {}

  load(onProgress: (progress: LoadProgress) => void): Promise<void> {
    this.onProgress = onProgress;
    this.loading ??= new Promise<void>((resolve, reject) => {
      this.settleLoad = { resolve, reject };
      const worker = this.createWorker();
      this.worker = worker;
      worker.onmessage = (event) => this.handle(event.data);
      worker.onerror = () => this.fail(failure('voice.modelFailed'));
      worker.postMessage({ type: 'load', engine: this.engine });
    });
    this.loading.catch(() => {
      // Let the next call retry with a fresh worker.
      this.reset();
    });
    return this.loading;
  }

  async transcribe(
    audio: Float32Array,
    language: Language,
    signal: AbortSignal,
    prompt?: string,
  ): Promise<string> {
    await this.load(this.onProgress);
    const worker = this.worker;
    if (!worker) throw failure('voice.modelFailed');
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    const id = this.nextId++;
    return new Promise<string>((resolve, reject) => {
      const abort = () => {
        this.pending.delete(id);
        reject(new DOMException('aborted', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
      this.pending.set(id, {
        resolve: (text) => {
          signal.removeEventListener('abort', abort);
          resolve(text);
        },
        reject: (error) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        },
      });
      worker.postMessage({ type: 'transcribe', id, audio, language, prompt }, [
        audio.buffer,
      ]);
    });
  }

  dispose(): void {
    this.fail(new Error('disposed'));
    this.reset();
  }

  private handle(message: WhisperResponse): void {
    switch (message.type) {
      case 'progress':
        this.onProgress({
          engine: 'stt',
          loaded: message.loaded,
          total: message.total,
        });
        return;
      case 'ready':
        if (isDevMode()) {
          console.info(
            '[ascua:voice]',
            'whisper',
            message.device,
            message.threads,
          );
        }
        this.settleLoad?.resolve();
        this.settleLoad = undefined;
        return;
      case 'result':
        this.pending.get(message.id)?.resolve(message.text);
        this.pending.delete(message.id);
        return;
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
