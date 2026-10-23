import { describe, expect, it } from 'vitest';
import {
  AVATAR,
  clampToArea,
  COMPACT,
  coversDisplay,
  defaultPosition,
  dragBounds,
  hitsAvatar,
  isRestorable,
  bloomOrigin,
  avatarRect,
} from './geometry';

const bounds = { x: 1000, y: 500, ...COMPACT };
const display = { x: 0, y: 0, width: 1920, height: 1080 };

describe('avatarRect', () => {
  it('sits in each of the four corners', () => {
    const w = COMPACT.width - AVATAR;
    const h = COMPACT.height - AVATAR;
    expect(avatarRect(bounds, { left: false, top: false })).toMatchObject({
      x: 1000 + w,
      y: 500 + h,
    });
    expect(avatarRect(bounds, { left: true, top: false })).toMatchObject({
      x: 1000,
      y: 500 + h,
    });
    expect(avatarRect(bounds, { left: false, top: true })).toMatchObject({
      x: 1000 + w,
      y: 500,
    });
    expect(avatarRect(bounds, { left: true, top: true })).toMatchObject({
      x: 1000,
      y: 500,
    });
  });
});

describe('hitsAvatar', () => {
  const layout = { left: true, top: true };
  it('includes the top-left edge and excludes the far edge', () => {
    expect(hitsAvatar({ x: 1000, y: 500 }, bounds, layout)).toBe(true);
    expect(
      hitsAvatar({ x: 1000 + AVATAR - 1, y: 500 + AVATAR - 1 }, bounds, layout),
    ).toBe(true);
    expect(hitsAvatar({ x: 1000 + AVATAR, y: 500 }, bounds, layout)).toBe(
      false,
    );
    expect(hitsAvatar({ x: 1000, y: 500 + AVATAR }, bounds, layout)).toBe(
      false,
    );
    expect(hitsAvatar({ x: 999, y: 500 }, bounds, layout)).toBe(false);
  });
});

describe('bloomOrigin', () => {
  it('is relative to the display top-left', () => {
    const second = { x: -1920, y: 0, width: 1920, height: 1080 };
    const b = { x: -1000, y: 500, ...COMPACT };
    expect(bloomOrigin(b, second, { left: false, top: false })).toEqual({
      x: -1000 + COMPACT.width - AVATAR + 1920,
      y: 500 + COMPACT.height - AVATAR,
      size: AVATAR,
      width: 1920,
      height: 1080,
    });
  });
});

describe('coversDisplay', () => {
  it('tolerates 2 px', () => {
    expect(
      coversDisplay({ x: 0, y: 0, width: 1919, height: 1079 }, display),
    ).toBe(true);
    expect(
      coversDisplay({ x: 0, y: 0, width: 1918, height: 1080 }, display),
    ).toBe(true);
    expect(
      coversDisplay({ x: 0, y: 0, width: 1917, height: 1080 }, display),
    ).toBe(false);
    expect(
      coversDisplay({ x: 1, y: 0, width: 1920, height: 1080 }, display),
    ).toBe(false);
  });
});

describe('dragBounds', () => {
  it('moves by the cursor delta at compact size', () => {
    expect(dragBounds(bounds, { x: 10, y: 10 }, { x: 25, y: 4 })).toEqual({
      x: 1015,
      y: 494,
      ...COMPACT,
    });
  });
});

describe('clampToArea', () => {
  it('clamps on a negative-origin second monitor', () => {
    const area = { x: -1920, y: 0, width: 1920, height: 1040 };
    expect(clampToArea({ x: -2500, y: -50, ...COMPACT }, area)).toEqual({
      x: -1920,
      y: 0,
      ...COMPACT,
    });
    expect(clampToArea({ x: -100, y: 900, ...COMPACT }, area)).toEqual({
      x: -1920 + 1920 - COMPACT.width,
      y: 1040 - COMPACT.height,
      ...COMPACT,
    });
  });
});

describe('defaultPosition', () => {
  it('is the bottom-right corner minus the margin', () => {
    expect(defaultPosition({ x: 0, y: 0, width: 1920, height: 1040 })).toEqual({
      x: 1920 - COMPACT.width - 16,
      y: 1040 - COMPACT.height - 16,
    });
  });
});

describe('isRestorable', () => {
  const areas = [display];
  it('accepts a visible position', () => {
    expect(isRestorable({ x: 100, y: 100 }, areas)).toBe(true);
  });
  it('rejects an off-screen or non-finite position', () => {
    expect(isRestorable({ x: 5000, y: 100 }, areas)).toBe(false);
    expect(isRestorable({ x: -COMPACT.width, y: 0 }, areas)).toBe(false);
    expect(isRestorable({ x: Number.NaN, y: 0 }, areas)).toBe(false);
  });
});
