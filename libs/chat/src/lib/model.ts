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

export interface ChatSession {
  id: string;
  projectId: string;
  provider: AgentProviderId;
  mode: ChatModeId;
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
