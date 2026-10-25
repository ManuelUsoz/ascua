import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Url of the remote named origin in `<dir>/.git/config`, or undefined. */
export async function readOriginUrl(dir: string): Promise<string | undefined> {
  try {
    const text = await readFile(join(dir, '.git', 'config'), 'utf8');
    let inOrigin = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      const section = /^\[\s*([^\s\]]+)(?:\s+"([^"]*)")?\s*\]$/.exec(line);
      if (section) {
        inOrigin =
          section[1].toLowerCase() === 'remote' && section[2] === 'origin';
        continue;
      }
      if (!inOrigin) continue;
      const url = /^url\s*=\s*(.+)$/i.exec(line);
      if (url) return url[1].trim();
    }
  } catch {
    // Not a repository or unreadable.
  }
  return undefined;
}

/** True when `url` points at `host/<fullName>` over https, scp-like or ssh. */
export function remoteMatches(
  url: string,
  fullName: string,
  host: string,
): boolean {
  const clean = (value: string) =>
    value
      .trim()
      .replace(/\/+$/, '')
      .replace(/\.git$/i, '')
      .replace(/^\/+/, '')
      .toLowerCase();
  const wantedHost = host.toLowerCase();
  const wantedName = clean(fullName);
  const value = url.trim();
  let urlHost: string;
  let path: string;
  const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(value);
  if (scp) {
    urlHost = scp[1];
    path = scp[2];
  } else {
    try {
      const parsed = new URL(value);
      if (!['https:', 'http:', 'ssh:'].includes(parsed.protocol)) return false;
      urlHost = parsed.hostname;
      path = decodeURIComponent(parsed.pathname);
    } catch {
      return false;
    }
  }
  return urlHost.toLowerCase() === wantedHost && clean(path) === wantedName;
}
