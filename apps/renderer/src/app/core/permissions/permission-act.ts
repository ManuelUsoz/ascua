import type { Need } from '@ascua/character';
import type { PermissionRequest } from '@ascua/ipc';

/** Commands that deserve a warning look before you approve them. */
const DESTRUCTIVE =
  /\brm\s+-\w*[rf]|--force\b|\bpush\s+-f\b|\breset\s+--hard\b|\bdel\s+\/[sq]\b|\bRemove-Item\b.*-Recurse|\bdrop\s+(table|database)\b|\bmkfs\b|\bdd\s+if=/i;

/** The face Ascua makes for a Claude Code permission request. */
export function actFor(request: PermissionRequest): Need {
  if (request.tool === 'AskUserQuestion') return 'ask';
  return DESTRUCTIVE.test(request.summary) ? 'warn' : 'alert';
}
