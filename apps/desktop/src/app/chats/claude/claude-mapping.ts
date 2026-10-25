import type {
  CanUseTool,
  PermissionResult,
  SDKMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import {
  ChatError,
  type AgentEvent,
  type ChatErrorKind,
  type PermissionDecision,
  type PermissionRequest,
  type StopReason,
  type ToolKind,
  type Usage,
} from '@ascua/chat';

export type SdkInput = Parameters<CanUseTool>[1];

const MAX_DETAIL = 200;

const KINDS: Record<string, ToolKind> = {
  Read: 'read',
  NotebookRead: 'read',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Bash: 'execute',
  BashOutput: 'execute',
  KillShell: 'execute',
  Grep: 'search',
  Glob: 'search',
  WebSearch: 'search',
  WebFetch: 'fetch',
};

export function toolKind(name: string): ToolKind {
  return KINDS[name] ?? 'other';
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function truncate(s: string): string {
  return s.length > MAX_DETAIL ? `${s.slice(0, MAX_DETAIL - 1)}…` : s;
}

function detailOf(name: string, input: SdkInput): string | undefined {
  const d =
    str(input['command']) ??
    str(input['file_path']) ??
    str(input['notebook_path']) ??
    str(input['url']) ??
    str(input['pattern']) ??
    str(input['query']);
  return d ? truncate(d) : undefined;
}

export function toolTitle(name: string, input: SdkInput): string {
  const d = detailOf(name, input);
  return d ? `${name}: ${d}` : name; // i18n-ignore
}

export function toPermissionRequest(
  requestId: string,
  name: string,
  input: SdkInput,
  toolUseId?: string,
): PermissionRequest {
  return {
    requestId,
    toolUseId,
    tool: toolKind(name),
    title: name,
    detail: detailOf(name, input),
  };
}

export function toSdkPermission(
  decision: PermissionDecision,
  input: SdkInput,
): PermissionResult {
  if (decision.allow === true) {
    return { behavior: 'allow', updatedInput: input };
  }
  return {
    behavior: 'deny',
    message:
      decision.reason === 'aborted'
        ? 'The request was aborted.' // i18n-ignore
        : 'The user denied this tool call.', // i18n-ignore
  };
}

export function toUsage(result: {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
  total_cost_usd?: number;
  modelUsage?: Record<string, unknown>;
}): Usage {
  const u = result.usage ?? {};
  const usage: Usage = {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
  if (typeof result.total_cost_usd === 'number') {
    usage.costUsd = result.total_cost_usd;
  }
  const model = Object.keys(result.modelUsage ?? {})[0];
  if (model) usage.model = model;
  return usage;
}

export function toStopReason(
  result: Pick<SDKResultMessage, 'subtype' | 'stop_reason' | 'is_error'>,
  aborted: boolean,
): StopReason {
  if (aborted) return 'aborted';
  if (result.is_error || result.subtype !== 'success') return 'failed';
  if (result.stop_reason === 'max_tokens') return 'maxTokens';
  if (result.stop_reason === 'refusal') return 'refused';
  return 'endTurn';
}

export function authFailure(msg: string): boolean {
  return /not logged in|\/login|401|unauthorized|authentication|invalid api key|oauth/i.test(
    msg,
  );
}

export function toChatError(
  err: unknown,
  phase: 'start' | 'prompt',
): ChatError {
  if (err instanceof ChatError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | undefined)?.code;
  let kind: ChatErrorKind = phase === 'start' ? 'startFailed' : 'promptFailed';
  if (code === 'ENOENT' || code === 'ERR_MODULE_NOT_FOUND') {
    kind = 'agentMissing';
  } else if (/ENOENT|Cannot find module/i.test(msg)) kind = 'agentMissing';
  else if (authFailure(msg)) kind = 'authRequired';
  return new ChatError(kind, undefined, msg);
}

interface Block {
  type?: string;
  id?: string;
  name?: string;
  input?: SdkInput;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
}

/** Maps SDK messages of one session to domain events. */
export class TurnMapper {
  private readonly tools = new Map<string, { tool: ToolKind; title: string }>();

  map(msg: SDKMessage): AgentEvent[] {
    const m = msg as unknown as {
      type: string;
      parent_tool_use_id?: string | null;
      event?: {
        type?: string;
        delta?: { type?: string; text?: string; thinking?: string };
      };
      message?: { content?: unknown };
    };
    if (m.parent_tool_use_id) return [];
    if (m.type === 'stream_event') {
      const d =
        m.event?.type === 'content_block_delta' ? m.event.delta : undefined;
      if (d?.type === 'text_delta' && d.text) {
        return [{ type: 'messageDelta', part: 'text', text: d.text }];
      }
      if (d?.type === 'thinking_delta' && d.thinking) {
        return [{ type: 'messageDelta', part: 'thinking', text: d.thinking }];
      }
      return [];
    }
    const content = m.message?.content;
    if (!Array.isArray(content)) return [];
    const out: AgentEvent[] = [];
    for (const b of content as Block[]) {
      if (m.type === 'assistant' && b.type === 'tool_use' && b.id) {
        const info = {
          tool: toolKind(b.name ?? ''),
          title: toolTitle(b.name ?? '', b.input ?? {}),
        };
        this.tools.set(b.id, info);
        out.push({
          type: 'toolUpdated',
          part: {
            kind: 'toolUse',
            toolUseId: b.id,
            ...info,
            status: 'running',
          },
        });
      } else if (
        m.type === 'user' &&
        b.type === 'tool_result' &&
        b.tool_use_id
      ) {
        const info = this.tools.get(b.tool_use_id);
        const isError = b.is_error === true;
        if (info) {
          out.push({
            type: 'toolUpdated',
            part: {
              kind: 'toolUse',
              toolUseId: b.tool_use_id,
              ...info,
              status: isError ? 'failed' : 'done',
            },
          });
        }
        out.push({
          type: 'toolUpdated',
          part: {
            kind: 'toolResult',
            toolUseId: b.tool_use_id,
            isError,
            summary:
              typeof b.content === 'string' ? truncate(b.content) : undefined,
          },
        });
      }
    }
    return out;
  }
}
