import { randomUUID } from 'node:crypto';
import {
  AssistantError,
  reduceTranscript,
  type AssistantEngine,
  type AssistantEvent,
  type TranscriptMessage,
} from '@ascua/assistant';
import { IPC, type AssistantSnapshot } from '@ascua/ipc';

export const MAX_MESSAGE_CHARS = 8000;

export interface AssistantServiceDeps {
  engine: AssistantEngine;
  send: (channel: string, payload: unknown) => void;
}

/**
 * Owns the in-memory transcript (kept for a renderer reload) and forwards
 * every engine event to the renderer. Typed and spoken text share `send`.
 */
export class AssistantService {
  private messages: TranscriptMessage[] = [];
  private active = false;
  private turn: string | undefined;
  private readonly off: () => void;

  constructor(private readonly deps: AssistantServiceDeps) {
    this.off = deps.engine.onEvent((event) => this.handle(event));
  }

  async snapshot(refresh = false): Promise<AssistantSnapshot> {
    const status = await this.deps.engine.status(refresh);
    return { status, messages: this.messages };
  }

  async send(text: string): Promise<void> {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed || trimmed.length > MAX_MESSAGE_CHARS) {
      throw new AssistantError('failed', 'invalid message'); // i18n-ignore
    }
    if (this.active) throw new AssistantError('busy');
    const turn = randomUUID();
    this.turn = turn;
    this.active = true;
    this.handle({ type: 'turnStarted', turn, text: trimmed });
    try {
      await this.deps.engine.send(turn, trimmed);
    } catch (error) {
      this.active = false;
      throw error;
    }
  }

  warm(): void {
    this.deps.engine.warm();
  }

  cancel(): void {
    this.deps.engine.cancel();
  }

  reset(): void {
    this.deps.engine.reset();
    if (this.turn) {
      // Tell the renderer the running turn is over (avatar, voice sink).
      this.handle({
        type: 'turnDone',
        turn: this.turn,
        outcome: 'cancelled',
      });
    }
    this.messages = [];
    this.active = false;
  }

  stop(): void {
    this.off();
    this.deps.engine.stop();
  }

  private handle(event: AssistantEvent): void {
    if (event.type === 'turnDone' || event.type === 'error') {
      this.active = false;
      this.turn = undefined;
    }
    this.messages = reduceTranscript(this.messages, event);
    this.deps.send(IPC.assistantEvent, event);
  }
}
