import { app, type BrowserWindow } from 'electron';
import {
  rendererTarget,
  targetUrl,
  type RendererTarget,
} from './renderer-target';

export function currentRendererTarget(): RendererTarget {
  return rendererTarget({
    packaged: app.isPackaged,
    env: process.env,
    dir: __dirname,
  });
}

export function loadRenderer(win: BrowserWindow): void {
<<<<<<< HEAD
  const target = currentRendererTarget();
  if (target.kind === 'url') {
    win.loadURL(targetUrl(target));
=======
  if (!app.isPackaged && process.env['ASCUA_RENDERER'] !== 'dist') {
    win.loadURL(`http://localhost:${rendererAppPort}`);
    // Dev server only (`nx serve desktop`); detached, the window is frameless.
    win.webContents.openDevTools({ mode: 'detach' });
>>>>>>> origin/master
  } else {
    win.loadFile(target.path, { query: target.query });
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
