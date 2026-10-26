import type { AssistantEvent } from './engine';
import type { AssistantErrorKind } from './errors';

export interface TranscriptTool {
  callId: string;
  tool: string;
  state: 'running' | 'ok' | 'failed';
}

export interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: TranscriptTool[];
  state: 'streaming' | 'done' | 'cancelled' | 'failed';
  error?: AssistantErrorKind;
}

const assistantId = (turn: string) => `${turn}:assistant`;

function patch(
  messages: TranscriptMessage[],
  id: string,
  change: (message: TranscriptMessage) => TranscriptMessage,
): TranscriptMessage[] {
  return messages.map((m) => (m.id === id ? change(m) : m));
}

/** Pure and immutable; shared by main (reload recovery) and the renderer store. */
export function reduceTranscript(
  messages: TranscriptMessage[],
  event: AssistantEvent,
): TranscriptMessage[] {
  switch (event.type) {
    case 'turnStarted':
      return [
        ...messages,
        {
          id: `${event.turn}:user`,
          role: 'user',
          text: event.text,
          tools: [],
          state: 'done',
        },
        {
          id: assistantId(event.turn),
          role: 'assistant',
          text: '',
          tools: [],
          state: 'streaming',
        },
      ];
    case 'text':
      return patch(messages, assistantId(event.turn), (m) => ({
        ...m,
        text: m.text + event.delta,
      }));
    case 'toolStarted':
      return patch(messages, assistantId(event.turn), (m) => ({
        ...m,
        // Text before and after a tool call must not be glued together.
        text: m.text === '' || /\s$/.test(m.text) ? m.text : m.text + '\n',
        tools: [
          ...m.tools,
          { callId: event.callId, tool: event.tool, state: 'running' },
        ],
      }));
    case 'toolFinished':
      return patch(messages, assistantId(event.turn), (m) => ({
        ...m,
        tools: m.tools.map((t) =>
          t.callId === event.callId
            ? { ...t, state: event.ok ? 'ok' : 'failed' }
            : t,
        ),
      }));
    case 'turnDone':
      return patch(messages, assistantId(event.turn), (m) => ({
        ...m,
        state: event.outcome === 'done' ? 'done' : 'cancelled',
      }));
    case 'error':
      if (!event.turn) return messages;
      return patch(messages, assistantId(event.turn), (m) => ({
        ...m,
        state: 'failed',
        error: event.kind,
      }));
    default:
      return messages;
  }
}
