import type { AssistantErrorKind } from './errors';

export type AssistantStatus =
  | { state: 'checking' | 'ready' | 'busy' }
  | { state: 'unavailable'; reason: 'notInstalled' | 'notLoggedIn' };

export type AssistantEvent =
  | { type: 'status'; status: AssistantStatus }
  | { type: 'turnStarted'; turn: string; text: string }
  | { type: 'text'; turn: string; delta: string }
  | { type: 'toolStarted'; turn: string; callId: string; tool: string }
  | { type: 'toolFinished'; turn: string; callId: string; ok: boolean }
  | { type: 'turnDone'; turn: string; outcome: 'done' | 'cancelled' }
  | { type: 'error'; turn?: string; kind: AssistantErrorKind };

/** Engine-agnostic port: Claude Code today, an API engine later. */
export interface AssistantEngine {
  status(refresh?: boolean): Promise<AssistantStatus>;
  /** Idempotent: spawns the process ahead of the first turn, sends nothing. */
  warm(): void;
  send(turn: string, text: string): Promise<void>;
  cancel(): void;
  reset(): void;
  stop(): void;
  onEvent(listener: (event: AssistantEvent) => void): () => void;
}
