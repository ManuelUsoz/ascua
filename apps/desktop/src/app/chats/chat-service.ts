import {
  ChatError,
  EMPTY_USAGE,
  addUsage,
  applyChatEvent,
  type AgentEvent,
  type ChatEvent,
  type ChatEventPublisher,
  type ChatSession,
  type ChatSessionRecord,
  type ChatSessionStore,
  type ChatTranscript,
  type Message,
  type PermissionDecision,
  type PermissionRequest,
  type ProviderSession,
  type UsageLedger,
} from '@ascua/chat';
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
  resolve(decision: PermissionDecision): void;
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

  async start(projectId: string, prompt: string): Promise<ChatSession> {
    if (!(await this.o.projects.get(projectId))) {
      throw new ChatError('notFound');
    }
    const provider = await this.o.registry.current();
    const now = this.o.now();
    const record: ChatSessionRecord = {
      id: this.o.ids(),
      projectId,
      provider: provider.descriptor.id,
      mode: 'chat',
      title: titleOf(prompt),
      createdAt: now,
      updatedAt: now,
      status: 'idle',
      usage: EMPTY_USAGE,
      messages: [],
    };
    await this.save(record);
    return toSession(await this.accept(record, prompt));
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
    await this.accept(record, text);
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
          resumeToken: record.resumeToken,
          turn: setup,
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
    if (!run || run.dead || e.type === 'usage') return;
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
    return new Promise<PermissionDecision>((resolve) => {
      this.pending.set(request.requestId, {
        projectId: run.projectId,
        sessionId,
        messageId: run.assistantId,
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
