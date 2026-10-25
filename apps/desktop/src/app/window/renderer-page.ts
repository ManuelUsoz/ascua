import { app, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { rendererAppName, rendererAppPort } from '../constants';

export function loadRenderer(win: BrowserWindow): void {
  if (!app.isPackaged && process.env['ASCUA_RENDERER'] !== 'dist') {
    win.loadURL(`http://localhost:${rendererAppPort}`);
    // Dev server only (`nx serve desktop`); detached, the window is frameless.
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(join(__dirname, '..', rendererAppName, 'index.html'));
  }
}

/** The renderer is a single local page: no popups, no foreign navigation. */
export function hardenWebContents(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL();
    if (current && url !== current) event.preventDefault();
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
}
