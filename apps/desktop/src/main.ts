import SquirrelEvents from './app/events/squirrel.events';
import ElectronEvents from './app/events/electron.events';
// import UpdateEvents from './app/events/update.events';
import { app } from 'electron';
import App from './app/app';
import { SAB_FEATURE, withFeature } from './app/chromium-switches';

export default class Main {
  static initialize() {
    if (SquirrelEvents.handleEvents()) {
      // squirrel event handled (except first run event) and app will exit in 1000ms, so don't do anything else
      app.quit();
    }
  }

  static bootstrapApp() {
    App.main(app);
  }

  static bootstrapAppEvents() {
    ElectronEvents.bootstrapElectronEvents();

    // initialize auto updater service
    if (!App.isDevelopmentMode()) {
      // UpdateEvents.initAutoUpdateService();
    }
  }
}

// Linux: force X11/XWayland; native Wayland blocks cursor polling, setBounds and always-on-top
if (
  process.platform === 'linux' &&
  !app.commandLine.hasSwitch('ozone-platform')
) {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
}

// SharedArrayBuffer for the renderer and its workers on file:// without
// cross-origin isolation, so onnxruntime can run wasm threads (voice).
app.commandLine.appendSwitch(
  'enable-features',
  withFeature(app.commandLine.getSwitchValue('enable-features'), SAB_FEATURE),
);

// handle setup events as quickly as possible
Main.initialize();

// bootstrap app
Main.bootstrapApp();
Main.bootstrapAppEvents();
