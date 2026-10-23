import type { TerminalReplay } from '@ascua/ipc';
import type { HostEvent, HostRequest } from './host/pty-protocol';

/** Where PTYs live. A detached daemon could implement this later. */
export interface PtyBackend {
  request(message: HostRequest): void;
  snapshot(id: string): Promise<TerminalReplay>;
  onEvent(listener: (event: HostEvent) => void): () => void;
  dispose(): void;
}
