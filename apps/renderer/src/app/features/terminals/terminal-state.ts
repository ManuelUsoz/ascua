import type { TerminalSession } from '@ascua/ipc';
import { errorText } from '../../core/i18n/app-error';
import { text, type Text } from '../../core/i18n/text';

export interface TerminalStateView {
  label: Text;
  tone: 'ok' | 'idle' | 'alert';
}

/** Label and tone the pane shows for a terminal's session. */
export function terminalStateView(
  session?: TerminalSession,
): TerminalStateView {
  switch (session?.status) {
    case 'running':
      return { label: text('state.running'), tone: 'ok' };
    case 'failed':
      return {
        label: session.error
          ? errorText(session.error)
          : session.exitCode === undefined
            ? text('state.failed')
            : text('state.failedCode', { code: session.exitCode }),
        tone: 'alert',
      };
    default:
      return { label: text('state.stopped'), tone: 'idle' };
  }
}
