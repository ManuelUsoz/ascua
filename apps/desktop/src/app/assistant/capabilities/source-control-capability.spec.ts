import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '@ascua/assistant';
import { sourceControlCapability } from './source-control-capability';

const ctx = { signal: new AbortController().signal };

function setup() {
  const service = {
    status: vi.fn(async () => ({
      provider: 'github' as const,
      state: 'connected' as const,
      account: {
        provider: 'github' as const,
        id: '1',
        login: 'mati',
        webUrl: 'u',
      },
      persisted: true,
    })),
    listRepositories: vi.fn(async () => ({ items: [] })),
    listPullRequests: vi.fn(async () => ({ items: [] })),
    listBranches: vi.fn(async () => ({ items: [] })),
    listCommits: vi.fn(async () => ({ items: [] })),
    getPullRequestDiff: vi.fn(async () => ({
      files: [
        {
          path: 'a',
          status: 'modified' as const,
          additions: 1,
          deletions: 0,
          patch: 'a'.repeat(50_000),
        },
        {
          path: 'b',
          status: 'modified' as const,
          additions: 1,
          deletions: 0,
          patch: 'b'.repeat(50_000),
        },
        { path: 'c', status: 'added' as const, additions: 1, deletions: 0 },
      ],
      truncated: false,
    })),
  };
  const registry = new ToolRegistry([sourceControlCapability(service)], {
    confirm: async () => false,
  });
  return { service, registry };
}

describe('sourceControlCapability', () => {
  it('exposes only read tools', () => {
    const { registry } = setup();
    expect(registry.list().map((t) => t.name)).toEqual([
      'source_control_status',
      'source_control_repositories',
      'source_control_pull_requests',
      'source_control_branches',
      'source_control_commits',
      'source_control_pull_request_diff',
    ]);
    expect(registry.list().every((t) => t.effect === 'read')).toBe(true);
  });

  it('defaults the provider to github and forwards queries', async () => {
    const { service, registry } = setup();
    await registry.call(
      'source_control_pull_requests',
      { repoId: 'o/r', state: 'open' },
      ctx,
    );
    expect(service.listPullRequests).toHaveBeenCalledWith('github', 'o/r', {
      state: 'open',
      branch: undefined,
      cursor: undefined,
    });
  });

  it('status returns only the login, no credential', async () => {
    const { registry } = setup();
    const r = await registry.call('source_control_status', {}, ctx);
    expect(r).toEqual({
      ok: true,
      value: { state: 'connected', account: 'mati' },
    });
    expect(JSON.stringify(r)).not.toMatch(/token/i);
  });

  it('caps patches at 60k chars in total and flags truncation', async () => {
    const { registry } = setup();
    const r = await registry.call(
      'source_control_pull_request_diff',
      { repoId: 'o/r', number: 3 },
      ctx,
    );
    const value = (
      r as { value: { files: { patch?: string }[]; truncated: boolean } }
    ).value;
    expect(value.truncated).toBe(true);
    expect(value.files[0].patch).toHaveLength(50_000);
    expect(value.files[1].patch).toHaveLength(10_000);
    expect(value.files[2].patch).toBeUndefined();
  });
});
