import type { Methodology, SessionTraceView } from './harness';

export const METHODOLOGY_START = '<!-- ascua:methodology -->';
export const METHODOLOGY_END = '<!-- /ascua:methodology -->';

/** Renders the managed methodology block, followed by the mode's own text. */
export function composeSystemAppend(
  methodology: Methodology,
  modeAppend?: string,
): string {
  const lines = [METHODOLOGY_START, `# ${methodology.title}`];
  const rules = methodology.rules.trim();
  if (rules) lines.push('', rules);
  if (methodology.tools.length > 0) {
    lines.push('', '## Tool usage');
    for (const hint of methodology.tools) {
      lines.push(`- ${hint.tool}: ${hint.when}`);
    }
  }
  lines.push(METHODOLOGY_END);
  const block = lines.join('\n');
  const extra = modeAppend?.trim();
  return extra ? `${block}\n\n${extra}` : block;
}

export class SessionTrace implements SessionTraceView {
  private readonly _names: string[] = [];

  get names(): readonly string[] {
    return this._names;
  }

  record(name: string): void {
    this._names.push(name);
  }

  /** True when any recorded tool name matches (substring or regex). */
  used(pattern: string | RegExp): boolean {
    return this._names.some((n) =>
      typeof pattern === 'string' ? n.includes(pattern) : pattern.test(n),
    );
  }
}
