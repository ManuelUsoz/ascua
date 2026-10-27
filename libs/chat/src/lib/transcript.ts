import type { ChatEvent } from './events';
import type { Message, MessagePart, ToolUsePart } from './model';

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
    case 'transcriptCleared':
      return [];
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
        const now = Date.now();
        const i = parts.findIndex(
          (p) => p.kind === part.kind && p.toolUseId === part.toolUseId,
        );
        const next = parts.slice();
        if (part.kind === 'toolUse') {
          const old = i < 0 ? undefined : (parts[i] as ToolUsePart);
          const merged: ToolUsePart = { ...old, ...part };
          merged.startedAt = part.startedAt ?? old?.startedAt ?? now;
          const end = part.endedAt ?? old?.endedAt;
          if (end !== undefined) merged.endedAt = end;
          else if (merged.status !== 'running') merged.endedAt = now;
          if (i < 0) next.push(merged);
          else next[i] = merged;
        } else {
          if (i < 0) next.push(part);
          else next[i] = part;
          const j = next.findIndex(
            (p) => p.kind === 'toolUse' && p.toolUseId === part.toolUseId,
          );
          const use = j < 0 ? undefined : (next[j] as ToolUsePart);
          if (use && use.endedAt === undefined) {
            next[j] = { ...use, endedAt: now };
          }
        }
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
    case 'questionRequested':
      return patch(messages, event.messageId, (parts) => [
        ...parts,
        { kind: 'question', request: event.request, state: 'pending' },
      ]);
    case 'questionSettled':
      return patch(messages, event.messageId, (parts) =>
        parts.map((p) => {
          if (p.kind !== 'question' || p.request.requestId !== event.requestId)
            return p;
          return event.answers && !event.skipped
            ? { ...p, state: 'answered', answers: event.answers }
            : { ...p, state: 'skipped' };
        }),
      );
    case 'messageCompleted':
      return messages.some((m) => m.id === event.message.id)
        ? messages.map((m) => (m.id === event.message.id ? event.message : m))
        : [...messages, event.message];
    case 'capabilitiesChanged':
      return messages;
    default:
      return messages;
  }
}
