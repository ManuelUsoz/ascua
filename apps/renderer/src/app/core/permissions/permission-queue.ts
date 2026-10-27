import {
  computed,
  DestroyRef,
  Injectable,
  inject,
  signal,
} from '@angular/core';
import type { PermissionDecision, PermissionRequest } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { Companion } from '../companion/companion';
import { text, type Text } from '../i18n/text';
import { RoomState } from '../room/room-state';
import { actFor } from './permission-act';

/**
 * Write tools with a `bubble.tool.<tool>` headline in the catalogs
 * (permission-queue.spec checks es and en have each one).
 */
export const ASSISTANT_TOOL_TITLES: ReadonlySet<string> = new Set([
  'terminals_start',
  'terminals_start_all',
  'terminals_stop',
  'terminals_open_shell',
  'terminals_close_shell',
  'terminals_write',
]);

/**
 * Claude Code permission requests waiting for an answer, oldest first. Main
 * keeps the hooks and re-sends pending requests on reload; this is the
 * renderer's view of them.
 */
@Injectable({ providedIn: 'root' })
export class PermissionQueue {
  private readonly api = inject(ASCUA_API);
  private readonly companion = inject(Companion);
  private readonly room = inject(RoomState);
  private readonly requests = signal<PermissionRequest[]>([]);

  readonly current = computed<PermissionRequest | undefined>(
    () => this.requests()[0],
  );
  readonly currentAct = computed(() => {
    const current = this.current();
    return current ? actFor(current) : undefined;
  });
  readonly isAssistant = computed(() => this.current()?.source === 'assistant');
  /** The assistant's request headline; a hook request shows its raw tool. */
  readonly title = computed<Text | undefined>(() => {
    const current = this.current();
    if (current?.source !== 'assistant') return undefined;
    const key = ASSISTANT_TOOL_TITLES.has(current.tool)
      ? `bubble.tool.${current.tool}`
      : 'bubble.tool.other';
    return text(key, { ...current.params, tool: current.tool });
  });
  readonly queuedText = computed<Text | undefined>(() =>
    this.requests().length > 1
      ? text('bubble.queued', { count: this.requests().length - 1 })
      : undefined,
  );

  constructor() {
    const api = this.api;
    if (!api) return;

    const offRequest = api.onPermissionRequest((request) =>
      this.enqueue(request),
    );
    const offDismissed = api.onPermissionDismissed((id) => this.dismiss(id));
    inject(DestroyRef).onDestroy(() => {
      offRequest();
      offDismissed();
    });
  }

  decide(decision: PermissionDecision): void {
    const current = this.current();
    if (!current) return;

    this.requests.update((queue) => queue.slice(1));
    const next = this.current();
    if (next) this.companion.need(actFor(next));
    else if (decision === 'allow') this.companion.celebrate();
    else this.companion.release();

    this.api?.resolvePermission(current.id, decision).catch(() => {
      // The hook may have gone away; Claude Code will fall back on its own.
    });
  }

  private enqueue(request: PermissionRequest): void {
    const wasEmpty = this.requests().length === 0;
    this.requests.update((queue) => [...queue, request]);
    if (wasEmpty) this.companion.need(actFor(request));
    // A hook request that arrives while the room is open brings the bubble
    // back; the assistant's is shown over the open room instead.
    if (request.source !== 'assistant') this.room.collapse();
  }

  private dismiss(id: number): void {
    if (!this.requests().some((request) => request.id === id)) return;
    this.requests.update((queue) =>
      queue.filter((request) => request.id !== id),
    );
    const next = this.current();
    if (next) this.companion.need(actFor(next));
    else this.companion.release();
  }
}
