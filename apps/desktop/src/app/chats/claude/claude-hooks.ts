import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type {
  GateVerdict,
  HarnessGate,
  SessionTrace,
  ToolKind,
} from '@ascua/chat';

type Hooks = NonNullable<Options['hooks']>;

/** Runs the gates of one phase; a gate that throws fails open. */
function verdict(
  gates: HarnessGate[],
  run: (g: HarnessGate) => GateVerdict,
): { reason: string } | undefined {
  for (const g of gates) {
    try {
      const v = run(g);
      if ('reason' in v) return { reason: v.reason };
    } catch {
      // fail open
    }
  }
  return undefined;
}

/**
 * Maps harness gates to in-memory Claude Agent SDK hooks. Nothing is written
 * to disk. `kindOf` resolves a Claude tool name to a chat tool kind.
 */
export function toSdkHooks(
  gates: HarnessGate[],
  trace: SessionTrace,
  kindOf: (toolName: string) => ToolKind | undefined = () => undefined,
): Hooks {
  const before = gates.filter((g) => g.on === 'beforeTool');
  const stop = gates.filter((g) => g.on === 'beforeStop');
  const hooks: Hooks = {
    PostToolUse: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name === 'PostToolUse') {
              trace.record(input.tool_name);
            }
            return {};
          },
        ],
      },
    ],
  };
  if (before.length) {
    hooks.PreToolUse = [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name !== 'PreToolUse') return {};
            const denied = verdict(before, (g) =>
              g.check({
                kind: kindOf(input.tool_name),
                toolName: input.tool_name,
                input: input.tool_input,
                trace,
              }),
            );
            if (!denied) return {};
            return {
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: denied.reason,
              },
            };
          },
        ],
      },
    ];
  }
  if (stop.length) {
    hooks.Stop = [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name !== 'Stop') return {};
            // Already continued once because of a block: let it stop.
            if (input.stop_hook_active) return {};
            const blocked = verdict(stop, (g) =>
              g.check({ toolName: '', input: undefined, trace }),
            );
            return blocked ? { decision: 'block', reason: blocked.reason } : {};
          },
        ],
      },
    ];
  }
  return hooks;
}
