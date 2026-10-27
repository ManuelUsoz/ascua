import {
  DEFAULT_PERMISSION_MODE,
  ChatError,
  EMPTY_USAGE,
  STATIC_MODEL_CATALOGS,
  addUsage,
  applyChatEvent,
  mergeCommands,
  nxyMode,
  type ModelCatalog,
  type ProviderModel,
  type AgentEvent,
  type ChatCommand,
  type ChatEvent,
  type ChatEventPublisher,
  type ChatSession,
  type ChatSessionRecord,
  type ChatSessionStore,
  type ChatTranscript,
  type McpServerSpec,
  type Message,
  type PermissionDecision,
  type PermissionRequest,
  type ProviderSession,
  type UsageLedger,
} from '@ascua/chat';
import type { ChatSessionPatch, ChatStartOptions } from '@ascua/ipc';
import type { ProjectRepository } from '../projects/project-repository';
import type { HarnessHost } from './harness/harness-host';
import type { ProviderRegistry } from './provider-registry';

const TITLE_MAX = 60;

export interface ChatServiceOptions {
  store: ChatSessionStore;
  ledger: UsageLedger;
  registry: ProviderRegistry;
  harness: HarnessHost;
  projects: ProjectRepository;
  bus: ChatEventPublisher;
  ids: () => string;
  now: () => number;
  mcpServers?: (
    projectId: string,
    cwd: string,
  ) => McpServerSpec[] | Promise<McpServerSpec[]>;
}

interface Run {
  projectId: string;
  record: ChatSessionRecord;
  /** Full history plus the in-flight assistant message. */
  messages: Message[];
  assistantId: string;
  dead: boolean;
  /** The assistant message and its usage are already in the record. */
  completed?: boolean;
}

interface PendingPermission {
  projectId: string;
  sessionId: string;
  messageId: string;
  tool: PermissionRequest['tool'];
  resolve(decision: PermissionDecision): void;
}

interface Capabilities {
  commands: ChatCommand[];
  models: ProviderModel[];
}

type Unstamped = ChatEvent extends infer E
  ? E extends ChatEvent
    ? Omit<E, 'sessionId' | 'projectId'>
    : never
  : never;

function toSession(r: ChatSessionRecord): ChatSession {
  return {
    id: r.id,
    projectId: r.projectId,
    provider: r.provider,
    mode: r.mode,
    permissionMode: r.permissionMode,
    model: r.model,
    effort: r.effort,
    resolvedModel: r.resolvedModel,
    title: r.title,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    status: r.status,
    usage: r.usage,
  };
}

function titleOf(prompt: string): string {
  const line = prompt.trim().replace(/\s+/g, ' ');
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
}

export class ChatService {
  private readonly runs = new Map<string, Run>();
  private readonly starting = new Set<string>();
  private readonly providerSessions = new Map<
    string,
    { projectId: string; session: ProviderSession }
  >();
  private readonly pending = new Map<string, PendingPermission>();
  private readonly capsCache = new Map<string, Promise<Capabilities>>();

  constructor(private readonly o: ChatServiceOptions) {}

