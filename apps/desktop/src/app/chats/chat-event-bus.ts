import type {
  ChatEvent,
  ChatEventPublisher,
  ChatEventSource,
} from '@ascua/chat';

// Mirrors IPC.chatEvent in @ascua/ipc.
const CHAT_EVENT_CHANNEL = 'ascua:chats:event';

export class ChatEventBus implements ChatEventPublisher, ChatEventSource {
  private readonly listeners = new Set<(e: ChatEvent) => void>();

  subscribe(listener: (e: ChatEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(e: ChatEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(e);
      } catch (err) {
        console.error('chat event subscriber failed', err);
      }
    }
  }
}

/** First subscriber: forwards every event to the renderer. */
export function bridgeToRenderer(
  bus: ChatEventSource,
  send: (channel: string, event: ChatEvent) => void,
  channel: string = CHAT_EVENT_CHANNEL,
): () => void {
  return bus.subscribe((e) => send(channel, e));
}
