import type { Confirmer, ConfirmationRequest } from '@ascua/assistant';
import type { PermissionDecision, PermissionRequest } from '@ascua/ipc';
import type { PermissionSink, PermissionSource } from './permission-source';

/** An unanswered confirmation is refused after this long. */
export const CONFIRM_TIMEOUT_MS = 120_000;

interface Pending {
  request: PermissionRequest;
  settle(allowed: boolean): void;
}

/**
 * The assistant's write gate: shows each confirmation in the permission bubble
 * and resolves with the user's decision. Anything but an explicit allow
 * (deny, terminal, abort, timeout, shutdown) refuses.
 */
export class AssistantConfirmer implements Confirmer, PermissionSource {
  private sink: PermissionSink | null = null;
  private readonly pending = new Map<number, Pending>();

  get pendingRequests(): PermissionRequest[] {
    return [...this.pending.values()].map(({ request }) => request);
  }

  start(sink: PermissionSink): void {
    this.sink = sink;
  }

  stop(): void {
    this.dismissAll();
    this.sink = null;
  }

  confirm(
    confirmation: ConfirmationRequest,
    signal: AbortSignal,
  ): Promise<boolean> {
    const sink = this.sink;
    if (!sink || signal.aborted) return Promise.resolve(false);

    const id = sink.nextId();
    const request: PermissionRequest = {
      id,
      source: 'assistant',
      tool: confirmation.tool,
      params: confirmation.params,
      summary: confirmation.detail ?? '',
      input: confirmation.input,
    };

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => settle(false), CONFIRM_TIMEOUT_MS);
      const settle = (allowed: boolean) => {
        if (!this.pending.delete(id)) return;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(allowed);
        sink.onResolved(id);
      };
      const onAbort = () => settle(false);
      signal.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, { request, settle });
      sink.onRequest(request);
    });
  }

  resolve(id: number, decision: PermissionDecision): void {
    this.pending.get(id)?.settle(decision === 'allow');
  }

  /** Refuses everything pending (turn ended, cancelled or crashed). */
  dismissAll(): void {
    for (const { settle } of [...this.pending.values()]) settle(false);
  }
}
