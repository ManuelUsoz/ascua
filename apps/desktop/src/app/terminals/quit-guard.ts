import { app, BrowserWindow, dialog } from 'electron';
import type { PtyBackend } from './pty-backend';
import type { TerminalManager } from './terminal-manager';

export interface QuitGuardOptions {
  manager: TerminalManager;
  backend: PtyBackend;
  window: () => BrowserWindow | null;
  /** Re-creates the window when a quit triggered by closing it is cancelled. */
  recreate: () => void;
}

export function guardQuit({
  manager,
  backend,
  window,
  recreate,
}: QuitGuardOptions): void {
  let confirmed = false;
  let asking = false;

  app.on('before-quit', (event) => {
    if (confirmed) return;
    const running = manager.runningCount();
    if (running === 0) return;

    event.preventDefault();
    if (asking) return;
    asking = true;

    const noun = running === 1 ? 'terminal corriendo' : 'terminales corriendo';
    const options = {
      type: 'warning' as const,
      buttons: ['Cerrar igual', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      message: `Tenés ${running} ${noun}, ¿cerrar igual?`,
    };
    const parent = window();
    const answer = parent
      ? dialog.showMessageBox(parent, options)
      : dialog.showMessageBox(options);

    void answer
      .then(async ({ response }) => {
        if (response === 0) {
          await manager.stopAll();
          confirmed = true;
          app.quit();
        } else if (BrowserWindow.getAllWindows().length === 0) {
          recreate();
        }
      })
      .finally(() => {
        asking = false;
      });
  });

  app.on('will-quit', () => backend.dispose());
}
