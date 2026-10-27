import { describe, expect, it, vi } from 'vitest';
import {
  IPC,
  type PermissionDecision,
  type PermissionRequest,
} from '@ascua/ipc';

vi.mock('electron', () => ({
  app: { on: vi.fn() },
  ipcMain: { handle: vi.fn() },
}));

import { PermissionBridge } from './permission-bridge';
import type { PermissionSink, PermissionSource } from './permission-source';

class FakeSource implements PermissionSource {
  sink!: PermissionSink;
  pending = new Map<number, PermissionRequest>();
  start = (sink: PermissionSink) => {
    this.sink = sink;
  };
  stop = vi.fn();
  resolve = vi.fn((id: number, _decision: PermissionDecision) => {
    if (!this.pending.delete(id)) return;
    this.sink.onResolved(id);
  });
  get pendingRequests() {
    return [...this.pending.values()];
  }
  request(tool = 'Bash') {
    const request: PermissionRequest = {
      id: this.sink.nextId(),
      source: 'hook',
      tool,
      summary: 'ls',
      input: {},
    };
    this.pending.set(request.id, request);
    this.sink.onRequest(request);
    return request;
  }
}

function setup(ready: boolean, count = 1) {
  const sources = Array.from({ length: count }, () => new FakeSource());
  const send = vi.fn();
  const onActiveChange = vi.fn();
  const state = { ready };
  const bridge = new PermissionBridge({
    sources,
    send,
    rendererReady: () => state.ready,
    onActiveChange,
  });
  bridge.start();
  return { sources, hooks: sources[0], send, onActiveChange, state, bridge };
}

describe('PermissionBridge', () => {
  it('holds a request until the renderer is ready, then re-sends it', () => {
    const { hooks, send, state, bridge } = setup(false);
    const request = hooks.request();
    expect(bridge.active).toBe(true);
    expect(send).not.toHaveBeenCalled();

    state.ready = true;
    bridge.resendPending();
    expect(send).toHaveBeenCalledWith(IPC.permissionRequest, request);
  });

  it('sends a request at once when the renderer is ready', () => {
    const { hooks, send } = setup(true);
    const request = hooks.request();
    expect(send).toHaveBeenCalledWith(IPC.permissionRequest, request);
  });

  it('sends permissionDismissed on every resolve', () => {
    const { hooks, send, bridge } = setup(true);
    const a = hooks.request();
    const b = hooks.request();
    bridge.resolve(a.id, 'allow');
    bridge.resolve(b.id, 'deny');
    expect(send).toHaveBeenCalledWith(IPC.permissionDismissed, a.id);
    expect(send).toHaveBeenCalledWith(IPC.permissionDismissed, b.id);
  });

  it('drops active only when the queue is empty', () => {
    const { hooks, onActiveChange, bridge } = setup(true);
    const a = hooks.request();
    const b = hooks.request();
    bridge.resolve(a.id, 'allow');
    expect(bridge.active).toBe(true);
    bridge.resolve(b.id, 'allow');
    expect(bridge.active).toBe(false);
    expect(onActiveChange).toHaveBeenCalledTimes(3);
  });

  it('treats a hook disconnect like a resolve', () => {
    const { hooks, send, bridge } = setup(true);
    const a = hooks.request();
    hooks.pending.delete(a.id);
    hooks.sink.onResolved(a.id);
    expect(send).toHaveBeenCalledWith(IPC.permissionDismissed, a.id);
    expect(bridge.active).toBe(false);
  });

  it('gives two sources distinct ids', () => {
    const { sources } = setup(true, 2);
    const ids = [
      sources[0].request(),
      sources[1].request(),
      sources[0].request(),
    ].map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('forwards a resolve to every source; only the owner acts', () => {
    const { sources, bridge } = setup(true, 2);
    const mine = sources[1].request();
    bridge.resolve(mine.id, 'allow');
    expect(sources[0].resolve).toHaveBeenCalledWith(mine.id, 'allow');
    expect(sources[1].resolve).toHaveBeenCalledWith(mine.id, 'allow');
    expect(sources[1].pending.size).toBe(0);
  });

  it('keeps the bubble while either source has pending requests', () => {
    const { sources, bridge } = setup(true, 2);
    const a = sources[0].request();
    const b = sources[1].request();
    bridge.resolve(a.id, 'allow');
    expect(bridge.active).toBe(true);
    bridge.resolve(b.id, 'allow');
    expect(bridge.active).toBe(false);
  });

  it('re-sends the pending requests of all sources', () => {
    const { sources, send, bridge } = setup(false, 2);
    const a = sources[0].request();
    const b = sources[1].request();
    bridge.resendPending();
    expect(send).toHaveBeenCalledWith(IPC.permissionRequest, a);
    expect(send).toHaveBeenCalledWith(IPC.permissionRequest, b);
  });
});
