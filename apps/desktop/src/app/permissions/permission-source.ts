import type { PermissionDecision, PermissionRequest } from '@ascua/ipc';

/** What the bridge gives every source: one id counter and two callbacks. */
export interface PermissionSink {
  /** A request is waiting for the user's decision. */
  onRequest(request: PermissionRequest): void;
  /** The request was answered, or its origin went away. */
  onResolved(id: number): void;
  /** Next request id, shared by all sources. */
  nextId(): number;
}

/** Something that asks the user for permission through the bubble. */
export interface PermissionSource {
  start(sink: PermissionSink): void;
  stop(): void;
  /** Ignores ids this source does not own. */
  resolve(id: number, decision: PermissionDecision): void;
  /** Requests to re-send when the renderer (re)loads. */
  readonly pendingRequests: PermissionRequest[];
}
