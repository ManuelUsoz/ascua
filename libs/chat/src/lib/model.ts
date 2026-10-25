import type { ReasoningEffort } from './catalog';
import type { ChatErrorKind } from './errors';
import type { ChatModeId } from './harness';
import type { PermissionRequest } from './permission';
import type { AgentProviderId } from './provider';
import type { Usage } from './usage';

export type ToolKind =
  | 'read'
  | 'edit'
  | 'execute'
  | 'search'
  | 'fetch'
  | 'other';

export type StopReason =
  | 'endTurn'
  | 'aborted'
  | 'maxTokens'
  | 'refused'
  | 'failed';

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'awaitingPermission'
  | 'failed';

export const PERMISSION_MODES = [
  'supervised',
  'acceptEdits',
  'auto',
  'fullAccess',
] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const DEFAULT_PERMISSION_MODE: PermissionMode = 'fullAccess';

/** Normalizes persisted values; legacy 'manual' and 'auto' are migrated. */
export function toPermissionMode(value: unknown): PermissionMode {
  if (value === 'manual') return 'supervised';
  // Legacy 'auto' approved every tool, which is now 'fullAccess'.
  if (value === 'auto') return 'fullAccess';
  return PERMISSION_MODES.includes(value as PermissionMode)
    ? (value as PermissionMode)
    : DEFAULT_PERMISSION_MODE;
}

export interface ChatSession {
  id: string;
  projectId: string;
  provider: AgentProviderId;
  mode: ChatModeId;
  permissionMode: PermissionMode;
  /** The user's selection; undefined is the provider default. */
  model?: string;
  effort?: ReasoningEffort;
  /** The model the provider reported in use. */
  resolvedModel?: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  usage: Usage;
}

export type ToolUsePart = {
  kind: 'toolUse';
  toolUseId: string;
  tool: ToolKind;
  title: string;
  status: 'running' | 'done' | 'failed';
};

export type ToolResultPart = {
  kind: 'toolResult';
  toolUseId: string;
  isError: boolean;
  summary?: string;
};

export type PermissionPart = {
  kind: 'permission';
  request: PermissionRequest;
  state: 'pending' | 'allowed' | 'denied';
};

export type MessagePart =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | ToolUsePart
  | ToolResultPart
  | PermissionPart
  | { kind: 'error'; code: ChatErrorKind };

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  createdAt: number;
  usage?: Usage;
  stop?: StopReason;
}

export interface ChatTranscript {
  session: ChatSession;
  messages: Message[];
}

export function pendingPermissions(messages: Message[]): PermissionRequest[] {
  const out: PermissionRequest[] = [];
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.kind === 'permission' && p.state === 'pending') out.push(p.request);
    }
  }
  return out;
}
