import {
  ChatError,
  type ChatModeId,
  type HarnessContext,
  type HarnessMode,
  type TurnSetup,
} from '@ascua/chat';

/** Plug-in point for the nxy core modes later. */
export class HarnessHost {
  private readonly modes = new Map<ChatModeId, HarnessMode>();

  constructor(modes: HarnessMode[]) {
    for (const m of modes) this.modes.set(m.id, m);
  }

  setup(modeId: ChatModeId, ctx: HarnessContext): Promise<TurnSetup> {
    const mode = this.modes.get(modeId);
    if (!mode) return Promise.reject(new ChatError('unknown'));
    return mode.setup(ctx);
  }
}
