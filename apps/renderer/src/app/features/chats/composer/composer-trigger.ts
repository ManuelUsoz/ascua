import type { ChatCommand } from '@ascua/chat';

/** What the caret is currently completing. Ready for a later `mention` kind. */
export type ComposerTrigger = {
  kind: 'command';
  query: string;
  rangeStart: number;
  rangeEnd: number;
};

/**
 * Finds a `/query` token ending at the cursor. The token must start at the
 * text start or after whitespace; a path-like token (second "/") is no trigger.
 */
export function detectTrigger(
  text: string,
  cursor: number,
): ComposerTrigger | undefined {
  const end = Math.max(0, Math.min(cursor, text.length));
  let start = end;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  const token = text.slice(start, end);
  if (!token.startsWith('/')) return undefined;
  const query = token.slice(1);
  if (query.includes('/')) return undefined;
  return { kind: 'command', query, rangeStart: start, rangeEnd: end };
}

export function replaceRange(
  text: string,
  start: number,
  end: number,
  insert: string,
): { text: string; cursor: number } {
  return {
    text: text.slice(0, start) + insert + text.slice(end),
    cursor: start + insert.length,
  };
}

/** Name prefix first, then name substring, then description; stable order. */
export function rankCommands(
  commands: readonly ChatCommand[],
  query: string,
): ChatCommand[] {
  const q = query.toLowerCase();
  if (!q) return [...commands];
  const rank = (c: ChatCommand): number => {
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.includes(q)) return 1;
    if (c.description?.toLowerCase().includes(q)) return 2;
    return -1;
  };
  return commands
    .map((c, i) => ({ c, i, r: rank(c) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.c);
}
