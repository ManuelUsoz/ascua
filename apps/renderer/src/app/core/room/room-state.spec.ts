import { TestBed } from '@angular/core/testing';
import type { AscuaApi, BloomOrigin, FullscreenState } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { RoomState } from './room-state';

const origin: BloomOrigin = {
  x: 10,
  y: 20,
  size: 120,
  width: 800,
  height: 600,
};
const has = (name: string) => document.body.classList.contains(name);
const ox = () => document.documentElement.style.getPropertyValue('--ox');

function desktopApi() {
  let fullscreen: ((state: FullscreenState) => void) | undefined;
  const api: AscuaApi = {
    toggleFullscreen: vi.fn(async () => origin),
    exitFullscreen: vi.fn(async () => undefined),
    isFullscreen: vi.fn(async () => false),
    quit: vi.fn(async () => undefined),
    dragStart: vi.fn(async () => undefined),
    dragEnd: vi.fn(async () => undefined),
    getLayout: vi.fn(async () => ({ left: true, top: false })),
    onFullscreenChanged: (callback) => {
      fullscreen = callback;
      return () => undefined;
    },
    onLayoutChanged: () => () => undefined,
    onPermissionRequest: () => () => undefined,
    onPermissionDismissed: () => () => undefined,
    resolvePermission: vi.fn(async () => undefined),
    listProjects: vi.fn(async () => []),
    saveProject: vi.fn(),
    deleteProject: vi.fn(async () => undefined),
    pickProjectFolder: vi.fn(async () => undefined),
    listTerminals: vi.fn(async () => []),
    startTerminal: vi.fn(),
    stopTerminal: vi.fn(async () => undefined),
    replayTerminal: vi.fn(async () => ({ data: '', seq: 0 })),
    writeTerminal: vi.fn(),
    resizeTerminal: vi.fn(),
    onTerminalOutput: () => () => undefined,
    onTerminalChanged: () => () => undefined,
  };
  return { api, announce: (state: FullscreenState) => fullscreen?.(state) };
}

afterEach(() => {
  document.body.className = '';
  delete document.body.dataset['x'];
  delete document.body.dataset['y'];
  document.documentElement.removeAttribute('style');
});

describe('RoomState in a browser preview', () => {
  let room: RoomState;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ASCUA_API, useValue: undefined }],
    });
    room = TestBed.inject(RoomState);
  });

  it('opens the room in place', async () => {
    await room.expand();
    expect(room.open()).toBe(true);
    expect(room.isCompact()).toBe(false);
    expect(has('is-open')).toBe(true);
    expect(has('has-origin')).toBe(true);
  });

  it('collapses straight back to compact', async () => {
    await room.expand();
    room.collapse();
    expect(room.open()).toBe(false);
    expect(room.isCompact()).toBe(true);
    expect(has('is-open')).toBe(false);
    expect(has('has-origin')).toBe(false);
  });
});

describe('RoomState in the desktop shell', () => {
  it('applies the layout main sends', async () => {
    const { api } = desktopApi();
    TestBed.configureTestingModule({
      providers: [{ provide: ASCUA_API, useValue: api }],
    });
    TestBed.inject(RoomState);
    await vi.waitFor(() => expect(document.body.dataset['x']).toBe('left'));
    expect(document.body.dataset['y']).toBe('bottom');
  });

  it('blooms from the origin main announces and collapses on exit', async () => {
    const { api, announce } = desktopApi();
    TestBed.configureTestingModule({
      providers: [{ provide: ASCUA_API, useValue: api }],
    });
    const room = TestBed.inject(RoomState);

    announce({ fullscreen: true, origin });
    expect(has('is-waking')).toBe(true);
    expect(ox()).toBe('10px');
    await vi.waitFor(() => expect(room.open()).toBe(true));
    expect(has('is-open')).toBe(true);

    room.collapse();
    expect(has('is-closing')).toBe(true);
    announce({ fullscreen: false });
    expect(room.open()).toBe(false);
    expect(room.isCompact()).toBe(true);
    expect(ox()).toBe('');
  });
});
