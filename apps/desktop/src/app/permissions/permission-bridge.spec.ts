import { describe, expect, it, vi } from 'vitest';
import { IPC, type PermissionRequest } from '@ascua/ipc';

vi.mock('electron', () => ({
  app: { on: vi.fn() },
  ipcMain: { handle: vi.fn() },
}));

import { PermissionBridge, type HookPort } from './permission-bridge';

type Options = Parameters<HookPort['start']>[0];

class FakeHooks implements HookPort {
  options!: Options;
  pending = new Map<number, PermissionRequest>();
  start = (options: Options) => {
    this.options = options;
  };
  stop = vi.fn();
  resolve = vi.fn((id: number) => {
    this.pending.delete(id);
    this.options.onResolved(id);
  });
  get pendingCount() {
    return this.pending.size;
  }
  get pendingRequests() {
    return [...this.pending.values()];
  }
  request(id: number) {
    const request = { id, tool: 'Bash', summary: 'ls', input: {} };
    this.pending.set(id, request);
    this.options.onRequest(request);
    return request;
  }
}

function setup(ready: boolean) {
  const hooks = new FakeHooks();
  const send = vi.fn();
  const onActiveChange = vi.fn();
  const state = { ready };
  const bridge = new PermissionBridge({
    hooks,
    send,
    rendererReady: () => state.ready,
    onActiveChange,
  });
  bridge.start();
  return { hooks, send, onActiveChange, state, bridge };
}

describe('PermissionBridge', () => {
  it('holds a request until the renderer is ready, then re-sends it', () => {
    const { hooks, send, state, bridge } = setup(false);
    const request = hooks.request(1);
    expect(bridge.active).toBe(true);
    expect(send).not.toHaveBeenCalled();

    state.ready = true;
    bridge.resendPending();
    expect(send).toHaveBeenCalledWith(IPC.permissionRequest, request);
  });

  it('sends a request at once when the renderer is ready', () => {
    const { hooks, send } = setup(true);
    const request = hooks.request(1);
    expect(send).toHaveBeenCalledWith(IPC.permissionRequest, request);
  });

  it('sends permissionDismissed on every resolve', () => {
    const { hooks, send, bridge } = setup(true);
    hooks.request(1);
    hooks.request(2);
    bridge.resolve(1, 'allow');
    bridge.resolve(2, 'deny');
    expect(send).toHaveBeenCalledWith(IPC.permissionDismissed, 1);
    expect(send).toHaveBeenCalledWith(IPC.permissionDismissed, 2);
  });

  it('drops active only when the queue is empty', () => {
    const { hooks, onActiveChange, bridge } = setup(true);
    hooks.request(1);
    hooks.request(2);
    bridge.resolve(1, 'allow');
    expect(bridge.active).toBe(true);
    bridge.resolve(2, 'allow');
    expect(bridge.active).toBe(false);
    expect(onActiveChange).toHaveBeenCalledTimes(3);
  });

  it('treats a hook disconnect like a resolve', () => {
    const { hooks, send, bridge } = setup(true);
    hooks.request(1);
    hooks.pending.delete(1);
    hooks.options.onResolved(1);
    expect(send).toHaveBeenCalledWith(IPC.permissionDismissed, 1);
    expect(bridge.active).toBe(false);
  });
});
