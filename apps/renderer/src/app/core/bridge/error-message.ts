const IPC_PREFIX = /^Error invoking remote method '[^']*': (?:Error: )?/;

/** Readable text of a failed bridge call, without Electron's IPC wrapper. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(IPC_PREFIX, '');
}
