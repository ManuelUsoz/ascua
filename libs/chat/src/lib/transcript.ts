import type { ChatEvent } from './events';
import type { Message, MessagePart } from './model';

function patch(
  messages: Message[],
  id: string,
  fn: (parts: MessagePart[]) => MessagePart[],
): Message[] {
  return messages.map((m) => (m.id === id ? { ...m, parts: fn(m.parts) } : m));
}

/** Pure fold shared by main and renderer so they cannot drift. */
export function applyChatEvent(
  messages: Message[],
  event: ChatEvent,
): Message[] {
  switch (event.type) {
    case 'messageStarted':
      return messages.some((m) => m.id === event.message.id)
        ? messages
        : [...messages, event.message];
    case 'messageDelta':
      return patch(messages, event.messageId, (parts) => {
        const last = parts[parts.length - 1];
        if (last && last.kind === event.part) {
          return [
            ...parts.slice(0, -1),
            { kind: last.kind, text: last.text + event.text },
          ];
        }
        return [...parts, { kind: event.part, text: event.text }];
      });
    case 'toolUpdated':
      return patch(messages, event.messageId, (parts) => {
        const part = event.part;
        const i = parts.findIndex(
          (p) => p.kind === part.kind && p.toolUseId === part.toolUseId,
        );
        if (i < 0) return [...parts, part];
        const next = parts.slice();
        next[i] = part;
        return next;
      });
    case 'permissionRequested':
      return patch(messages, event.messageId, (parts) => [
        ...parts,
        { kind: 'permission', request: event.request, state: 'pending' },
      ]);
    case 'permissionSettled':
      return patch(messages, event.messageId, (parts) =>
        parts.map((p) =>
          p.kind === 'permission' && p.request.requestId === event.requestId
            ? { ...p, state: event.allowed ? 'allowed' : 'denied' }
            : p,
        ),
      );
    case 'messageCompleted':
      return messages.some((m) => m.id === event.message.id)
        ? messages.map((m) => (m.id === event.message.id ? event.message : m))
        : [...messages, event.message];
    default:
      return messages;
  }
}
