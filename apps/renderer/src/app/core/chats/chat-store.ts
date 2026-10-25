import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import type { AscuaApi, AscuaError, TerminalSession } from '@ascua/ipc';
import {
  applyChatEvent,
  pendingPermissions,
  type AgentProviderId,
  type ChatEvent,
  type ChatSession,
  type Message,
  type PermissionRequest,
  type ProviderAuth,
  type ProviderInfo,
  type SessionStatus,
} from '@ascua/chat';
import { ASCUA_API } from '../bridge/ascua-api';
import { toAscuaError } from '../i18n/app-error';

const NO_DESKTOP: AscuaError = { code: 'noDesktop' };
const NONE: readonly never[] = [];

const MAX_BUFFERED_EVENTS = 500;
const MAX_BUFFERED_SESSIONS = 20;

/**
 * Applies events buffered around a snapshot. Main's snapshot already holds
 * in-flight partial text, so deltas for a message the snapshot has are
 * skipped (tradeoff: a few characters may show late until the next delta or
 * completion). Other events are idempotent or guarded against duplicates.
 */
function replay(snapshot: Message[], events: ChatEvent[]): Message[] {
  const known = new Set(snapshot.map((m) => m.id));
  let messages = snapshot;
  for (const e of events) {
    if (
      e.type === 'messageStarted' &&
      messages.some((m) => m.id === e.message.id)
    ) {
      continue;
    }
    if (e.type === 'messageDelta' && known.has(e.messageId)) continue;
    if (
      e.type === 'permissionRequested' &&
      messages.some((m) =>
        m.parts.some(
          (p) =>
            p.kind === 'permission' &&
            p.request.requestId === e.request.requestId,
        ),
      )
    ) {
      continue;
    }
    messages = applyChatEvent(messages, e);
  }
  return messages;
}

