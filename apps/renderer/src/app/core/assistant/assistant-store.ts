import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import {
  reduceTranscript,
  type AssistantEvent,
  type AssistantStatus,
  type TranscriptMessage,
} from '@ascua/assistant';
import type { AscuaApi, AscuaError } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { Companion } from '../companion/companion';
import { toAscuaError } from '../i18n/app-error';

const NO_DESKTOP: AscuaError = { code: 'noDesktop' };

/**
 * The assistant conversation. Main owns the engine and keeps the transcript;
 * this mirrors it by reducing the same events, and drives the avatar's
 * working face.
 */
@Injectable({ providedIn: 'root' })
export class AssistantStore {
  private readonly api = inject(ASCUA_API);
  private readonly destroyRef = inject(DestroyRef);
  private readonly companion = inject(Companion);
  private readonly transcript = signal<TranscriptMessage[]>([]);
  private readonly state = signal<AssistantStatus>({ state: 'checking' });
  private readonly failure = signal<AscuaError | undefined>(undefined);
  private readonly listeners = new Set<(event: AssistantEvent) => void>();
  private subscribed = false;
  private loaded = false;

  readonly messages = this.transcript.asReadonly();
  readonly status = this.state.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly busy = computed(
    () =>
      this.state().state === 'busy' ||
      this.transcript().some((m) => m.state === 'streaming'),
  );

  /** Follows events from main without asking for the snapshot. Idempotent. */
  listen(): void {
    const api = this.api;
    if (!api || this.subscribed) return;
    this.subscribed = true;
    this.destroyRef.onDestroy(
      api.onAssistantEvent((event) => this.apply(event)),
    );
  }

  /** Asks main to spawn the model process ahead of the first turn. Best effort. */
  warm(): void {
    void this.api?.assistantWarm().catch(() => undefined);
  }

  /** Follows events and reads the snapshot. Safe to call more than once. */
  async load(): Promise<void> {
    const api = this.api;
    if (!api) {
      this.failure.set(NO_DESKTOP);
      return;
    }
    this.listen();
    try {
      const snapshot = await api.assistantStatus();
      this.loaded = true;
      this.state.set(snapshot.status);
      this.transcript.set(snapshot.messages);
    } catch (e) {
      this.failure.set(toAscuaError(e));
    }
  }

  async send(text: string): Promise<void> {
    if (!this.loaded) await this.load();
    await this.call((api) => api.assistantSend(text));
  }

  async cancel(): Promise<void> {
    await this.call((api) => api.assistantCancel());
  }

  async reset(): Promise<void> {
    await this.call(async (api) => {
      await api.assistantReset();
      this.transcript.set([]);
    });
  }

  /** Asks main to check the engine again (after installing or signing in). */
  async retry(): Promise<void> {
    await this.call(async (api) => {
      this.state.set((await api.assistantStatus(true)).status);
    });
  }

  /** The raw events, for consumers such as the voice sink. */
  events(listener: (event: AssistantEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private apply(event: AssistantEvent): void {
    if (event.type === 'status') this.state.set(event.status);
    else this.transcript.update((m) => reduceTranscript(m, event));
    switch (event.type) {
      case 'turnStarted':
      case 'toolFinished':
        this.companion.work('think');
        break;
      case 'toolStarted':
        this.companion.work('read');
        break;
      case 'turnDone':
      case 'error':
        this.companion.work(null);
        break;
    }
    for (const listener of [...this.listeners]) listener(event);
  }

  private async call(fn: (api: AscuaApi) => Promise<unknown>): Promise<void> {
    const api = this.api;
    if (!api) return this.failure.set(NO_DESKTOP);
    this.failure.set(undefined);
    try {
      await fn(api);
    } catch (e) {
      this.failure.set(toAscuaError(e));
    }
  }
}
