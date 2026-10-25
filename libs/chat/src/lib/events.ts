import type { ChatErrorKind } from './errors';
import type {
  ChatSession,
  Message,
  SessionStatus,
  StopReason,
  ToolResultPart,
  ToolUsePart,
} from './model';
import type { PermissionRequest } from './permission';
import type { Usage } from './usage';

interface Ids {
  sessionId: string;
  projectId: string;
}

export type ChatEvent = Ids &
  (
    | { type: 'messageStarted'; message: Message }
    | {
        type: 'messageDelta';
        messageId: string;
        part: 'text' | 'thinking';
        text: string;
      }
    | {
        type: 'toolUpdated';
        messageId: string;
        part: ToolUsePart | ToolResultPart;
      }
    | {
        type: 'permissionRequested';
        messageId: string;
        request: PermissionRequest;
      }
    | {
        type: 'permissionSettled';
        messageId: string;
        requestId: string;
        allowed: boolean;
      }
    | { type: 'messageCompleted'; message: Message }
    | { type: 'statusChanged'; status: SessionStatus; error?: ChatErrorKind }
    | { type: 'sessionUpdated'; session: ChatSession }
    | { type: 'error'; error: ChatErrorKind }
  );

/** Provider-side events, without ids: the service stamps them. */
export type AgentEvent =
  | { type: 'messageDelta'; part: 'text' | 'thinking'; text: string }
  | { type: 'toolUpdated'; part: ToolUsePart | ToolResultPart }
  | { type: 'usage'; usage: Usage; stop?: StopReason };
