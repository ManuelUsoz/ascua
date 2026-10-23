import { app, ipcMain } from 'electron';
import {
  IPC,
  type PermissionDecision,
  type PermissionRequest,
} from '@ascua/ipc';
import type { HookServer } from './hook-server';

/** The slice of HookServer the bridge uses, so tests can fake it. */
export type HookPort = Pick<
  HookServer,
  'start' | 'stop' | 'resolve' | 'pendingCount' | 'pendingRequests'
>;

export interface PermissionBridgeOptions {
  hooks: HookPort;
  send(channel: string, payload: unknown): void;
  rendererReady(): boolean;
  /** `active` changed: the window must re-evaluate click-through. */
  onActiveChange(): void;
}

/**
 * Connects the hook server to the renderer's permission bubble. `active` is
 * true while any request waits for a decision (the bubble is on screen).
 */
export class PermissionBridge {
  private bubble = false;

  constructor(private readonly options: PermissionBridgeOptions) {}

  get active(): boolean {
    return this.bubble;
  }

  start(): void {
    this.options.hooks.start({
      onRequest: (request) => this.show(request),
      onResolved: (id) => this.resolved(id),
    });
  }

  stop(): void {
    this.options.hooks.stop();
  }

  resolve(id: number, decision: PermissionDecision): void {
    this.options.hooks.resolve(id, decision);
  }

  /** Re-sends the pending requests after the renderer (re)loaded. */
  resendPending(): void {
    for (const request of this.options.hooks.pendingRequests) {
      this.options.send(IPC.permissionRequest, request);
    }
  }

  private show(request: PermissionRequest): void {
    this.bubble = true;
    this.options.onActiveChange();
    // If the renderer is still loading, `did-finish-load` re-sends the hook's
    // pending requests.
    if (this.options.rendererReady()) {
      this.options.send(IPC.permissionRequest, request);
    }
  }

  private resolved(id: number): void {
    // Covers both a decision and a hook that disconnected early; the renderer
    // removes the card by id either way.
    this.options.send(IPC.permissionDismissed, id);
    if (this.options.hooks.pendingCount > 0) return;
    this.bubble = false;
    this.options.onActiveChange();
  }
}

/** IPC handler for decisions and the hook server's lifetime. Call once. */
export function registerPermissionIpc(bridge: PermissionBridge): void {
  ipcMain.handle(
    IPC.resolvePermission,
    (_event, id: number, decision: PermissionDecision) =>
      bridge.resolve(id, decision),
  );
  bridge.start();
  app.on('will-quit', () => bridge.stop());
}
