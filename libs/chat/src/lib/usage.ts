import type { AgentProviderId } from './provider';

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd?: number;
  model?: string;
}

export const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
};

/** Costs are summed only when both sides know them. */
export function addUsage(a: Usage, b: Usage): Usage {
  const sum: Usage = {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
  if (a.costUsd !== undefined && b.costUsd !== undefined) {
    sum.costUsd = a.costUsd + b.costUsd;
  }
  const model = b.model ?? a.model;
  if (model !== undefined) sum.model = model;
  return sum;
}

export interface UsageEntry {
  sessionId: string;
  projectId: string;
  provider: AgentProviderId;
  messageId: string;
  at: number;
  usage: Usage;
}

export interface UsageQuery {
  projectId?: string;
  sessionId?: string;
  provider?: AgentProviderId;
  since?: number;
}

export interface UsageTotals {
  usage: Usage;
  turns: number;
}
