import { describe, expect, it } from 'vitest';
import type { TerminalSession } from '@ascua/ipc';
import { terminalStateView } from './terminal-state';

const session = (patch: Partial<TerminalSession>): TerminalSession => ({
  id: 'p:t',
  projectId: 'p',
  terminalId: 't',
  kind: 'pista',
  status: 'running',
  ...patch,
});

describe('terminalStateView', () => {
  it('shows running as ok', () => {
    expect(terminalStateView(session({}))).toEqual({
      label: { key: 'state.running' },
      tone: 'ok',
    });
  });

  it('shows stopped and missing sessions as idle', () => {
    const idle = { label: { key: 'state.stopped' }, tone: 'idle' };
    expect(terminalStateView(session({ status: 'stopped' }))).toEqual(idle);
    expect(terminalStateView(undefined)).toEqual(idle);
  });

  it('shows failed, with the exit code when there is one', () => {
    expect(terminalStateView(session({ status: 'failed' }))).toEqual({
      label: { key: 'state.failed' },
      tone: 'alert',
    });
    expect(
      terminalStateView(session({ status: 'failed', exitCode: 2 })),
    ).toEqual({
      label: { key: 'state.failedCode', params: { code: 2 } },
      tone: 'alert',
    });
  });

  it('prefers the error code when there is one', () => {
    expect(
      terminalStateView(
        session({
          status: 'failed',
          error: { code: 'terminal.folderMissing', params: { path: 'x' } },
        }),
      ),
    ).toEqual({
      label: {
        key: 'errors.terminal.folderMissing',
        params: { detail: '', path: 'x' },
      },
      tone: 'alert',
    });
  });
});
