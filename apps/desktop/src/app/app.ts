import { BrowserWindow, net, safeStorage, shell } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { environment } from '../environments/environment';
import { registerFileIpc } from './files/files-ipc';
import { ProjectFiles } from './files/project-files';
import { MainText } from './i18n/main-messages';
import { NoteStore } from './notes/note-store';
import { registerNotesIpc } from './notes/notes-ipc';
import { initialLanguage } from './settings/initial-language';
import { JsonSettingsRepository } from './settings/json-settings-repository';
import { registerSettingsIpc } from './settings/settings-ipc';
import { HookServer } from './permissions/hook-server';
import {
  PermissionBridge,
  registerPermissionIpc,
} from './permissions/permission-bridge';
import { JsonProjectRepository } from './projects/json-project-repository';
import { registerProjectIpc } from './projects/project-ipc';
import {
  SafeStorageCredentialStore,
  electronCipher,
} from './source-control/credential-store';
import { GitHubDeviceFlow } from './source-control/github/github-device-flow';
import { GitHubProvider } from './source-control/github/github-provider';
import { registerSourceControlIpc } from './source-control/source-control-ipc';
import { SourceControlService } from './source-control/source-control-service';
import { PtyHostClient } from './terminals/pty-host-client';
import { guardQuit } from './terminals/quit-guard';
import { resolveShell } from './terminals/shell';
import { registerTerminalIpc } from './terminals/terminal-ipc';
import { TerminalManager } from './terminals/terminal-manager';
import { AscuaWindow } from './window/ascua-window';
import { registerWindowIpc } from './window/window-ipc';

export default class App {
  static application: Electron.App;
  static controller = new AscuaWindow();

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
      const permissions = new PermissionBridge({
        hooks: new HookServer(),
        send: (channel, payload) => App.controller.send(channel, payload),
        rendererReady: () => App.controller.isRendererReady,
        onActiveChange: () => App.controller.refreshInteraction(),
      });
      App.controller.bindPermissions(permissions);
      App.controller.create();
      registerWindowIpc(App.controller);
      registerPermissionIpc(permissions);
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
      registerNotesIpc(
        new NoteStore(join(App.application.getPath('userData'), 'notes'), (p) =>
          shell.trashItem(p),
        ),
        {
          openExternal: (url) => shell.openExternal(url),
          openPath: (path) => shell.openPath(path),
        },
      );
      const settings = new JsonSettingsRepository(
        join(App.application.getPath('userData'), 'settings.json'),
        () =>
          initialLanguage(
            App.application.getPreferredSystemLanguages(),
            App.application.getLocale(),
          ),
      );
      const text = new MainText();
      void settings.get().then((s) => text.set(s.language));
      registerSettingsIpc(settings, {
        send: (channel, payload) => App.controller.send(channel, payload),
        onChange: (s) => text.set(s.language),
      });
      // `net.fetch` is read at call time so a test driver can stub it.
      const scFetch: typeof fetch = (input, init) =>
        net.fetch(input as string, init);
      registerSourceControlIpc(
        new SourceControlService({
          adapters: {
            github: {
              provider: new GitHubProvider(scFetch),
              authorizer: new GitHubDeviceFlow({
                fetch: scFetch,
                clientId: 'Ov23liPOEd2g5MaAWlgZ',
                scopes: ['repo', 'read:user'],
              }),
            },
          },
          store: new SafeStorageCredentialStore(
            join(App.application.getPath('userData'), 'source-control.json'),
            electronCipher(safeStorage),
          ),
          send: (channel, payload) => App.controller.send(channel, payload),
          openExternal: (url) => shell.openExternal(url),
        }),
      );
      guardQuit({
        text,
        manager,
        backend,
        window: () => App.controller.window,
        recreate: () => void App.controller.create(),
      });
    });
  }
}
