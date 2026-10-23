import { utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';
import { join } from 'node:path';
import type { TerminalReplay } from '@ascua/ipc';
import type { HostEvent, HostRequest } from './host/pty-protocol';
import type { PtyBackend } from './pty-backend';

export class PtyHostClient implements PtyBackend {
  private child?: UtilityProcess;
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    (replay: TerminalReplay) => void
  >();
  private readonly live = new Set<string>();
  private readonly listeners = new Set<(event: HostEvent) => void>();
  private disposed = false;

  request(message: HostRequest): void {
    if (message.type === 'spawn') this.live.add(message.id);
    this.ensure()?.postMessage(message);
  }

  snapshot(id: string): Promise<TerminalReplay> {
    const child = this.ensure();
    if (!child) return Promise.resolve({ data: '', seq: 0 });
    const requestId = this.nextRequestId++;
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve);
      child.postMessage({ type: 'snapshot', id, requestId } satisfies HostRequest);
    });
  }

  onEvent(listener: (event: HostEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.disposed = true;
    const child = this.child;
    this.child = undefined;
    this.resolvePending();
    child?.kill();
  }

  private ensure(): UtilityProcess | undefined {
    if (this.disposed) return undefined;
    if (this.child) return this.child;
    const child = utilityProcess.fork(join(__dirname, 'pty-host.js'), [], {
      serviceName: 'Ascua PTY host',
    });
    child.on('message', (event: HostEvent) => this.handle(event));
    child.on('exit', (code) => {
      if (this.child !== child) return;
      this.child = undefined;
      this.resolvePending();
      const error = `El proceso de terminales se cerró (código ${code}).`;
      for (const id of [...this.live]) {
        this.live.delete(id);
        this.emit({ type: 'exit', id, exitCode: -1, error });
      }
    });
    this.child = child;
    return child;
  }

  private handle(event: HostEvent): void {
    if (event.type === 'snapshot') {
      const resolve = this.pending.get(event.requestId);
      this.pending.delete(event.requestId);
      resolve?.({ data: event.data, seq: event.seq });
      return;
    }
    if (event.type === 'exit') this.live.delete(event.id);
    this.emit(event);
  }

  private resolvePending(): void {
    for (const resolve of this.pending.values()) resolve({ data: '', seq: 0 });
    this.pending.clear();
  }

  private emit(event: HostEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
