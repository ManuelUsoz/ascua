import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PositionStore } from './position-store';
import type { ScreenPort } from './ports';

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const screen = {
  getAllDisplays: () => [{ workArea }],
  getPrimaryDisplay: () => ({ workArea }),
} as unknown as ScreenPort;

describe('PositionStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ascua-pos-'));
  });
  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it('restores a saved position that is on screen', () => {
    const file = join(dir, 'position.json');
    writeFileSync(file, JSON.stringify({ x: 50, y: 60 }));
    expect(new PositionStore(file, screen).restore()).toEqual({ x: 50, y: 60 });
  });

  it('falls back to the default spot when missing, corrupt or off screen', () => {
    const file = join(dir, 'position.json');
    const store = new PositionStore(file, screen);
    const fallback = { x: 1920 - 420 - 16, y: 1040 - 320 - 16 };
    expect(store.restore()).toEqual(fallback);
    writeFileSync(file, '{nope');
    expect(store.restore()).toEqual(fallback);
    writeFileSync(file, JSON.stringify({ x: 99999, y: 0 }));
    expect(store.restore()).toEqual(fallback);
  });

  it('debounces saves by 600 ms and writes the latest position', () => {
    vi.useFakeTimers();
    const file = join(dir, 'nested', 'position.json');
    const store = new PositionStore(file, screen);
    store.scheduleSave(() => ({ x: 1, y: 2 }));
    vi.advanceTimersByTime(500);
    store.scheduleSave(() => ({ x: 3, y: 4 }));
    vi.advanceTimersByTime(599);
    expect(() => readFileSync(file, 'utf8')).toThrow();
    vi.advanceTimersByTime(1);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ x: 3, y: 4 });
  });

  it('skips the write when there is no position, and dispose cancels', () => {
    vi.useFakeTimers();
    const file = join(dir, 'position.json');
    const store = new PositionStore(file, screen);
    store.scheduleSave(() => undefined);
    vi.advanceTimersByTime(600);
    expect(() => readFileSync(file, 'utf8')).toThrow();
    store.scheduleSave(() => ({ x: 1, y: 2 }));
    store.dispose();
    vi.advanceTimersByTime(600);
    expect(() => readFileSync(file, 'utf8')).toThrow();
  });
});
