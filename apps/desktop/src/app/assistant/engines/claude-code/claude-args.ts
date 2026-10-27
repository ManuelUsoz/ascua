export const MCP_SERVER = 'ascua';
export const MCP_PREFIX = `mcp__${MCP_SERVER}__`;

export interface ClaudeArgsInput {
  /** Path to the generated mcp.json. */
  mcpConfig: string;
  /** Persona text, passed inline: claude 2.1.310 has no *-file variant. */
  persona: string;
  /**
   * Every registry tool name. All are allowed at CLI level because
   * `--permission-prompts none` would deny the rest; the registry's
   * Confirmer is the only gate for write tools.
   */
  tools: string[];
  resume?: string;
}

/**
 * Never `--bare`: it would drop the user's subscription login. The engine
 * also sets ENABLE_CLAUDEAI_MCP_SERVERS=false in the spawn env, since
 * --strict-mcp-config alone still loads the user's claude.ai connectors.
 */
export function claudeArgs(input: ClaudeArgsInput): string[] {
  const allowed = input.tools.map((t) => MCP_PREFIX + t);
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    // No Bash/code tools; user/project/local settings (and so the user's own
    // Ascua hook) are ignored.
    '--restricted',
    '--strict-mcp-config',
    // No built-in tools at all (WebSearch stays off until a real Confirmer
    // exists); only the ascua MCP tools remain.
    '--tools',
    '',
    '--mcp-config',
    input.mcpConfig,
    '--append-system-prompt',
    input.persona,
    '--allowedTools',
    allowed.join(','),
    '--permission-prompts',
    'none',
  ];
  if (input.resume) args.push('--resume', input.resume);
  return args;
}
