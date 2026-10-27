import {
  composeSystemAppend,
  searcherAgent,
  type ChatModeId,
  type HarnessContext,
  type HarnessMode,
  type TurnSetup,
} from '@ascua/chat';
import { builtInGates } from './gates';
import type { MethodologyStore } from './methodology-store';

// The systemAppend texts are model instructions, not UI copy.

// i18n-ignore: model instructions
const DELEGATE_SEARCH =
  'For codebase searches, delegate to the `searcher` subagent instead of reading files yourself; it answers with path:line.';

interface ModeSpec {
  id: ChatModeId;
  append?: string;
  deniedTools?: TurnSetup['deniedTools'];
}

const SPECS: ModeSpec[] = [
  { id: 'chat' },
  {
    id: 'locate',
    // i18n-ignore: model instructions
    append:
      'Mode: locate. Find where the requested thing lives in the project and report each place as `path:line` with a one-line note. Do not edit files or run commands that change anything.',
    deniedTools: ['edit', 'execute'],
  },
  {
    id: 'make',
    // i18n-ignore: model instructions
    append:
      'Mode: make. First write a plan split in small batches, each with a way to verify it. Then implement the batches one by one and verify each before moving on. Report what changed and how it was verified.',
  },
  {
    id: 'review',
    // i18n-ignore: model instructions
    append:
      'Mode: review. Review the requested files, changes or pull request. Report findings ordered by severity, each with `path:line` and a concrete suggestion. Do not edit files.',
    deniedTools: ['edit'],
  },
];

/** Every mode, the direct one included, runs under the project methodology and gates. */
export function createNxyModes(store: MethodologyStore): HarnessMode[] {
  return SPECS.map((spec) => ({
    id: spec.id,
    setup: async (ctx: HarnessContext): Promise<TurnSetup> => {
      const methodology = await store.load(ctx.session.projectId);
      const searcher = searcherAgent();
      const canSearch = (ctx.mcpServers ?? []).some((n) =>
        searcher.mcpServers?.includes(n),
      );
      const setup: TurnSetup = {
        systemAppend: composeSystemAppend(
          methodology,
          [spec.append, canSearch ? DELEGATE_SEARCH : undefined]
            .filter(Boolean)
            .join('\n\n'),
        ),
        gates: builtInGates(),
      };
      if (canSearch) setup.agents = [searcher];
      if (spec.deniedTools) setup.deniedTools = spec.deniedTools;
      return setup;
    },
  }));
}
