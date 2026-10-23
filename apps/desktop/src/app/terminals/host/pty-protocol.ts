// Contract between the main process and the PTY host. A detached daemon
// would implement the same messages.

export type HostRequest =
  | {
      type: 'spawn';
      id: string;
      file: string;
      args: string[];
      cwd: string;
      env: Record<string, string>;
      cols: number;
      rows: number;
    }
  | { type: 'write'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'kill'; id: string }
  | { type: 'dispose'; id: string }
  | { type: 'snapshot'; id: string; requestId: number };

export type HostEvent =
  | { type: 'data'; id: string; data: string; seq: number }
  | { type: 'exit'; id: string; exitCode: number; error?: string }
  | { type: 'snapshot'; requestId: number; data: string; seq: number };
