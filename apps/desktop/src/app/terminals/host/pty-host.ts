// utilityProcess entry: owns every node-pty terminal so a native crash or a
// busy shell never touches the main process.
import * as pty from 'node-pty';
import { killTree } from './kill-tree';
import { OutputBuffer } from './output-buffer';
import type { HostEvent, HostRequest } from './pty-protocol';

interface Entry {
  pty?: pty.IPty;
  buffer: OutputBuffer;
  timer?: NodeJS.Timeout;
}

const FLUSH_MS = 16;
const entries = new Map<string, Entry>();

// Electron adds `parentPort` to utility processes only.
const parentPort = (process as unknown as { parentPort: Electron.ParentPort })
  .parentPort;

function post(event: HostEvent): void {
  parentPort.postMessage(event);
}

function flush(id: string, entry: Entry): void {
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = undefined;
  }
  const chunk = entry.buffer.take();
  if (chunk) post({ type: 'data', id, ...chunk });
}

function spawn(request: Extract<HostRequest, { type: 'spawn' }>): void {
  const { id } = request;
  const existing = entries.get(id);
  const entry: Entry = existing ?? { buffer: new OutputBuffer() };
  entries.set(id, entry);
  if (entry.pty) return;
  if (existing) entry.buffer.push('\r\n\x1b[2m── reiniciada ──\x1b[0m\r\n');

  try {
    const child = pty.spawn(request.file, request.args, {
      name: 'xterm-256color',
      cwd: request.cwd,
      env: request.env,
      cols: request.cols,
      rows: request.rows,
    });
    entry.pty = child;
    child.onData((data) => {
      entry.buffer.push(data);
      entry.timer ??= setTimeout(() => flush(id, entry), FLUSH_MS);
    });
    child.onExit(({ exitCode }) => {
      if (entry.pty !== child) return;
      entry.pty = undefined;
      flush(id, entry);
      post({ type: 'exit', id, exitCode });
    });
  } catch (error) {
    entry.pty = undefined;
    post({
      type: 'exit',
      id,
      exitCode: -1,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function kill(entry: Entry): void {
  const child = entry.pty;
  if (!child) return;
  killTree(child.pid, () => child.kill());
}

function handle(request: HostRequest): void {
  switch (request.type) {
    case 'spawn':
      spawn(request);
      break;
    case 'write':
      entries.get(request.id)?.pty?.write(request.data);
      break;
    case 'resize': {
      const child = entries.get(request.id)?.pty;
      try {
        child?.resize(Math.max(1, request.cols), Math.max(1, request.rows));
      } catch {
        // the pty may have just exited
      }
      break;
    }
    case 'kill': {
      const entry = entries.get(request.id);
      if (entry) kill(entry);
      break;
    }
    case 'dispose': {
      const entry = entries.get(request.id);
      if (!entry) break;
      kill(entry);
      if (entry.timer) clearTimeout(entry.timer);
      entries.delete(request.id);
      break;
    }
    case 'snapshot': {
      const snapshot = entries.get(request.id)?.buffer.snapshot() ?? {
        data: '',
        seq: 0,
      };
      post({ type: 'snapshot', requestId: request.requestId, ...snapshot });
      break;
    }
  }
}

parentPort.on('message', (event) => handle(event.data as HostRequest));
