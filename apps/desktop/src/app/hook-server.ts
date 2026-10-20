import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  PermissionDecision,
  PermissionRequest,
} from '@ascua/ipc';

interface Pending {
  socket: Socket;
  request: PermissionRequest;
}

interface HookServerOptions {
  /** A hook is waiting for the user's decision. */
  onRequest(request: PermissionRequest): void;
  /** The request was answered, or its hook disconnected. */
  onResolved(id: number): void;
}

/**
 * The non-binary replacement for `ascua-hook.exe`: a one-line JSON protocol
 * over a user-scoped named pipe (Windows) or Unix socket. Claude Code runs
 * `tools/ascua-hook.mjs`, which writes the hook event here and waits for a
 * reply line. Any failure is the hook's problem; it fails open.
 */
export class HookServer {
  private server: Server | null = null;
  private options: HookServerOptions | null = null;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private listening = false;

  /** Hook connections still waiting for a decision. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Requests to re-send when the renderer (re)loads. */
  get pendingRequests(): PermissionRequest[] {
    return [...this.pending.values()].map(({ request }) => request);
  }

  start(options: HookServerOptions): void {
    if (this.server) return;
    this.options = options;

    const endpoint = endpointPath();
    if (process.platform !== 'win32' && existsSync(endpoint)) {
      try {
        unlinkSync(endpoint);
      } catch {
        // A live Ascua instance owns it; listen() will fail and the hook
        // falls back to Claude Code's terminal prompt.
      }
    }

    const server = createServer((socket) => this.accept(socket));
    server.on('error', (error) => {
      console.error('[ascua] hook server failed:', error.message);
    });
    server.listen(endpoint, () => {
      this.listening = true;
      if (process.platform !== 'win32') {
        try {
          chmodSync(endpoint, 0o600);
        } catch {
          // Best effort; the socket still works for this user.
        }
      }
      console.log(`[ascua] hook listening on ${endpoint}`);
    });
    this.server = server;
  }

  stop(): void {
    for (const { socket } of this.pending.values()) socket.destroy();
    this.pending.clear();
    this.server?.close();
    this.server = null;
    this.options = null;

    if (process.platform !== 'win32' && this.listening) {
      try {
        unlinkSync(endpointPath());
      } catch {
        // Already gone.
      }
    }
    this.listening = false;
  }

  resolve(id: number, decision: PermissionDecision): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);

    const output = hookOutput(decision);
    try {
      if (output) pending.socket.end(output);
      else pending.socket.end();
    } catch {
      // The hook disappeared between the click and this write.
    }
    this.options?.onResolved(id);
  }

  private accept(socket: Socket): void {
    socket.setEncoding('utf8');
    let buffer = '';
    let handled = false;

    const reject = () => {
      if (handled) return;
      handled = true;
      socket.destroy();
    };

    socket.on('error', reject);
    socket.on('data', (chunk: string) => {
      if (handled) return;
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      handled = true;

      let event: unknown;
      try {
        event = JSON.parse(buffer.slice(0, newline).trim());
      } catch {
        socket.destroy();
        return;
      }

      const request = toRequest(this.nextId++, event);
      if (!request) {
        socket.destroy();
        return;
      }

      this.pending.set(request.id, { socket, request });
      const settled = () => {
        if (this.pending.delete(request.id)) {
          socket.destroy();
          this.options?.onResolved(request.id);
        }
      };
      socket.once('close', settled);
      socket.once('end', settled);
      socket.on('error', settled);
      this.options?.onRequest(request);
    });
  }
}

function endpointPath(): string {
  if (process.platform === 'win32') {
    const user = process.env.USERNAME ?? process.env.USER ?? 'user';
    return `\\\\.\\pipe\\ascua-${user}`;
  }
  const dir = process.env.XDG_RUNTIME_DIR ?? tmpdir();
  return join(dir, 'ascua.sock');
}

function toRequest(id: number, event: unknown): PermissionRequest | null {
  if (!event || typeof event !== 'object') return null;
  const record = event as Record<string, unknown>;
  const tool =
    typeof record['tool_name'] === 'string' ? record['tool_name'] : '?';
  const input =
    record['tool_input'] && typeof record['tool_input'] === 'object'
      ? record['tool_input']
      : {};
  return { id, tool, summary: summarize(tool, input), input };
}

function summarize(tool: string, input: object): string {
  const text = (key: string): string => {
    const value = (input as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '?';
  };
  switch (tool) {
    case 'Bash':
      return text('command');
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'Read':
      return `${tool} ${text('file_path')}`;
    default:
      return tool;
  }
}

/** The exact reply Claude Code expects on the hook's stdout. */
function hookOutput(decision: PermissionDecision): string {
  if (decision === 'terminal') return '';
  const answer =
    decision === 'allow'
      ? { behavior: 'allow' }
      : { behavior: 'deny', message: 'Rejected from Ascua.' };
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: answer,
    },
  })}\n`;
}
