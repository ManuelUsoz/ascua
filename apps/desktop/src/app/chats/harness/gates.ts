import type { GateEvent, GateVerdict, HarnessGate } from '@ascua/chat';

const EDIT_TOOL = /^(Edit|Write|MultiEdit|NotebookEdit)$/;
const LOCATE_TOOL = /^(Read|Grep|Glob)$|^mcp__ascua-indexer__/;
const VERIFY_TOOL = /^(Bash|PowerShell)$/;

const ALLOW: GateVerdict = { allow: true };

/** Deny edits until the session has searched the index or read a file. */
export function locateBeforeEdit(e: GateEvent): GateVerdict {
  if (e.kind !== 'edit' && !EDIT_TOOL.test(e.toolName)) return ALLOW;
  if (e.trace.used(LOCATE_TOOL)) return ALLOW;
  return {
    allow: false,
    // i18n-ignore: model instructions
    reason: `Locate before editing: use the code index search tool (or Read/Grep) to find and read the code you are about to change, then retry ${e.toolName}.`,
  };
}

/** Block stopping when files were edited and no command ran after the last edit. */
export function verifyBeforeStop(e: GateEvent): GateVerdict {
  const names = e.trace.names;
  let lastEdit = -1;
  names.forEach((n, i) => {
    if (EDIT_TOOL.test(n)) lastEdit = i;
  });
  if (lastEdit < 0) return ALLOW;
  if (names.slice(lastEdit + 1).some((n) => VERIFY_TOOL.test(n))) return ALLOW;
  return {
    allow: false,
    // i18n-ignore: model instructions
    reason:
      'You edited files but did not verify. Run the project test, typecheck or build command with Bash, then report the result.',
  };
}

export function builtInGates(): HarnessGate[] {
  return [
    { id: 'locate-before-edit', on: 'beforeTool', check: locateBeforeEdit },
    { id: 'verify-before-stop', on: 'beforeStop', check: verifyBeforeStop },
  ];
}
