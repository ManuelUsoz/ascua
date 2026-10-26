import type { ToolKind } from './model';

export interface PermissionRequest {
  requestId: string;
  toolUseId?: string;
  tool: ToolKind;
  title: string;
  /** Short domain summary (command, path), never raw SDK input. */
  detail?: string;
}

export type PermissionDecision =
  | { allow: true }
  | { allow: false; reason?: 'denied' | 'aborted' };
