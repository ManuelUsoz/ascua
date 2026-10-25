import type { ProviderModel, ReasoningEffort } from './catalog';
import type { ChatCommand } from './commands';
import type { AgentEvent, ChatEvent } from './events';
import type { TurnSetup } from './harness';
import type { ChatSession, Message, PermissionMode, StopReason } from './model';
import type { PermissionDecision, PermissionRequest } from './permission';
import type { ProviderAuth, ProviderDescriptor } from './provider';
import type { Usage, UsageEntry, UsageQuery, UsageTotals } from './usage';

export interface TurnResult {
  stop: StopReason;
  usage: Usage;
}

export interface ProviderSession {
  readonly resumeToken: string;
  prompt(text: string): Promise<TurnResult>;
  abort(): void;
  close(): void;
  setPermissionMode?(mode: PermissionMode): Promise<void>;
}

export interface OpenOptions {
  cwd: string;
  resumeToken?: string;
  turn: TurnSetup;
  runtime: {
    permissionMode: PermissionMode;
    model?: string;
    effort?: ReasoningEffort;
  };
  onEvent(e: AgentEvent): void;
  onPermission(req: PermissionRequest): Promise<PermissionDecision>;
}

export interface AgentProvider {
  readonly descriptor: ProviderDescriptor;
  authStatus(): Promise<ProviderAuth>;
  loginCommand(): { file: string; args: string[] } | undefined;
  open(options: OpenOptions): Promise<ProviderSession>;
  /** Commands and models of a project, without a live session. */
  capabilities?(
    cwd: string,
  ): Promise<{ commands: ChatCommand[]; models: ProviderModel[] }>;
}

/** The resume token is main-only. */
export type ChatSessionRecord = ChatSession & {
  messages: Message[];
  resumeToken?: string;
};

export interface ChatSessionStore {
  list(projectId: string): Promise<ChatSessionRecord[]>;
  get(projectId: string, id: string): Promise<ChatSessionRecord | undefined>;
  save(record: ChatSessionRecord): Promise<void>;
  appendMessage(projectId: string, id: string, message: Message): Promise<void>;
  removeProject(projectId: string): Promise<void>;
}

export interface UsageLedger {
  record(entry: UsageEntry): Promise<void>;
  totals(query: UsageQuery): Promise<UsageTotals>;
  entries(query: UsageQuery): Promise<UsageEntry[]>;
}

export interface ChatEventPublisher {
  publish(e: ChatEvent): void;
}

export interface ChatEventSource {
  subscribe(listener: (e: ChatEvent) => void): () => void;
}
