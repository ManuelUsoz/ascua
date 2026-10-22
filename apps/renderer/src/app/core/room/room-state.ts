import {
  DestroyRef,
  DOCUMENT,
  Injectable,
  inject,
  signal,
} from '@angular/core';
import type { BloomOrigin, Layout } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { duration } from '../motion/motion';

/**
 * The room: the fullscreen state of the one window. Main owns the native
 * window; this owns the renderer's side of the bloom and the avatar's corner.
 *
 * `body` classes and the `--ox/--oy/--os` variables are written synchronously
 * on purpose: the bloom and the collapse are timed against native resizes and
 * animation frames, and a change-detection tick later shows up as a blink.
 */
@Injectable({ providedIn: 'root' })
export class RoomState {
  private readonly api = inject(ASCUA_API);
  private readonly document = inject(DOCUMENT);
  private readonly isOpen = signal(false);
  /** The room is fully open (the bloom finished growing). */
  readonly open = this.isOpen.asReadonly();

  private closing = false;
  private pendingOrigin?: BloomOrigin;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private avatar?: HTMLElement;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => clearTimeout(this.closeTimer));

    const api = this.api;
    if (!api) return;

    const offFullscreen = api.onFullscreenChanged((state) => {
      if (state.fullscreen) this.enterFullscreen(state.origin);
      else this.finishClose();
    });
    const offLayout = api.onLayoutChanged((layout) => this.applyLayout(layout));
    destroyRef.onDestroy(() => {
      offFullscreen();
      offLayout();
    });
    api.getLayout().then((layout) => this.applyLayout(layout));
  }

  /** The avatar rests in the compact window: no room, no bloom in flight. */
  isCompact(): boolean {
    return !this.isOpen() && !this.closing;
  }

  /** The avatar's element, measured when main sends no bloom origin. */
  anchor(avatar: HTMLElement): void {
    this.avatar = avatar;
  }

  async expand(): Promise<void> {
    if (!this.isCompact()) return;

    const api = this.api;
    if (!api) {
      // Browser preview: show the room without a native window.
      this.applyOrigin(this.originFromAvatar());
      this.classes.add('is-open');
      this.isOpen.set(true);
      return;
    }

    const origin = await api.toggleFullscreen();
    // The fullscreen event carries the same origin; this is a fallback for
    // platforms that enter fullscreen without emitting it.
    if (!this.isOpen()) this.pendingOrigin = origin;
  }

  collapse(): void {
    if (!this.isOpen() || this.closing) return;
    this.closing = true;

    this.classes.remove('is-open');
    this.classes.add('is-closing');

    const api = this.api;
    if (!api) {
      this.finishClose();
      return;
    }

    // Let the shell shrink back into the avatar before leaving fullscreen.
    this.closeTimer = setTimeout(() => api.exitFullscreen(), duration(640));
  }

  /** The room's close button: Ascua quits entirely, it doesn't shrink back. */
  close(): void {
    const api = this.api;
    api?.quit().catch(() => {
      // The shell is already going down; app.quit() finishes it either way.
    });
    if (!api) this.collapse(); // Browser preview: no shell to quit.
  }

  /**
   * The shell resizes to compact while the collapse animation is still up;
   * snap to the final compact frame before that size paints.
   */
  resized(): void {
    if (this.closing) this.finishClose();
  }

  private get classes(): DOMTokenList {
    return this.document.body.classList;
  }

  private enterFullscreen(origin?: BloomOrigin): void {
    const bloom = origin ?? this.pendingOrigin ?? this.originFromAvatar();
    this.pendingOrigin = undefined;
    this.applyOrigin(bloom);

    this.classes.remove('is-closing');
    this.classes.add('is-waking');
    requestAnimationFrame(() => {
      this.classes.remove('is-waking');
      this.classes.add('is-open');
      this.isOpen.set(true);
    });
  }

  private finishClose(): void {
    this.closing = false;
    this.classes.remove('is-open', 'is-closing', 'is-waking');
    this.isOpen.set(false);
    this.resetOrigin();
    this.settle();
  }

  /**
   * Collapses that finish invisibly (OS minimize) must land on the final
   * compact frame without the base fade-in delay; skip the transition for a
   * frame, then hand the easing back.
   */
  private settle(): void {
    this.classes.add('is-settled');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this.classes.remove('is-settled')),
    );
  }

  private applyOrigin(origin: BloomOrigin): void {
    const root = this.document.documentElement.style;
    root.setProperty('--ox', `${origin.x}px`);
    root.setProperty('--oy', `${origin.y}px`);
    root.setProperty('--os', `${origin.size}px`);
    this.classes.add('has-origin');
  }

  private resetOrigin(): void {
    const root = this.document.documentElement.style;
    root.removeProperty('--ox');
    root.removeProperty('--oy');
    root.removeProperty('--os');
    this.classes.remove('has-origin');
  }

  private originFromAvatar(): BloomOrigin {
    const rect = this.avatar?.getBoundingClientRect();
    return {
      x: rect?.left ?? 0,
      y: rect?.top ?? 0,
      size: rect?.width ?? 120,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  private applyLayout(layout: Layout): void {
    this.document.body.dataset['x'] = layout.left ? 'left' : 'right';
    this.document.body.dataset['y'] = layout.top ? 'top' : 'bottom';
  }
}
