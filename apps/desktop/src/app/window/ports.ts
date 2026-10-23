import type { BrowserWindow, Screen } from 'electron';

/** Type-only seams so the window modules take plain fakes in tests. */
export type ScreenPort = Pick<
  Screen,
  | 'getCursorScreenPoint'
  | 'getDisplayMatching'
  | 'getAllDisplays'
  | 'getPrimaryDisplay'
>;

export type WindowPort = Pick<
  BrowserWindow,
  'getBounds' | 'setBounds' | 'isDestroyed' | 'setIgnoreMouseEvents'
>;

/** What the fullscreen controller and its modes call on the window. */
export type FullscreenWindowPort = Pick<
  BrowserWindow,
  | 'getBounds'
  | 'setBounds'
  | 'isDestroyed'
  | 'setFocusable'
  | 'setMinimizable'
  | 'setResizable'
  | 'setAlwaysOnTop'
  | 'setFullScreen'
  | 'isFullScreen'
  | 'isMinimized'
  | 'focus'
  | 'restore'
  | 'showInactive'
  | 'moveTop'
>;
