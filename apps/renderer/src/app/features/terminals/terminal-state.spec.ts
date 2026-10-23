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
    expect(terminalStateView(session({}))).toEqual({ label: 'Corriendo', tone: 'ok' });
  });

  it('shows stopped and missing sessions as idle', () => {
    const idle = { label: 'Detenida', tone: 'idle' };
    expect(terminalStateView(session({ status: 'stopped' }))).toEqual(idle);
    expect(terminalStateView(undefined)).toEqual(idle);
  });

  it('shows failed with the exit code', () => {
    expect(terminalStateView(session({ status: 'failed', exitCode: 2 }))).toEqual({
      label: 'Falló (código 2)',
      tone: 'alert',
    });
  });

  it('prefers the error text when there is one', () => {
    expect(
      terminalStateView(session({ status: 'failed', error: 'No existe la carpeta x' })),
    ).toEqual({ label: 'No existe la carpeta x', tone: 'alert' });
  });
});
