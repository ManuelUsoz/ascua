import { describe, expect, it, vi } from 'vitest';
import type { AgentProvider, AgentProviderId, ProviderAuth } from '@ascua/chat';
import { ProviderRegistry } from './provider-registry';

const provider = (auth: ProviderAuth): AgentProvider =>
  ({
    descriptor: { id: 'claude', enabled: true },
    authStatus: async () => auth,
    loginCommand: () => undefined,
    open: vi.fn(),
  }) as unknown as AgentProvider;

const setup = (auth: ProviderAuth) => {
  let chatProvider: AgentProviderId | undefined;
  const settings = {
    get: async () => ({ chatProvider }),
    update: async (p: { chatProvider?: AgentProviderId }) => {
      chatProvider = p.chatProvider;
    },
  };
  return new ProviderRegistry({
    providers: { claude: provider(auth) },
    settings,
  });
};

describe('ProviderRegistry', () => {
  it('lists claude enabled, others disabled', async () => {
    const list = await setup({ provider: 'claude', state: 'loggedIn' }).list();
    expect(list.find((p) => p.id === 'claude')?.enabled).toBe(true);
    expect(list.find((p) => p.id === 'codex')?.enabled).toBe(false);
  });

  it('refuses a disabled provider', async () => {
    await expect(
      setup({ provider: 'claude', state: 'loggedIn' }).select('codex'),
    ).rejects.toMatchObject({ kind: 'providerDisabled' });
  });

  it('refuses select without login', async () => {
    await expect(
      setup({ provider: 'claude', state: 'loggedOut' }).select('claude'),
    ).rejects.toMatchObject({ kind: 'authRequired' });
  });

  it('persists the selection', async () => {
    const reg = setup({ provider: 'claude', state: 'loggedIn' });
    await expect(reg.current()).rejects.toMatchObject({
      kind: 'providerNotConfigured',
    });
    await reg.select('claude');
    expect((await reg.list()).find((p) => p.selected)?.id).toBe('claude');
    await expect(reg.current()).resolves.toBeDefined();
  });
});
