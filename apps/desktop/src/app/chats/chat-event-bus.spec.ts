import { describe, expect, it, vi } from 'vitest';
import type { ChatEvent } from '@ascua/chat';
import { ChatEventBus, bridgeToRenderer } from './chat-event-bus';

const event = {
  type: 'statusChanged',
  sessionId: 's',
  projectId: 'p',
  status: 'idle',
} as unknown as ChatEvent;

describe('ChatEventBus', () => {
  it('fans out and unsubscribes', () => {
    const bus = new ChatEventBus();
    const a = vi.fn();
    const b = vi.fn();
    const off = bus.subscribe(a);
    bus.subscribe(b);
    bus.publish(event);
    off();
    bus.publish(event);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('isolates a throwing subscriber', () => {
    const bus = new ChatEventBus();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ok = vi.fn();
    bus.subscribe(() => {
      throw new Error('boom');
    });
    bus.subscribe(ok);
    bus.publish(event);
    expect(ok).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('bridges to the renderer channel', () => {
    const bus = new ChatEventBus();
    const send = vi.fn();
    bridgeToRenderer(bus, send);
    bus.publish(event);
    expect(send).toHaveBeenCalledWith('ascua:chats:event', event);
  });
});
