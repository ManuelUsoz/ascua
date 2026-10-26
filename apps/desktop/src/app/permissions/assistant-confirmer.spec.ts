import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PermissionRequest } from '@ascua/ipc';
import { AssistantConfirmer, CONFIRM_TIMEOUT_MS } from './assistant-confirmer';

const REQ = {
  tool: 'terminals_write',
  input: { id: 't1', text: 'ls' },
  params: { name: 'dev' },
  detail: 'ls',
};

function setup() {
  const confirmer = new AssistantConfirmer();
  let id = 0;
  const requests: PermissionRequest[] = [];
  const onResolved = vi.fn();
  confirmer.start({
    nextId: () => ++id,
    onRequest: (r) => requests.push(r),
    onResolved,
  });
  return { confirmer, requests, onResolved };
}

describe('AssistantConfirmer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refuses when not started', async () => {
    const confirmer = new AssistantConfirmer();
    await expect(
      confirmer.confirm(REQ, new AbortController().signal),
    ).resolves.toBe(false);
  });

  it('publishes an assistant request and resolves true on allow', async () => {
    const { confirmer, requests, onResolved } = setup();
    const result = confirmer.confirm(REQ, new AbortController().signal);
    expect(requests[0]).toMatchObject({
      id: 1,
      source: 'assistant',
      tool: 'terminals_write',
      params: { name: 'dev' },
      summary: 'ls',
    });
    expect(confirmer.pendingRequests).toHaveLength(1);
    confirmer.resolve(1, 'allow');
    await expect(result).resolves.toBe(true);
    expect(onResolved).toHaveBeenCalledWith(1);
    expect(confirmer.pendingRequests).toHaveLength(0);
  });

  it.each(['deny', 'terminal'] as const)('resolves false on %s', async (d) => {
    const { confirmer, onResolved } = setup();
    const result = confirmer.confirm(REQ, new AbortController().signal);
    confirmer.resolve(1, d);
    await expect(result).resolves.toBe(false);
    expect(onResolved).toHaveBeenCalledWith(1);
  });

  it('ignores unknown ids', () => {
    const { confirmer, onResolved } = setup();
    confirmer.resolve(99, 'allow');
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('resolves false when the signal aborts', async () => {
    const { confirmer, onResolved } = setup();
    const abort = new AbortController();
    const result = confirmer.confirm(REQ, abort.signal);
    abort.abort();
    await expect(result).resolves.toBe(false);
    expect(onResolved).toHaveBeenCalledWith(1);
  });

  it('resolves false after the timeout', async () => {
    const { confirmer, onResolved } = setup();
    const result = confirmer.confirm(REQ, new AbortController().signal);
    vi.advanceTimersByTime(CONFIRM_TIMEOUT_MS);
    await expect(result).resolves.toBe(false);
    expect(onResolved).toHaveBeenCalledWith(1);
  });

  it('dismissAll refuses everything pending', async () => {
    const { confirmer, onResolved } = setup();
    const a = confirmer.confirm(REQ, new AbortController().signal);
    const b = confirmer.confirm(REQ, new AbortController().signal);
    confirmer.dismissAll();
    await expect(Promise.all([a, b])).resolves.toEqual([false, false]);
    expect(onResolved).toHaveBeenCalledTimes(2);
    expect(confirmer.pendingRequests).toHaveLength(0);
  });
});
