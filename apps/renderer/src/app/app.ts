import {
  AfterViewInit,
  Component,
  computed,
  inject,
  NgZone,
  OnDestroy,
  signal,
} from '@angular/core';
import {
  live,
  mountAscua,
  type Ascua,
  type Life,
  type Need,
} from '@ascua/character';
import type {
  BloomOrigin,
  Layout,
  PermissionDecision,
  PermissionRequest,
} from '@ascua/ipc';

/** Windows' default double-click interval: wait this long before poking. */
const DBL_MS = 500;
/** Movement beyond this starts an OS window drag instead of a click. */
const DRAG_PX = 4;

/** Commands that deserve a warning look before you approve them. */
const DESTRUCTIVE =
  /\brm\s+-\w*[rf]|--force\b|\bpush\s+-f\b|\breset\s+--hard\b|\bdel\s+\/[sq]\b|\bRemove-Item\b.*-Recurse|\bdrop\s+(table|database)\b|\bmkfs\b|\bdd\s+if=/i;

function actFor(request: PermissionRequest): Need {
  if (request.tool === 'AskUserQuestion') return 'ask';
  return DESTRUCTIVE.test(request.summary) ? 'warn' : 'alert';
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
  readonly open = signal(false);
  readonly requests = signal<PermissionRequest[]>([]);
  readonly current = computed<PermissionRequest | undefined>(
    () => this.requests()[0],
  );
  readonly queuedText = computed(() =>
    this.requests().length > 1 ? `+${this.requests().length - 1} waiting` : '',
  );
  private readonly zone = inject(NgZone);

  private ascua?: Ascua;
  private bubbleFace?: Ascua;
  private life?: Life;
  private host?: HTMLElement;
  private cleanups: Array<() => void> = [];
  private pokeTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private press?: { x: number; y: number; dragging: boolean };
  private dragged = false;
  private closing = false;

  ngAfterViewInit(): void {
    const host = document.querySelector<HTMLElement>('#ascua-host');
    if (!host) return;
    this.host = host;

    this.ascua = mountAscua(host, 'stage');
    this.life = live(this.ascua);

    const faceHost = document.querySelector<HTMLElement>('#bubble-face');
    if (faceHost) {
      this.bubbleFace = mountAscua(faceHost, 'face');
      this.bubbleFace.pause(true);
    }

    this.on(host, 'pointerdown', (event) =>
      this.pointerDown(event as PointerEvent),
    );
    this.on(host, 'pointermove', (event) =>
      this.pointerMove(event as PointerEvent),
    );
    this.on(host, 'pointerup', (event) => this.pointerUp(event as PointerEvent));
    this.on(host, 'pointercancel', () => this.pointerUp());
    this.on(host, 'click', (event) => this.click(event as MouseEvent));
    this.on(host, 'dblclick', (event) => {
      event.preventDefault();
      this.expand();
    });
    this.on(window, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape' && this.open()) {
        this.collapse();
      }
    });
    // The shell resizes to compact while the collapse animation is still up;
    // snap to the final compact frame before that size paints.
    this.on(window, 'resize', () => this.onResize());

    const api = window.ascua;
    if (!api) return;

    this.cleanups.push(
      api.onFullscreenChanged((state) => {
        this.zone.run(() => {
          if (state.fullscreen) this.enterFullscreen(state.origin);
          else this.leaveFullscreen();
        });
      }),
    );
    this.cleanups.push(
      api.onLayoutChanged((layout) => this.zone.run(() => this.applyLayout(layout))),
    );
    this.cleanups.push(
      api.onPermissionRequest((request) =>
        this.zone.run(() => this.enqueue(request)),
      ),
    );
    this.cleanups.push(
      api.onPermissionDismissed((id) =>
        this.zone.run(() => this.dismiss(id)),
      ),
    );
    api.getLayout().then((layout) => this.applyLayout(layout));
  }

  ngOnDestroy(): void {
    clearTimeout(this.pokeTimer);
    clearTimeout(this.closeTimer);
    for (const cleanup of this.cleanups) cleanup();
    this.ascua?.pause(true);
    this.bubbleFace?.pause(true);
  }

  decide(decision: PermissionDecision): void {
    const current = this.current();
    if (!current) return;

    this.requests.update((queue) => queue.slice(1));
    const next = this.current();
    if (next) this.life?.need(actFor(next));
    else if (decision === 'allow') this.life?.celebrate();
    else this.life?.release();
    this.renderBubble();

    window.ascua?.resolvePermission(current.id, decision).catch(() => {
      // The hook may have gone away; Claude Code will fall back on its own.
    });
  }

  private dismiss(id: number): void {
    if (!this.requests().some((request) => request.id === id)) return;
    this.requests.update((queue) => queue.filter((request) => request.id !== id));
    const next = this.current();
    if (next) this.life?.need(actFor(next));
    else this.life?.release();
    this.renderBubble();
  }

  private enqueue(request: PermissionRequest): void {
    const wasEmpty = this.requests().length === 0;
    this.requests.update((queue) => [...queue, request]);
    if (wasEmpty) this.life?.need(actFor(request));
    this.renderBubble();
    if (this.open()) this.collapse();
  }

  private renderBubble(): void {
    const current = this.current();
    if (!this.bubbleFace) return;
    this.bubbleFace.pause(!current);
    if (current) this.bubbleFace.play(actFor(current));
  }

  async expand(): Promise<void> {
    if (this.open() || this.closing) return;
    this.clearPoke();

    const api = window.ascua;
    if (!api) {
      // Browser preview: show the room without a native window.
      this.applyOrigin(this.originFromHost());
      document.body.classList.add('is-open');
      this.open.set(true);
      this.ascua?.pause(true);
      return;
    }

    const origin = await api.toggleFullscreen();
    // The fullscreen event carries the same origin; this is a fallback for
    // platforms that enter fullscreen without emitting it.
    this.zone.run(() => {
      if (!this.open()) this.pendingOrigin = origin;
    });
  }

  collapse(): void {
    if (!this.open() || this.closing) return;
    this.closing = true;
    this.clearPoke();

    document.body.classList.remove('is-open');
    document.body.classList.add('is-closing');

    const api = window.ascua;
    if (!api) {
      this.finishClose();
      return;
    }

    // Let the shell shrink back into the avatar before leaving fullscreen.
    this.closeTimer = setTimeout(
      () => api.exitFullscreen(),
      this.duration(640),
    );
  }

  /** The room's close button: Ascua quits entirely, it doesn't shrink back. */
  close(): void {
    const api = window.ascua;
    api?.quit().catch(() => {
      // The shell is already going down; app.quit() finishes it either way.
    });
    if (!api) this.collapse(); // Browser preview: no shell to quit.
  }

  private onResize(): void {
    if (this.closing) this.finishClose();
  }

  private pendingOrigin?: BloomOrigin;

  private enterFullscreen(origin?: BloomOrigin): void {
    const bloom = origin ?? this.pendingOrigin ?? this.originFromHost();
    this.pendingOrigin = undefined;
    this.applyOrigin(bloom);

    document.body.classList.remove('is-closing');
    document.body.classList.add('is-waking');
    requestAnimationFrame(() => {
      document.body.classList.remove('is-waking');
      document.body.classList.add('is-open');
      this.open.set(true);
      this.ascua?.pause(true);
    });
  }

  private leaveFullscreen(): void {
    this.finishClose();
  }

  private finishClose(): void {
    this.closing = false;
    document.body.classList.remove('is-open', 'is-closing', 'is-waking');
    this.open.set(false);
    this.ascua?.pause(false);
    this.resetOrigin();
    this.settle();
  }

  /**
   * Collapses that finish invisibly (OS minimize) must land on the final
   * compact frame without the base fade-in delay; skip the transition for a
   * frame, then hand the easing back.
   */
  private settle(): void {
    document.body.classList.add('is-settled');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.body.classList.remove('is-settled')),
    );
  }

  private applyOrigin(origin: BloomOrigin): void {
    const root = document.documentElement.style;
    root.setProperty('--ox', `${origin.x}px`);
    root.setProperty('--oy', `${origin.y}px`);
    root.setProperty('--os', `${origin.size}px`);

    if (this.host) {
      this.host.style.left = `${origin.x}px`;
      this.host.style.top = `${origin.y}px`;
      this.host.style.right = 'auto';
      this.host.style.bottom = 'auto';
    }
  }

  private resetOrigin(): void {
    const root = document.documentElement.style;
    root.removeProperty('--ox');
    root.removeProperty('--oy');
    root.removeProperty('--os');
    if (this.host) {
      this.host.style.left = '';
      this.host.style.top = '';
      this.host.style.right = '';
      this.host.style.bottom = '';
    }
  }

  private originFromHost(): BloomOrigin {
    const rect = this.host?.getBoundingClientRect();
    return {
      x: rect?.left ?? 0,
      y: rect?.top ?? 0,
      size: rect?.width ?? 120,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  private applyLayout(layout: Layout): void {
    document.body.dataset['x'] = layout.left ? 'left' : 'right';
    document.body.dataset['y'] = layout.top ? 'top' : 'bottom';
  }

  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.open() || this.closing) return;
    this.press = { x: event.screenX, y: event.screenY, dragging: false };
    this.dragged = false;
    this.host?.setPointerCapture(event.pointerId);
  }

  private pointerMove(event: PointerEvent): void {
    if (!this.press || !(event.buttons & 1)) return;
    if (this.press.dragging) return;
    if (
      Math.hypot(event.screenX - this.press.x, event.screenY - this.press.y) <=
      DRAG_PX
    ) {
      return;
    }
    this.press.dragging = true;
    this.dragged = true;
    window.ascua?.dragStart();
  }

  private pointerUp(event?: PointerEvent): void {
    if (this.press?.dragging) window.ascua?.dragEnd();
    this.press = undefined;
    if (event && this.host?.hasPointerCapture(event.pointerId)) {
      this.host.releasePointerCapture(event.pointerId);
    }
  }

  private click(event: MouseEvent): void {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    if (event.detail > 1) return;

    this.clearPoke();
    this.pokeTimer = setTimeout(() => this.life?.poke(), DBL_MS);
  }

  private clearPoke(): void {
    if (this.pokeTimer) clearTimeout(this.pokeTimer);
    this.pokeTimer = undefined;
  }

  private duration(ms: number): number {
    const speed =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--spd'),
      ) || 1;
    return ms * speed;
  }

  private on(
    target: EventTarget,
    type: string,
    handler: (event: Event) => void,
  ): void {
    target.addEventListener(type, handler);
    this.cleanups.push(() => target.removeEventListener(type, handler));
  }
}
