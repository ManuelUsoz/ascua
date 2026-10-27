import type {
  CanUseTool,
  ModelInfo,
  Options,
  PermissionMode as SdkPermissionMode,
  PermissionResult,
  SDKMessage,
  SDKResultMessage,
  SlashCommand,
} from '@anthropic-ai/claude-agent-sdk';
import {
  ChatError,
  type AgentEvent,
  type ChatCommand,
  type ChatErrorKind,
  type OpenOptions,
  type McpServerSpec,
  type PermissionMode,
  type ProviderModel,
  type ReasoningEffort,
  type PermissionDecision,
  type PermissionRequest,
  type StopReason,
  type ToolKind,
  type Usage,
} from '@ascua/chat';

export type SdkInput = Parameters<CanUseTool>[1];

const MAX_DETAIL = 200;
const MAX_RESULT = 2000;

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

export function toSdkMcpServers(specs: McpServerSpec[]): Options['mcpServers'] {
  return Object.fromEntries(
    specs.map((s) => [
      s.name,
      {
        type: 'stdio' as const,
        command: s.command,
        args: s.args,
        ...(s.env ? { env: s.env } : {}),
      },
    ]),
  );
}

export function toolKind(name: string): ToolKind {
  return KINDS[name] ?? 'other';
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function truncate(s: string): string {
  return s.length > MAX_DETAIL ? `${s.slice(0, MAX_DETAIL - 1)}…` : s;
}

/** Text of a tool_result: a string, or the text blocks of an MCP result. */
function resultText(content: unknown): string | undefined {
  let s: string | undefined;
  if (typeof content === 'string') s = content;
  else if (Array.isArray(content)) {
    s = (content as { type?: string; text?: unknown }[])
      .map((c) =>
        c?.type === 'text' && typeof c.text === 'string' ? c.text : '',
      )
      .filter(Boolean)
      .join('\n');
  }
  s = s?.trim();
  if (!s) return undefined;
  return s.length > MAX_RESULT ? `${s.slice(0, MAX_RESULT - 1)}…` : s;
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

/** Custom (non built-in) slash commands as chat commands. */
export function toChatCommands(cmds: SlashCommand[]): ChatCommand[] {
  return (cmds ?? [])
    .filter((c) => !c.builtin && c.name)
    .map((c) => {
      const cmd: ChatCommand = { name: c.name, source: 'custom' };
      if (c.description) cmd.description = c.description;
      if (c.argumentHint) cmd.argumentHint = c.argumentHint;
      return cmd;
    });
}

const EFFORTS: readonly ReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export function toProviderModels(models: ModelInfo[]): ProviderModel[] {
  return (models ?? [])
    .filter((m) => m.value)
    .map((m) => {
      const pm: ProviderModel = {
        id: m.value,
        efforts: (m.supportedEffortLevels ?? []).filter((e) =>
          EFFORTS.includes(e),
        ),
      };
      if (m.displayName) pm.label = m.displayName;
      if (m.description) pm.description = m.description;
      if (m.supportsAutoMode) pm.supportsAutoMode = true;
      return pm;
    });
}

export function toSdkPermissionMode(mode: PermissionMode): SdkPermissionMode {
  switch (mode) {
    case 'acceptEdits':
      return 'acceptEdits';
    case 'auto':
      return 'auto';
    case 'fullAccess':
      return 'bypassPermissions';
    default:
      return 'default';
  }
}

export function claudeRuntimeOptions(
  runtime: OpenOptions['runtime'],
): Partial<Options> {
  const out: Partial<Options> = {
    permissionMode: toSdkPermissionMode(runtime.permissionMode),
  };
  if (runtime.permissionMode === 'fullAccess') {
    out.allowDangerouslySkipPermissions = true;
  }
  if (runtime.model) out.model = runtime.model;
  if (runtime.effort && runtime.effort !== 'minimal') {
    out.effort = runtime.effort;
  }
  return out;
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

interface ToolInfo {
  tool: ToolKind;
  title: string;
  parentToolUseId?: string;
  agent?: string;
  path?: string;
}

/** Maps SDK messages of one session to domain events. */
export class TurnMapper {
  private readonly tools = new Map<string, ToolInfo>();

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
    const parent = m.parent_tool_use_id || undefined;
    if (parent && m.type !== 'assistant' && m.type !== 'user') return [];
    if (m.type === 'system') {
      const s = msg as unknown as {
        subtype?: string;
        model?: string;
        commands?: SlashCommand[];
      };
      if (s.subtype === 'init' && s.model) {
        return [{ type: 'sessionInfo', model: s.model }];
      }
      if (s.subtype === 'commands_changed' && Array.isArray(s.commands)) {
        return [{ type: 'sessionInfo', commands: toChatCommands(s.commands) }];
      }
      return [];
    }
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
        const input = b.input ?? {};
        const info: ToolInfo = {
          tool: toolKind(b.name ?? ''),
          title: toolTitle(b.name ?? '', input),
        };
        if (parent) info.parentToolUseId = parent;
        const agent =
          b.name === 'Task' || b.name === 'Agent'
            ? str(input['subagent_type'])
            : undefined;
        if (agent) info.agent = agent;
        const path =
          str(input['file_path']) ??
          str(input['path']) ??
          str(input['notebook_path']);
        if (path) info.path = path;
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
            summary: resultText(b.content),
          },
        });
      }
    }
    return out;
  }
}
