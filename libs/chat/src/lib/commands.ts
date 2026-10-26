import type { ChatModeId } from './harness';

export interface ChatCommand {
  name: string;
  source: 'builtin' | 'nxy' | 'custom';
  description?: string;
  argumentHint?: string;
  mode?: ChatModeId;
}

export const CLEAR_COMMAND: ChatCommand = { name: 'clear', source: 'builtin' };

export const NXY_COMMANDS: ChatCommand[] = [
  { name: 'locate', source: 'nxy', mode: 'locate', argumentHint: '<what>' },
  { name: 'make', source: 'nxy', mode: 'make', argumentHint: '<task>' },
  { name: 'review', source: 'nxy', mode: 'review', argumentHint: '<target>' },
];

/** Builtin and nxy commands first, then custom ones deduped by name. */
export function mergeCommands(custom: readonly ChatCommand[]): ChatCommand[] {
  const out: ChatCommand[] = [CLEAR_COMMAND, ...NXY_COMMANDS];
  const seen = new Set(out.map((c) => c.name));
  for (const c of custom) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
  }
  return out;
}

/** A leading `/name`; the rest of the text, trimmed, is the args. */
export function parseCommand(
  text: string,
): { name: string; args: string } | undefined {
  const m = /^\s*\/(\S+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!m) return undefined;
  return { name: m[1], args: (m[2] ?? '').trim() };
}

export function nxyMode(
  text: string,
): { mode: ChatModeId; prompt: string } | undefined {
  const parsed = parseCommand(text);
  if (!parsed) return undefined;
  const cmd = NXY_COMMANDS.find((c) => c.name === parsed.name);
  if (!cmd?.mode) return undefined;
  return { mode: cmd.mode, prompt: parsed.args };
}
