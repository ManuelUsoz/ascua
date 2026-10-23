import type { TerminalSession } from '@ascua/ipc';

export interface TerminalStateView {
  label: string;
  tone: 'ok' | 'idle' | 'alert';
}

/** Label and tone the pane shows for a terminal's session. */
export function terminalStateView(session?: TerminalSession): TerminalStateView {
  switch (session?.status) {
    case 'running':
      return { label: 'Corriendo', tone: 'ok' };
    case 'failed':
      return {
        label:
          session.error ??
          (session.exitCode === undefined ? 'Falló' : `Falló (código ${session.exitCode})`),
        tone: 'alert',
      };
    default:
      return { label: 'Detenida', tone: 'idle' };
  }
}
