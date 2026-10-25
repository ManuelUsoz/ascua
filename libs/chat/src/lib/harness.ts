import type { ChatSession, ToolKind } from './model';
import type { Usage } from './usage';

/** Later: 'locate' | 'make' | 'review'. */
export type ChatModeId = 'chat';

export type AgentRole =
  | 'scout'
  | 'planner'
  | 'implementer'
  | 'reviewer'
  | 'tester';

export interface AgentDefinition {
  role: AgentRole;
  instructions: string;
  tools: ToolKind[];
}

export interface AgentRunRecord {
  role: AgentRole;
  sessionId: string;
  usage: Usage;
  status: 'running' | 'done' | 'failed';
}

/** What the provider receives for a turn. */
export interface TurnSetup {
  systemAppend?: string;
  allowedTools?: ToolKind[];
  agents?: AgentDefinition[];
}

export interface HarnessContext {
  projectPath: string;
  prompt: string;
  session: ChatSession;
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
