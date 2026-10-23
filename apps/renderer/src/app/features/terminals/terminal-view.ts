import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
} from '@angular/core';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { RoomState } from '../../core/room/room-state';
import { TerminalSessions } from '../../core/terminals/terminal-sessions';

/** One xterm bound to a main-process terminal by session id. */
@Component({
  selector: 'app-terminal-view',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    style: 'display: block; width: 100%; height: 100%; min-height: 0',
    // Escape belongs to the TUI here; app.ts would collapse the room.
    '(keydown.escape)': '$event.stopPropagation()',
  },
})
export class TerminalView {
  readonly sessionId = input.required<string>();

  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly sessions = inject(TerminalSessions);
  private readonly room = inject(RoomState);

  private term: Terminal | undefined;
  private fit: FitAddon | undefined;
  private destroyed = false;

  constructor() {
    const cleanups: (() => void)[] = [];
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      for (const cleanup of cleanups) cleanup();
      this.term?.dispose();
      this.term = undefined;
    });

    afterNextRender(() => void this.mount(cleanups));

    effect(() => {
      if (this.room.open()) this.refit();
    });
  }

  private async mount(cleanups: (() => void)[]): Promise<void> {
    try {
      await document.fonts?.load('12px "JetBrains Mono Variable"');
    } catch {
      // Fall back to whatever font resolves.
    }
    if (this.destroyed) return;

    const css = getComputedStyle(this.host);
    const token = (name: string): string => css.getPropertyValue(name).trim();
    const term = new Terminal({
      fontFamily: token('--font-mono'),
      fontSize: 12,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: token('--surface-sunken'),
        foreground: token('--ink'),
        cursor: token('--oro'),
        selectionBackground: token('--violeta-wash'),
        black: token('--surface-sunken'),
        brightBlack: token('--ink-muted'),
        red: token('--alert'),
        green: token('--ok'),
        yellow: token('--oro'),
        magenta: token('--violeta'),
        cyan: token('--ask'),
        white: token('--ink-muted'),
        brightWhite: token('--ink'),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(this.host);
    this.term = term;
    this.fit = fit;

    const id = this.sessionId();
    const input = term.onData((data) => this.sessions.write(id, data));
    cleanups.push(() => input.dispose());

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.refit());
      observer.observe(this.host);
      cleanups.push(() => observer.disconnect());
    }
    this.refit();

    const detach = await this.sessions.attach(id, (data) => term.write(data));
    if (this.destroyed) detach();
    else cleanups.push(detach);
  }

  /** Fit and tell the PTY, unless the room is collapsed or the host is hidden. */
  private refit(): void {
    const term = this.term;
    if (!term || !this.fit || !this.room.open()) return;
    if (this.host.clientWidth === 0 || this.host.clientHeight === 0) return;
    try {
      this.fit.fit();
    } catch {
      return;
    }
    this.sessions.resize(this.sessionId(), {
      cols: term.cols,
      rows: term.rows,
    });
  }
}
