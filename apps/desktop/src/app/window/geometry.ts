import type { BloomOrigin, Layout } from '@ascua/ipc';

/** Pure window math: no runtime electron import, so it is testable in node. */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Compact companion window, in DIP. Must match the renderer's avatar host
 * (`styles/avatar.css`, bubble offset in `styles/bubble.css`). */
export const COMPACT = { width: 420, height: 320 };
/** Side of the avatar square, in DIP. Must match the renderer's CSS
 * (`styles/avatar.css`, `styles/bubble.css`). */
export const AVATAR = 120;
/** Gap between the default window position and the work area edge. */
export const MARGIN = 16;

/** The avatar square inside the compact window, in screen coordinates. */
export function avatarRect(bounds: Rect, layout: Layout): Rect {
  return {
    x: bounds.x + (layout.left ? 0 : bounds.width - AVATAR),
    y: bounds.y + (layout.top ? 0 : bounds.height - AVATAR),
    width: AVATAR,
    height: AVATAR,
  };
}

export function hitsAvatar(
  cursor: Point,
  bounds: Rect,
  layout: Layout,
): boolean {
  const avatar = avatarRect(bounds, layout);
  return (
    cursor.x >= avatar.x &&
    cursor.x < avatar.x + AVATAR &&
    cursor.y >= avatar.y &&
    cursor.y < avatar.y + AVATAR
  );
}

/** The avatar's position on its display, for the renderer's bloom origin. */
export function bloomOrigin(
  bounds: Rect,
  displayBounds: Rect,
  layout: Layout,
): BloomOrigin {
  const avatar = avatarRect(bounds, layout);
  return {
    x: avatar.x - displayBounds.x,
    y: avatar.y - displayBounds.y,
    size: AVATAR,
    width: displayBounds.width,
    height: displayBounds.height,
  };
}

/** True once the window covers the display (2 px tolerance). */
export function coversDisplay(bounds: Rect, displayBounds: Rect): boolean {
  return (
    bounds.x === displayBounds.x &&
    bounds.y === displayBounds.y &&
    bounds.width >= displayBounds.width - 2 &&
    bounds.height >= displayBounds.height - 2
  );
}

export function dragBounds(
  startBounds: Rect,
  startCursor: Point,
  cursor: Point,
): Rect {
  return {
    x: startBounds.x + cursor.x - startCursor.x,
    y: startBounds.y + cursor.y - startCursor.y,
    width: COMPACT.width,
    height: COMPACT.height,
  };
}

/** Compact bounds pulled inside the work area. */
export function clampToArea(bounds: Rect, workArea: Rect): Rect {
  return {
    x: Math.min(
      Math.max(bounds.x, workArea.x),
      workArea.x + workArea.width - COMPACT.width,
    ),
    y: Math.min(
      Math.max(bounds.y, workArea.y),
      workArea.y + workArea.height - COMPACT.height,
    ),
    width: COMPACT.width,
    height: COMPACT.height,
  };
}

/** Bottom-right corner of the work area. */
export function defaultPosition(workArea: Rect): Point {
  return {
    x: workArea.x + workArea.width - COMPACT.width - MARGIN,
    y: workArea.y + workArea.height - COMPACT.height - MARGIN,
  };
}

export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** A saved position is usable when it is finite and the compact window
 * would still be visible on some work area. */
export function isRestorable(pos: Point, workAreas: Rect[]): boolean {
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return false;
  const candidate = {
    x: pos.x,
    y: pos.y,
    width: COMPACT.width,
    height: COMPACT.height,
  };
  return workAreas.some((area) => intersects(area, candidate));
}
