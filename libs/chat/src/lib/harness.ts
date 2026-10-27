import type { ChatSession, ToolKind } from './model';
import type { Usage } from './usage';

export type ChatModeId = 'chat' | 'locate' | 'make' | 'review';

export type AgentRole =
  | 'scout'
  | 'planner'
  | 'implementer'
  | 'reviewer'
  | 'tester'
  | 'searcher';

/**
 * Provider-agnostic subagent spec. Provider adapters map it (Claude ->
 * `options.agents`).
 */
export interface AgentDefinition {
  role: AgentRole;
  /** When the parent agent should delegate to it. */
  description: string;
  instructions: string;
  tools: ToolKind[];
  /** Names of MCP servers whose tools it may use, besides `tools`. */
  mcpServers?: string[];
  model?: string;
}

export interface AgentRunRecord {
  role: AgentRole;
  sessionId: string;
  usage: Usage;
  status: 'running' | 'done' | 'failed';
}

export interface ToolHint {
  /** Tool or capability the agent should reach for. */
  tool: string;
  /** When to use it. */
  when: string;
}

export interface Methodology {
  id: string;
  title: string;
  rules: string;
  tools: ToolHint[];
}

/** Records tool names used during a session so gates can inspect them. */
export interface SessionTraceView {
  readonly names: readonly string[];
  used(pattern: string | RegExp): boolean;
}

export interface GateEvent {
  kind?: ToolKind;
  toolName: string;
  input: unknown;
  trace: SessionTraceView;
}

export type GateVerdict = { allow: true } | { allow: false; reason: string };

export interface HarnessGate {
  id: string;
  on: 'beforeTool' | 'beforeStop';
  check(e: GateEvent): GateVerdict;
}

/** What the provider receives for a turn. */
export interface TurnSetup {
  gates?: HarnessGate[];
  systemAppend?: string;
  allowedTools?: ToolKind[];
  deniedTools?: ToolKind[];
  agents?: AgentDefinition[];
}

export interface HarnessContext {
  projectPath: string;
  prompt: string;
  session: ChatSession;
  /** Names of the MCP servers this turn will carry. */
  mcpServers?: string[];
}

export interface HarnessMode {
  readonly id: ChatModeId;
  setup(ctx: HarnessContext): Promise<TurnSetup>;
}

export interface PlanRecord {
  id: string;
  projectId: string;
  title: string;
  body: string;
  updatedAt: number;
}

export interface PlanStore {
  list(projectId: string): Promise<PlanRecord[]>;
  get(projectId: string, id: string): Promise<PlanRecord | undefined>;
  save(plan: PlanRecord): Promise<void>;
}

export interface MemoryRecord {
  id: string;
  projectId: string;
  text: string;
  updatedAt: number;
}

export interface MemoryStore {
  list(projectId: string): Promise<MemoryRecord[]>;
  get(projectId: string, id: string): Promise<MemoryRecord | undefined>;
  related(projectId: string, text: string): Promise<MemoryRecord[]>;
  save(memory: MemoryRecord): Promise<void>;
}

export interface Handoff {
  id: string;
  projectId: string;
  body: string;
  updatedAt: number;
}

export interface HandoffStore {
  get(projectId: string): Promise<Handoff | undefined>;
  save(handoff: Handoff): Promise<void>;
}

export interface AgentRunner {
  run(agent: AgentDefinition, ctx: HarnessContext): Promise<AgentRunRecord>;
}

/** Passthrough: the only mode for now. */
export const DIRECT_MODE: HarnessMode = {
  id: 'chat',
  setup: async () => ({}),
};
