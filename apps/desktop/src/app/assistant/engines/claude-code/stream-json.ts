import type { AssistantEvent, AssistantErrorKind } from '@ascua/assistant';
import { MCP_PREFIX, MCP_SERVER } from './claude-args';

export type ClaudeLine = Record<string, unknown>;

export interface StreamState {
  sessionId?: string;
  /** callId -> tool name, for tool_use blocks already announced. */
  calls: Map<string, string>;
}

export function newStreamState(): StreamState {
  return { calls: new Map() };
}

/** Buffers stdout chunks and returns the complete JSON lines. */
export class StreamJsonParser {
  private buffer = '';

  push(chunk: string): ClaudeLine[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    const out: ClaudeLine[] = [];
    for (const raw of lines) {
      const text = raw.trim();
      if (!text) continue;
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object')
          out.push(parsed as ClaudeLine);
      } catch {
        // Not JSON (a stray log line): ignore.
      }
    }
    return out;
  }
}

const LOGIN = /log ?in|not logged in|invalid api key/i;

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object'
    ? (v as Record<string, unknown>)
    : undefined;
}

function blocks(line: ClaudeLine): Record<string, unknown>[] {
  const content = asRecord(line['message'])?.['content'];
  return Array.isArray(content)
    ? content.filter((b): b is Record<string, unknown> => !!asRecord(b))
    : [];
}

/** Unknown line types are ignored: the format is not a stable API. */
export function toEvents(
  line: ClaudeLine,
  turn: string,
  state: StreamState,
): AssistantEvent[] {
  switch (line['type']) {
    case 'system': {
      if (line['subtype'] !== 'init') return [];
      if (typeof line['session_id'] === 'string') {
        state.sessionId = line['session_id'];
      }
      const servers = line['mcp_servers'];
      if (Array.isArray(servers)) {
        for (const s of servers) {
          const server = asRecord(s);
          if (
            server?.['name'] === MCP_SERVER &&
            server['status'] === 'failed'
          ) {
            return [{ type: 'error', turn, kind: 'failed' }];
          }
        }
      }
      return [];
    }
    case 'stream_event': {
      const event = asRecord(line['event']);
      const delta = asRecord(event?.['delta']);
      if (
        event?.['type'] === 'content_block_delta' &&
        delta?.['type'] === 'text_delta' &&
        typeof delta['text'] === 'string' &&
        delta['text']
      ) {
        return [{ type: 'text', turn, delta: delta['text'] }];
      }
      return [];
    }
    case 'assistant': {
      const out: AssistantEvent[] = [];
      for (const b of blocks(line)) {
        const id = b['id'];
        const name = b['name'];
        if (
          b['type'] !== 'tool_use' ||
          typeof id !== 'string' ||
          typeof name !== 'string' ||
          state.calls.has(id)
        ) {
          continue;
        }
        const tool = name.startsWith(MCP_PREFIX)
          ? name.slice(MCP_PREFIX.length)
          : name;
        state.calls.set(id, tool);
        out.push({ type: 'toolStarted', turn, callId: id, tool });
      }
      return out;
    }
    case 'user': {
      const out: AssistantEvent[] = [];
      for (const b of blocks(line)) {
        const id = b['tool_use_id'];
        if (b['type'] !== 'tool_result' || typeof id !== 'string') continue;
        out.push({
          type: 'toolFinished',
          turn,
          callId: id,
          ok: b['is_error'] !== true,
        });
      }
      return out;
    }
    case 'result': {
      const failed = line['is_error'] === true || line['subtype'] !== 'success';
      if (!failed) return [{ type: 'turnDone', turn, outcome: 'done' }];
      const text = typeof line['result'] === 'string' ? line['result'] : '';
      const kind: AssistantErrorKind = LOGIN.test(text)
        ? 'notLoggedIn'
        : 'failed';
      return [{ type: 'error', turn, kind }];
    }
    default:
      return [];
  }
}
