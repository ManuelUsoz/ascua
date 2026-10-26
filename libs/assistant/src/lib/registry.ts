import { TOOL_NAME_PATTERN, type Capability } from './capability';
import type { Confirmer } from './confirmation';
import {
  needsConfirmation,
  ToolInputError,
  validateInput,
  type JsonSchema,
  type ToolContext,
  type ToolDefinition,
  type ToolEffect,
} from './tool';

export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  effect: ToolEffect;
  needsConfirmation: boolean;
}

export type ToolOutcome =
  | { ok: true; value: unknown }
  | {
      ok: false;
      error: 'unknownTool' | 'invalidInput' | 'refused' | 'failed';
      /** Model-facing text, not UI. */
      detail?: string;
    };

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(
    capabilities: readonly Capability[],
    private readonly confirmer: Confirmer,
  ) {
    for (const capability of capabilities) {
      if (!TOOL_NAME_PATTERN.test(capability.id)) {
        throw new Error(`invalid capability id: ${capability.id}`); // i18n-ignore
      }
      for (const tool of capability.tools) {
        if (
          !TOOL_NAME_PATTERN.test(tool.name) ||
          !tool.name.startsWith(`${capability.id}_`)
        ) {
          throw new Error(`invalid tool name: ${tool.name}`); // i18n-ignore
        }
        if (this.tools.has(tool.name)) {
          throw new Error(`duplicate tool: ${tool.name}`); // i18n-ignore
        }
        this.tools.set(tool.name, tool);
      }
    }
  }

  list(): RegisteredTool[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      effect: tool.effect,
      needsConfirmation: needsConfirmation(tool),
    }));
  }

  async call(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<ToolOutcome> {
    const tool = this.tools.get(name);
    if (!tool)
      return {
        ok: false,
        error: 'unknownTool',
        detail: `unknown tool "${name}"`,
      }; // i18n-ignore
    const problem = validateInput(tool.inputSchema, input ?? {});
    if (problem) return { ok: false, error: 'invalidInput', detail: problem };
    const args = input ?? {};
    try {
      if (needsConfirmation(tool)) {
        const summary = (await tool.summarize?.(args)) ?? { params: {} };
        const approved = await this.confirmer.confirm(
          {
            tool: name,
            input: args,
            params: summary.params,
            detail: summary.detail,
          },
          ctx.signal,
        );
        if (!approved)
          return { ok: false, error: 'refused', detail: 'the user declined' }; // i18n-ignore
      }
      return { ok: true, value: await tool.run(args, ctx) };
    } catch (error) {
      if (error instanceof ToolInputError) {
        return { ok: false, error: 'invalidInput', detail: error.message };
      }
      const detail = error instanceof Error ? error.message : undefined;
      return { ok: false, error: 'failed', detail };
    }
  }
}
