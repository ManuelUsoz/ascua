import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UsageEntry } from '@ascua/chat';
import { JsonUsageLedger } from './json-usage-ledger';

const entry = (
  sessionId: string,
  projectId: string,
  input: number,
  costUsd: number,
): UsageEntry => ({
  sessionId,
  projectId,
  provider: 'claude',
  messageId: `m-${sessionId}-${input}`,
  at: 10,
  usage: {
    inputTokens: input,
    outputTokens: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd,
  },
});

describe('JsonUsageLedger', () => {
  let dir: string;
  const make = () => new JsonUsageLedger(join(dir, 'usage'));

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ascua-usage-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('totals by session and by project, persisted', async () => {
    const ledger = make();
    await ledger.record(entry('s1', 'p1', 10, 0.5));
    await ledger.record(entry('s1', 'p1', 5, 0.25));
    await ledger.record(entry('s2', 'p1', 1, 1));
    await ledger.record(entry('s3', 'p2', 100, 9));
    const fresh = make();
    const session = await fresh.totals({ projectId: 'p1', sessionId: 's1' });
    expect(session.turns).toBe(2);
    expect(session.usage.inputTokens).toBe(15);
    expect(session.usage.costUsd).toBeCloseTo(0.75);
    const project = await fresh.totals({ projectId: 'p1' });
    expect(project.turns).toBe(3);
    expect(project.usage.inputTokens).toBe(16);
    expect(await fresh.entries({ projectId: 'p1', since: 11 })).toEqual([]);
  });

  it('refuses a projectId with path segments', async () => {
    await expect(make().record(entry('s', '..', 1, 1))).rejects.toThrow();
  });
});