function upsert(list: ChatSession[], session: ChatSession): ChatSession[] {
  const rest = list.filter((s) => s.id !== session.id);
  return [session, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Chat state mirrored from main: providers, sessions and live transcripts.
 * Transcripts are fetched once and then folded from pushed events with the
 * same `applyChatEvent` main uses.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly api = inject(ASCUA_API);
  private readonly destroyRef = inject(DestroyRef);
  private readonly providerList = signal<ProviderInfo[]>([]);
  private readonly selected = signal<AgentProviderId | undefined>(undefined);
  private readonly authState = signal<ProviderAuth | undefined>(undefined);
  private readonly sessionMap = signal<Record<string, ChatSession[]>>({});
  private readonly transcripts = signal<Record<string, Message[]>>({});
  private readonly statuses = signal<Record<string, SessionStatus>>({});
  private readonly failure = signal<AscuaError | undefined>(undefined);
  private readonly fetching = new Set<string>();
  private readonly loading = new Set<string>();
  private readonly buffers = new Map<string, ChatEvent[]>();
  private subscribed = false;

  readonly providers = this.providerList.asReadonly();
  readonly selectedProvider = this.selected.asReadonly();
  readonly auth = this.authState.asReadonly();
  readonly error = this.failure.asReadonly();

  sessions(projectId: string): readonly ChatSession[] {
    return this.sessionMap()[projectId] ?? NONE;
  }

  /** Undefined until `loadTranscript` has resolved. */
  transcript(sessionId: string): readonly Message[] | undefined {
    return this.transcripts()[sessionId];
  }

  status(sessionId: string): SessionStatus {
    return this.statuses()[sessionId] ?? 'idle';
  }

  pendingPermissions(sessionId: string): PermissionRequest[] {
    return pendingPermissions(this.transcripts()[sessionId] ?? []);
  }

  /** Reactive view of the pending permissions of one session. */
  pendingFor(sessionId: () => string) {
    return computed(() => this.pendingPermissions(sessionId()));
  }

  async loadProviders(): Promise<void> {
    const api = this.api;
    if (!api) return this.failure.set(NO_DESKTOP);
    this.subscribe(api);
    this.failure.set(undefined);
    try {
      const [providers, settings] = await Promise.all([
        api.listChatProviders(),
        api.getSettings(),
      ]);
      this.providerList.set(providers);
      this.selected.set(
        settings.chatProvider ?? providers.find((p) => p.selected)?.id,
      );
    } catch (e) {
      this.failure.set(toAscuaError(e));
    }
  }

  async checkAuth(id: AgentProviderId): Promise<ProviderAuth | undefined> {
    const api = this.api;
    if (!api) {
      this.failure.set(NO_DESKTOP);
      return undefined;
    }
    this.authState.set(undefined);
    try {
      const auth = await api.getChatProviderAuth(id);
      this.authState.set(auth);
      return auth;
    } catch (e) {
      this.failure.set(toAscuaError(e));
      return undefined;
    }
  }

  /** Opens the login terminal; returns its session id or the error. */
  async login(
    projectId: string,
    id: AgentProviderId,
  ): Promise<TerminalSession | AscuaError> {
    const api = this.api;
    if (!api) return NO_DESKTOP;
    try {
      const result = await api.loginChatProvider(projectId, id);
      return result;
    } catch (e) {
      return toAscuaError(e);
    }
  }

  async select(id: AgentProviderId): Promise<AscuaError | undefined> {
    const api = this.api;
    if (!api) return NO_DESKTOP;
    try {
      const settings = await api.selectChatProvider(id);
      this.selected.set(settings.chatProvider ?? id);
      this.providerList.update((list) =>
        list.map((p) => ({ ...p, selected: p.id === id })),
      );
      return undefined;
    } catch (e) {
      return toAscuaError(e);
    }
  }

  /** Loads the project's sessions once; no-op if loaded or loading. */
  ensureLoaded(projectId: string): void {
    if (this.sessionMap()[projectId] || this.loading.has(projectId)) return;
    this.loading.add(projectId);
    void this.load(projectId).finally(() => this.loading.delete(projectId));
  }

  async load(projectId: string): Promise<void> {
    const api = this.api;
    if (!api) return this.failure.set(NO_DESKTOP);
    this.subscribe(api);
    this.failure.set(undefined);
    try {
      const list = await api.listChatSessions(projectId);
      this.sessionMap.update((m) => ({ ...m, [projectId]: list }));
      this.statuses.update((s) => {
        const next = { ...s };
        for (const session of list) next[session.id] = session.status;
        return next;
      });
    } catch (e) {
      this.failure.set(toAscuaError(e));
    }
  }

  /** Fetches the transcript once; later changes arrive as events. */
  async loadTranscript(projectId: string, sessionId: string): Promise<void> {
    const api = this.api;
    if (!api) return this.failure.set(NO_DESKTOP);
    if (this.transcripts()[sessionId] || this.fetching.has(sessionId)) return;
    this.subscribe(api);
    await this.fetchSnapshot(api, projectId, sessionId);
  }

  private async fetchSnapshot(
    api: AscuaApi,
    projectId: string,
    sessionId: string,
  ): Promise<void> {
    if (this.fetching.has(sessionId)) return;
    this.fetching.add(sessionId);
    try {
      const t = await api.getChatTranscript(projectId, sessionId);
      if (!t) return this.failure.set({ code: 'chat.notFound' });
      const buffered = this.buffers.get(sessionId) ?? [];
      this.buffers.delete(sessionId);
      this.transcripts.update((m) => ({
        ...m,
        [sessionId]: replay(t.messages, buffered),
      }));
      this.statuses.update((s) => ({ ...s, [sessionId]: t.session.status }));
      this.putSession(t.session);
    } catch (e) {
      this.failure.set(toAscuaError(e));
    } finally {
      this.fetching.delete(sessionId);
      if (!this.transcripts()[sessionId]) this.buffers.delete(sessionId);
    }
  }

  private buffer(event: ChatEvent): void {
    const id = event.sessionId;
    let list = this.buffers.get(id);
    if (!list) {
      if (this.buffers.size >= MAX_BUFFERED_SESSIONS) {
        const oldest = this.buffers.keys().next().value;
        if (oldest !== undefined) this.buffers.delete(oldest);
      }
      list = [];
      this.buffers.set(id, list);
    }
    if (list.length < MAX_BUFFERED_EVENTS) list.push(event);
  }

  async start(
    projectId: string,
    prompt: string,
  ): Promise<ChatSession | AscuaError> {
    const api = this.api;
    if (!api) return NO_DESKTOP;
    this.subscribe(api);
    try {
      const result = await api.startChat(projectId, prompt);
      if (!result.ok) return result.error;
      this.putSession(result.session);
      // Events can beat the invoke reply: show them now, then reconcile.
      const early = this.buffers.get(result.session.id) ?? [];
      this.buffers.delete(result.session.id);
      this.transcripts.update((m) => ({
        ...m,
        [result.session.id]: replay([], early),
      }));
      void this.fetchSnapshot(api, projectId, result.session.id);
      return result.session;
    } catch (e) {
      return toAscuaError(e);
    }
  }

  async send(
    projectId: string,
    sessionId: string,
    text: string,
  ): Promise<AscuaError | undefined> {
    const api = this.api;
    if (!api) return NO_DESKTOP;
    try {
      return await api.sendChatPrompt(projectId, sessionId, text);
    } catch (e) {
      return toAscuaError(e);
    }
  }

  async abort(projectId: string, sessionId: string): Promise<void> {
    const api = this.api;
    if (!api) return;
    try {
      await api.abortChat(projectId, sessionId);
    } catch (e) {
      this.failure.set(toAscuaError(e));
    }
  }

  async resolvePermission(
    projectId: string,
    sessionId: string,
    requestId: string,
    allow: boolean,
  ): Promise<AscuaError | undefined> {
    const api = this.api;
    if (!api) return NO_DESKTOP;
    try {
      return await api.resolveChatPermission(
        projectId,
        sessionId,
        requestId,
        allow,
      );
    } catch (e) {
      return toAscuaError(e);
    }
  }

  private subscribe(api: AscuaApi): void {
    if (this.subscribed) return;
    this.subscribed = true;
    this.destroyRef.onDestroy(api.onChatEvent((e) => this.apply(e)));
    this.destroyRef.onDestroy(
      api.onSettingsChanged((s) => this.selected.set(s.chatProvider)),
    );
  }

  private apply(event: ChatEvent): void {
    const id = event.sessionId;
    if (event.type === 'statusChanged') {
      this.statuses.update((s) => ({ ...s, [id]: event.status }));
    } else if (event.type === 'sessionUpdated') {
      this.putSession(event.session);
    }
    const current = this.transcripts()[id];
    if (!current || this.fetching.has(id)) this.buffer(event);
    if (current) {
      this.transcripts.update((m) => ({
        ...m,
        [id]: applyChatEvent(current, event),
      }));
    }
  }

  private putSession(session: ChatSession): void {
    this.sessionMap.update((m) => ({
      ...m,
      [session.projectId]: upsert(m[session.projectId] ?? [], session),
    }));
  }
}
