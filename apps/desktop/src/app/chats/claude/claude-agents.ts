import type { AgentDefinition as SdkAgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentDefinition,
  McpServerSpec,
  ToolKind,
} from '@ascua/chat';

/**
 * Maps provider-agnostic subagents to Claude Agent SDK `options.agents`.
 * `mcp__<server>` allows every tool of that server. An agent whose MCP
 * servers are all absent from the turn and that has no tools of its own is
 * dropped: it could not do anything useful.
 */
export function toSdkAgents(
  agents: AgentDefinition[],
  toolNames: Record<ToolKind, string[]>,
  mcp: McpServerSpec[],
): Record<string, SdkAgentDefinition> {
  const present = new Set(mcp.map((s) => s.name));
  const out: Record<string, SdkAgentDefinition> = {};
  for (const a of agents) {
    const servers = (a.mcpServers ?? []).filter((n) => present.has(n));
    const tools = [
      ...a.tools.flatMap((k) => toolNames[k]),
      ...servers.map((n) => `mcp__${n}`),
    ];
    if (!tools.length) continue;
    out[a.role] = {
      description: a.description,
      prompt: a.instructions,
      tools,
      ...(a.model ? { model: a.model } : {}),
    } as SdkAgentDefinition;
  }
  return out;
}
