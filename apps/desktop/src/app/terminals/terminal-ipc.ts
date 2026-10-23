import { ipcMain } from 'electron';
import { IPC } from '@ascua/ipc';
import type { TerminalSize } from '@ascua/ipc';
import type { TerminalManager } from './terminal-manager';

export function registerTerminalIpc(manager: TerminalManager): void {
  ipcMain.handle(IPC.listTerminals, () => manager.list());
  ipcMain.handle(
    IPC.startTerminal,
    (_event, projectId: string, terminalId: string, size?: TerminalSize) =>
      manager.start(projectId, terminalId, size),
  );
  ipcMain.handle(
    IPC.stopTerminal,
    (_event, projectId: string, terminalId: string) =>
      manager.stop(projectId, terminalId),
  );
  ipcMain.handle(
    IPC.openShell,
    (_event, projectId: string, size?: TerminalSize) =>
      manager.openShell(projectId, size),
  );
  ipcMain.handle(
    IPC.closeShell,
    (_event, projectId: string, terminalId: string) =>
      manager.closeShell(projectId, terminalId),
  );
  ipcMain.handle(IPC.replayTerminal, (_event, id: string) =>
    manager.replay(id),
  );
  ipcMain.on(IPC.writeTerminal, (_event, id: string, data: string) =>
    manager.write(id, data),
  );
  ipcMain.on(IPC.resizeTerminal, (_event, id: string, size: TerminalSize) =>
    manager.resize(id, size),
  );
}
