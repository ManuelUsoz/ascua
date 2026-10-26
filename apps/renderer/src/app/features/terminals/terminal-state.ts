import type { TerminalSession } from '@ascua/ipc';
import { errorText } from '../../core/i18n/app-error';
import { text, type Text } from '../../core/i18n/text';
import type { StatusState } from '../../shared/status/status';

export interface TerminalStateView {
  state: StatusState;
  label?: Text;
}

/** Status state (and optional detail label) the pane shows for a session. */
export function terminalStateView(
  session?: TerminalSession,
): TerminalStateView {
  switch (session?.status) {
    case 'running':
      return { state: 'running' };
    case 'failed': {
      const label = session.error
        ? errorText(session.error)
        : session.exitCode === undefined
          ? undefined
          : text('state.failedCode', { code: session.exitCode });
      return label ? { state: 'crashed', label } : { state: 'crashed' };
    }
    default:
      return { state: 'stopped' };
  }
}