  async list(projectId: string): Promise<ChatSession[]> {
    const records = await this.o.store.list(projectId);
    return records
      .map((r) => toSession(this.runs.get(r.id)?.record ?? r))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async transcript(
    projectId: string,
    sessionId: string,
  ): Promise<ChatTranscript | undefined> {
    const run = this.runs.get(sessionId);
    if (run && run.projectId === projectId) {
      return structuredClone({
        session: toSession(run.record),
        messages: run.messages,
      });
    }
    const record = await this.o.store.get(projectId, sessionId);
    if (!record) return undefined;
    return { session: toSession(record), messages: record.messages };
  }

  async start(
    projectId: string,
    prompt: string,
    options?: ChatStartOptions,
  ): Promise<ChatSession> {
    if (!(await this.o.projects.get(projectId))) {
      throw new ChatError('notFound');
    }
    const provider = await this.o.registry.current();
    const now = this.o.now();
    const nxy = nxyMode(prompt);
    const record: ChatSessionRecord = {
      id: this.o.ids(),
      projectId,
      provider: provider.descriptor.id,
      mode: nxy?.mode ?? 'chat',
      permissionMode: options?.permissionMode ?? DEFAULT_PERMISSION_MODE,
      model: options?.model,
      effort: options?.effort,
      title: titleOf(prompt),
      createdAt: now,
      updatedAt: now,
      status: 'idle',
      usage: EMPTY_USAGE,
      messages: [],
    };
    await this.save(record);
    if (nxy && !nxy.prompt) return toSession(record);
    return toSession(await this.accept(record, nxy ? nxy.prompt : prompt));
  }

  async send(
    projectId: string,
    sessionId: string,
    text: string,
  ): Promise<void> {
    if (this.runs.has(sessionId) || this.starting.has(sessionId)) {
      throw new ChatError('busy');
    }
    this.starting.add(sessionId);
    let record: ChatSessionRecord | undefined;
    try {
      record = await this.o.store.get(projectId, sessionId);
    } finally {
      this.starting.delete(sessionId);
    }
    if (!record) throw new ChatError('notFound');
    const nxy = nxyMode(text);
    if (nxy) {
      if (this.runs.has(sessionId) || this.starting.has(sessionId)) {
        throw new ChatError('busy');
      }
      if (nxy.mode !== record.mode) {
        record.mode = nxy.mode;
        this.dropProviderSession(sessionId);
      }
      if (!nxy.prompt) {
        record.updatedAt = this.o.now();
        await this.save(record);
        this.publish(record, { type: 'sessionUpdated' });
        return;
      }
      await this.save(record);
      text = nxy.prompt;
    }
    await this.accept(record, text);
  }

  async clear(projectId: string, sessionId: string): Promise<void> {
    if (this.runs.has(sessionId) || this.starting.has(sessionId)) {
      throw new ChatError('busy');
    }
    const record = await this.o.store.get(projectId, sessionId);
    if (!record) throw new ChatError('notFound');
    if (this.runs.has(sessionId)) throw new ChatError('busy');
    this.dropProviderSession(sessionId);
    record.resumeToken = undefined;
    record.messages = [];
    record.mode = 'chat';
    record.status = 'idle';
    record.updatedAt = this.o.now();
    await this.save(record);
    this.publish(record, { type: 'transcriptCleared' });
    this.publish(record, { type: 'sessionUpdated' });
  }

  async update(
    projectId: string,
    sessionId: string,
    patch: ChatSessionPatch,
  ): Promise<void> {
    const run = this.runs.get(sessionId);
    if (run && patch.mode !== undefined && patch.mode !== run.record.mode) {
      throw new ChatError('busy');
    }
    if (
      (run || this.starting.has(sessionId)) &&
      (patch.model !== undefined || patch.effort !== undefined)
    ) {
      throw new ChatError('busy');
    }
    const record =
      run?.projectId === projectId
        ? run.record
        : await this.o.store.get(projectId, sessionId);
    if (!record) throw new ChatError('notFound');
    if (patch.mode !== undefined && patch.mode !== record.mode) {
      record.mode = patch.mode;
      this.dropProviderSession(sessionId);
    }
    if (patch.permissionMode !== undefined) {
      record.permissionMode = patch.permissionMode;
      const live = this.providerSessions.get(sessionId)?.session;
      if (live?.setPermissionMode) {
        try {
          await live.setPermissionMode(patch.permissionMode);
        } catch (err) {
          console.error('chat setPermissionMode failed', err);
        }
      }
    }
    let runtimeChanged = false;
    if (patch.model !== undefined) {
      const next = patch.model ?? undefined;
      if (next !== record.model) runtimeChanged = true;
      record.model = next;
    }
    if (patch.effort !== undefined) {
      const next = patch.effort ?? undefined;
      if (next !== record.effort) runtimeChanged = true;
      record.effort = next;
    }
    if (runtimeChanged) this.dropProviderSession(sessionId);
    record.updatedAt = this.o.now();
    await this.save(record);
    const mode = patch.permissionMode;
    if (mode === 'fullAccess' || mode === 'acceptEdits') {
      for (const [requestId, p] of [...this.pending]) {
        if (p.projectId !== projectId || p.sessionId !== sessionId) continue;
        if (mode === 'acceptEdits' && p.tool !== 'edit') continue;
        this.settle(requestId, { allow: true }, true);
      }
    }
    this.publish(record, { type: 'sessionUpdated' });
  }

  private async capabilities(projectId: string): Promise<Capabilities> {
    const project = await this.o.projects.get(projectId);
    if (!project) throw new ChatError('notFound');
    let caps = this.capsCache.get(projectId);
    if (!caps) {
      caps = (async (): Promise<Capabilities> => {
        try {
          const provider = await this.o.registry.current();
          const got = await provider.capabilities?.(project.path);
          return { commands: got?.commands ?? [], models: got?.models ?? [] };
        } catch {
          // Fail open, but do not cache the failure: the next request retries.
          queueMicrotask(() => {
            if (this.capsCache.get(projectId) === caps)
              this.capsCache.delete(projectId);
          });
          return { commands: [], models: [] };
        }
      })();
      this.capsCache.set(projectId, caps);
    }
    return caps;
  }

  /** Fire-and-forget: primes the capabilities cache; never throws. */
  warm(projectId: string): void {
    this.capabilities(projectId).catch(() => undefined);
  }

  async commands(projectId: string): Promise<ChatCommand[]> {
    return mergeCommands((await this.capabilities(projectId)).commands);
  }

  async models(projectId: string): Promise<ModelCatalog> {
    const caps = await this.capabilities(projectId);
    const provider = (await this.o.registry.current()).descriptor.id;
    if (caps.models.length > 0) {
      return { provider, models: caps.models, source: 'live' };
    }
    return STATIC_MODEL_CATALOGS[provider];
  }

  private dropProviderSession(sessionId: string): void {
    const entry = this.providerSessions.get(sessionId);
    if (!entry) return;
    this.providerSessions.delete(sessionId);
    this.closeQuietly(entry.session);
  }

  /** Publish an event for a session that has no run. */
  private publish(
    record: ChatSessionRecord,
    event: { type: 'transcriptCleared' | 'sessionUpdated' },
  ): void {
    const base = { sessionId: record.id, projectId: record.projectId };
    this.o.bus.publish(
      event.type === 'transcriptCleared'
        ? { ...base, type: 'transcriptCleared' }
        : { ...base, type: 'sessionUpdated', session: toSession(record) },
    );
  }

  resolvePermission(
    projectId: string,
    sessionId: string,
    requestId: string,
    allow: boolean,
  ): void {
    const p = this.pending.get(requestId);
    if (!p || p.projectId !== projectId || p.sessionId !== sessionId) {
      throw new ChatError('notFound');
    }
    this.settle(
      requestId,
      allow ? { allow: true } : { allow: false, reason: 'denied' },
      true,
    );
  }

  abort(projectId: string, sessionId: string): void {
    const run = this.runs.get(sessionId);
    if (!run || run.projectId !== projectId) return;
    this.denyAll((p) => p.sessionId === sessionId);
    this.providerSessions.get(sessionId)?.session.abort();
  }

  async remove(projectId: string, sessionId: string): Promise<void> {
    const record = await this.o.store.get(projectId, sessionId);
    if (!record) throw new ChatError('notFound');
    // Mark the run dead before touching the store so late events do not resave.
    const run = this.runs.get(sessionId);
    if (run) {
      run.dead = true;
      this.runs.delete(sessionId);
    }
    this.denyAll((p) => p.sessionId === sessionId);
    this.providerSessions.get(sessionId)?.session.abort();
    this.dropProviderSession(sessionId);
    await this.o.store.remove(projectId, sessionId);
    this.o.bus.publish({
      sessionId,
      projectId,
      type: 'sessionRemoved',
    });
  }

  async removedProject(projectId: string): Promise<void> {
    this.denyAll((p) => p.projectId === projectId);
    for (const run of this.runs.values()) {
      if (run.projectId === projectId) run.dead = true;
    }
    for (const [id, entry] of [...this.providerSessions]) {
      if (entry.projectId !== projectId) continue;
      this.providerSessions.delete(id);
      this.closeQuietly(entry.session);
    }
    for (const [id, run] of [...this.runs]) {
      if (run.projectId === projectId) this.runs.delete(id);
    }
    await this.o.store.removeProject(projectId);
  }

  dispose(): void {
    this.denyAll(() => true);
    for (const run of this.runs.values()) run.dead = true;
    this.runs.clear();
    for (const entry of this.providerSessions.values()) {
      this.closeQuietly(entry.session);
    }
    this.providerSessions.clear();
  }

  private async accept(
    record: ChatSessionRecord,
    text: string,
  ): Promise<ChatSessionRecord> {
    const { projectId, id: sessionId } = record;
    if (this.runs.has(sessionId)) throw new ChatError('busy');
    const project = await this.o.projects.get(projectId);
    if (!project) throw new ChatError('notFound');
    if (this.runs.has(sessionId)) throw new ChatError('busy');

    const now = this.o.now();
    const user: Message = {
      id: this.o.ids(),
      sessionId,
      role: 'user',
      parts: [{ kind: 'text', text }],
      createdAt: now,
    };
    const assistant: Message = {
      id: this.o.ids(),
      sessionId,
      role: 'assistant',
      parts: [],
      createdAt: now,
    };
    record.messages = [...record.messages, user];
    record.status = 'running';
    record.updatedAt = now;
    const run: Run = {
      projectId,
      record,
      messages: [...record.messages],
      assistantId: assistant.id,
      dead: false,
    };
    this.runs.set(sessionId, run);
    try {
      await this.o.store.appendMessage(projectId, sessionId, user);
    } catch (err) {
      this.runs.delete(sessionId);
      throw err instanceof ChatError ? err : new ChatError('saveFailed');
    }
    this.emit(run, { type: 'messageStarted', message: user });
    this.emit(run, { type: 'messageStarted', message: assistant });
    this.emit(run, { type: 'statusChanged', status: 'running' });
    void this.turn(run, project.path, text);
    return record;
  }

  /** A broken spec builder never blocks a chat. */
  private async mcpServers(
    projectId: string,
    cwd: string,
  ): Promise<McpServerSpec[]> {
    try {
      return (await this.o.mcpServers?.(projectId, cwd)) ?? [];
    } catch {
      return [];
    }
  }

  private async turn(run: Run, cwd: string, text: string): Promise<void> {
    const { record } = run;
    const sessionId = record.id;
    let phase: 'open' | 'prompt' = 'open';
    try {
      let entry = this.providerSessions.get(sessionId);
      if (!entry) {
        const provider = this.o.registry.get(record.provider);
        if (!provider) throw new ChatError('providerNotConfigured');
        const session = toSession(record);
        const setup = await this.o.harness.setup(record.mode, {
          projectPath: cwd,
          prompt: text,
          session,
        });
        const opened = await provider.open({
          cwd,
          mcpServers: await this.mcpServers(record.projectId, cwd),
          resumeToken: record.resumeToken,
          turn: setup,
          runtime: {
            permissionMode: record.permissionMode,
            model: record.model,
            effort: record.effort,
          },
          onEvent: (e) => this.onAgentEvent(sessionId, e),
          onPermission: (req) => this.onPermission(sessionId, req),
        });
        entry = { projectId: record.projectId, session: opened };
        if (run.dead) {
          this.closeQuietly(opened);
          return;
        }
        this.providerSessions.set(sessionId, entry);
      }
      phase = 'prompt';
      // Usage comes from the TurnResult only; the `usage` AgentEvent is ignored.
      const result = await entry.session.prompt(text);
      if (run.dead) return;

      const streamed = run.messages.find((m) => m.id === run.assistantId);
      const message: Message = {
        ...(streamed as Message),
        usage: result.usage,
        stop: result.stop,
      };
      run.completed = true;
      record.messages = [...record.messages, message];
      record.usage = addUsage(record.usage, result.usage);
      record.resumeToken = entry.session.resumeToken;
      record.updatedAt = this.o.now();
      record.status = 'idle';
      await this.o.ledger.record({
        sessionId,
        projectId: record.projectId,
        provider: record.provider,
        messageId: message.id,
        at: record.updatedAt,
        usage: result.usage,
      });
      await this.o.store.save(record);
      if (run.dead) return;
      this.emit(run, { type: 'messageCompleted', message });
      this.emit(run, { type: 'sessionUpdated', session: toSession(record) });
      this.emit(run, { type: 'statusChanged', status: 'idle' });
    } catch (err) {
      await this.fail(run, err, phase);
    } finally {
      // Nothing may stay unresolved, whatever path got us here.
      this.denyAll((p) => p.sessionId === sessionId);
      if (this.runs.get(sessionId) === run) this.runs.delete(sessionId);
    }
  }

  private async fail(
    run: Run,
    err: unknown,
    phase: 'open' | 'prompt',
  ): Promise<void> {
    const { record } = run;
    const sessionId = record.id;
    this.denyAll((p) => p.sessionId === sessionId);
    const entry = this.providerSessions.get(sessionId);
    if (entry) {
      this.providerSessions.delete(sessionId);
      this.closeQuietly(entry.session);
    }
    if (run.dead) return;
    const kind =
      err instanceof ChatError
        ? err.kind
        : phase === 'open'
          ? 'startFailed'
          : 'promptFailed';
    if (run.completed) {
      // The turn already finished: never append a second message or usage.
      this.emit(run, { type: 'error', error: kind });
      this.emit(run, { type: 'statusChanged', status: 'failed', error: kind });
      return;
    }
    const streamed = run.messages.find((m) => m.id === run.assistantId);
    const message: Message = {
      ...(streamed as Message),
      parts: [...(streamed?.parts ?? []), { kind: 'error', code: kind }],
      stop: 'failed',
    };
    record.messages = [...record.messages, message];
    record.status = 'failed';
    record.updatedAt = this.o.now();
    try {
      await this.o.store.save(record);
    } catch {
      // The failure itself is still reported below.
    }
    if (run.dead) return;
    this.emit(run, { type: 'messageCompleted', message });
    this.emit(run, { type: 'error', error: kind });
    this.emit(run, { type: 'statusChanged', status: 'failed', error: kind });
  }

  private onAgentEvent(sessionId: string, e: AgentEvent): void {
    const run = this.runs.get(sessionId);
    if (!run || run.dead) return;
    if (e.type === 'sessionInfo') {
      if (e.commands || e.models) {
        const projectId = run.projectId;
        const prev = this.capsCache.get(projectId);
        this.capsCache.set(
          projectId,
          Promise.resolve(prev)
            .catch(() => undefined)
            .then((p) => ({
              commands: e.commands ?? p?.commands ?? [],
              models: e.models?.length ? e.models : (p?.models ?? []),
            })),
        );
        this.emit(run, {
          type: 'capabilitiesChanged',
          commands: e.commands ? mergeCommands(e.commands) : undefined,
          models: e.models,
        });
      }
      if (e.model && e.model !== run.record.resolvedModel) {
        run.record.resolvedModel = e.model;
        this.emit(run, {
          type: 'sessionUpdated',
          session: toSession(run.record),
        });
      }
      return;
    }
    if (e.type === 'usage') return;
    this.emit(run, { ...e, messageId: run.assistantId });
  }

  private onPermission(
    sessionId: string,
    request: PermissionRequest,
  ): Promise<PermissionDecision> {
    const run = this.runs.get(sessionId);
    if (!run || run.dead) {
      return Promise.resolve({ allow: false, reason: 'aborted' });
    }
    const mode = run.record.permissionMode;
    if (
      mode === 'fullAccess' ||
      (mode === 'acceptEdits' && request.tool === 'edit')
    ) {
      return Promise.resolve({ allow: true });
    }
    return new Promise<PermissionDecision>((resolve) => {
      this.pending.set(request.requestId, {
        projectId: run.projectId,
        sessionId,
        messageId: run.assistantId,
        tool: request.tool,
        resolve,
      });
      run.record.status = 'awaitingPermission';
      this.emit(run, {
        type: 'permissionRequested',
        messageId: run.assistantId,
        request,
      });
      this.emit(run, { type: 'statusChanged', status: 'awaitingPermission' });
    });
  }

  private settle(
    requestId: string,
    decision: PermissionDecision,
    resume: boolean,
  ): void {
    const p = this.pending.get(requestId);
    if (!p) return;
    this.pending.delete(requestId);
    p.resolve(decision);
    const run = this.runs.get(p.sessionId);
    if (!run || run.dead) return;
    this.emit(run, {
      type: 'permissionSettled',
      messageId: p.messageId,
      requestId,
      allowed: decision.allow,
    });
    if (resume) {
      run.record.status = 'running';
      this.emit(run, { type: 'statusChanged', status: 'running' });
    }
  }

  private denyAll(match: (p: PendingPermission) => boolean): void {
    for (const [requestId, p] of [...this.pending]) {
      if (match(p)) {
        this.settle(requestId, { allow: false, reason: 'aborted' }, false);
      }
    }
  }

  /** Fold into the in-memory transcript, then publish. */
  private emit(run: Run, event: Unstamped): void {
    const full = {
      ...event,
      sessionId: run.record.id,
      projectId: run.projectId,
    } as ChatEvent;
    run.messages = applyChatEvent(run.messages, full);
    this.o.bus.publish(full);
  }

  private async save(record: ChatSessionRecord): Promise<void> {
    try {
      await this.o.store.save(record);
    } catch (err) {
      throw err instanceof ChatError ? err : new ChatError('saveFailed');
    }
  }

  private closeQuietly(session: ProviderSession): void {
    try {
      session.close();
    } catch (err) {
      console.error('chat provider close failed', err);
    }
  }
}
