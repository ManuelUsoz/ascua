import type { MessagePart, ToolResultPart, ToolUsePart } from './model';

export interface SubagentActivity {
  call: ToolUsePart;
  agent: string;
  description?: string;
  running: boolean;
  durationMs?: number;
  calls: ToolUsePart[];
}

export interface ToolGroup {
  kind: 'toolGroup';
  calls: ToolUsePart[];
  subagents: SubagentActivity[];
  counts: { tool: string; count: number }[];
  /** Results by tool-use id, for calls (top-level or nested) that have one. */
  results: Record<string, ToolResultPart>;
  durationMs?: number;
}

export type PartSegment = Exclude<MessagePart, { kind: 'toolUse' }> | ToolGroup;

function duration(calls: ToolUsePart[]): number | undefined {
  let min: number | undefined;
  let max: number | undefined;
  for (const c of calls) {
    if (c.startedAt !== undefined) {
      min = min === undefined ? c.startedAt : Math.min(min, c.startedAt);
    }
    if (c.endedAt !== undefined) {
      max = max === undefined ? c.endedAt : Math.max(max, c.endedAt);
    }
  }
  return min !== undefined && max !== undefined ? max - min : undefined;
}

function buildGroup(
  uses: ToolUsePart[],
  resultList: ToolResultPart[],
): ToolGroup {
  const results: Record<string, ToolResultPart> = {};
  for (const r of resultList) results[r.toolUseId] = r;
  const ids = new Set(uses.map((u) => u.toolUseId));
  const agents = uses.filter((u) => u.agent);
  const agentIds = new Set(agents.map((a) => a.toolUseId));
  const nested = (u: ToolUsePart) =>
    !!u.parentToolUseId && ids.has(u.parentToolUseId);
  const calls = uses.filter((u) => !agentIds.has(u.toolUseId) && !nested(u));
  const subagents: SubagentActivity[] = agents.map((a) => {
    const children = uses.filter((u) => u.parentToolUseId === a.toolUseId);
    const s: SubagentActivity = {
      call: a,
      agent: a.agent as string,
      running: a.status === 'running',
      calls: children,
    };
    const d = duration([a, ...children]);
    if (d !== undefined) s.durationMs = d;
    return s;
  });
  const order = new Map<string, number>();
  const counts: { tool: string; count: number }[] = [];
  const tally = (u: ToolUsePart) => {
    const name = u.title.split(':')[0].trim() || u.tool;
    const at = order.get(name);
    if (at === undefined) {
      order.set(name, counts.length);
      counts.push({ tool: name, count: 1 });
    } else counts[at].count++;
  };
  for (const u of uses) if (!agentIds.has(u.toolUseId)) tally(u);
  const group: ToolGroup = {
    kind: 'toolGroup',
    calls,
    subagents,
    counts,
    results,
  };
  const total = duration(uses);
  if (total !== undefined) group.durationMs = total;
  return group;
}

/** Consecutive tool parts form one group; any other part splits groups. */
export function groupParts(parts: MessagePart[]): PartSegment[] {
  const out: PartSegment[] = [];
  let uses: ToolUsePart[] = [];
  let res: ToolResultPart[] = [];
  let open = false;
  const flush = () => {
    if (open && uses.length) out.push(buildGroup(uses, res));
    uses = [];
    res = [];
    open = false;
  };
  for (const p of parts) {
    if (p.kind === 'toolUse') {
      uses.push(p);
      open = true;
    } else if (p.kind === 'toolResult') {
      res.push(p);
      open = true;
    } else {
      flush();
      out.push(p);
    }
  }
  flush();
  return out;
}

const FIXED: Record<string, string> = {
  scout: '#7ab8ff',
  implementer: '#ff9d5c',
};

const PALETTE = ['#c48bff', '#4ade9a', '#5cd9f2', '#ffc94d', '#ff5d8f'];

export function agentColor(name: string): string {
  const fixed = FIXED[name];
  if (fixed) return fixed;
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}
