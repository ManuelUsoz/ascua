import type { ToolDefinition } from './tool';

/** Tool names are `<id>_<name>`; valid for both MCP and the Anthropic tool API. */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export interface Capability {
  id: string;
  tools: ToolDefinition[];
}
