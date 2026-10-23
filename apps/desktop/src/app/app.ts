import { BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { environment } from '../environments/environment';
import { registerFileIpc } from './files/files-ipc';
import { ProjectFiles } from './files/project-files';
import { JsonProjectRepository } from './projects/json-project-repository';
import { registerProjectIpc } from './projects/project-ipc';
import { PtyHostClient } from './terminals/pty-host-client';
import { guardQuit } from './terminals/quit-guard';
import { resolveShell } from './terminals/shell';
import { registerTerminalIpc } from './terminals/terminal-ipc';
import { TerminalManager } from './terminals/terminal-manager';
import { WindowController } from './window';

export default class App {
  static application: Electron.App;
  static controller = new WindowController();

  public static isDevelopmentMode() {
    const isEnvironmentSet: boolean = 'ELECTRON_IS_DEV' in process.env;
    const getFromEnvironment = () =>
      parseInt(process.env.ELECTRON_IS_DEV ?? '0', 10) === 1;

    return isEnvironmentSet ? getFromEnvironment() : !environment.production;
  }

  private static onWindowAllClosed() {
    if (process.platform !== 'darwin') {
      App.application.quit();
    }
  }

  private static onActivate() {
    if (BrowserWindow.getAllWindows().length === 0) {
      App.controller.create();
    }
  }

  static main(application: Electron.App) {
    App.application = application;

    if (!App.application.requestSingleInstanceLock()) {
      App.application.quit();
      return;
    }

    App.application.setAppUserModelId('com.nxy.ascua');
    App.application.on('second-instance', () => {
      const [window] = BrowserWindow.getAllWindows();
      if (!window) {
        App.controller.create();
        return;
      }
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    });

    App.application.on('window-all-closed', App.onWindowAllClosed);
    App.application.on('activate', App.onActivate);

    App.application.whenReady().then(() => {
      App.controller.create();
      App.controller.register();
      const repository = new JsonProjectRepository(
        join(App.application.getPath('userData'), 'projects.json'),
      );
      const backend = new PtyHostClient();
      const manager = new TerminalManager(
        repository,
        backend,
        (channel, payload) => App.controller.send(channel, payload),
        resolveShell(process.platform, process.env, existsSync),
      );
      registerProjectIpc(repository, {
        window: () => App.controller.window,
        listener: manager,
      });
      registerTerminalIpc(manager);
      registerFileIpc(new ProjectFiles(repository));
      guardQuit({
        manager,
        backend,
        window: () => App.controller.window,
        recreate: () => void App.controller.create(),
      });
    });
  }
}
