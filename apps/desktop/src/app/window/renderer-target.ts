import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendererAppName, rendererAppPort } from '../constants';

export type RendererTarget =
  | { kind: 'url'; url: string; query: Record<string, string> }
  | { kind: 'file'; path: string; query: Record<string, string> };

export interface RendererTargetInput {
  packaged: boolean;
  env: Record<string, string | undefined>;
  dir: string;
}

/** Where the renderer is loaded from: the dev server, or the built index. */
export function rendererTarget(input: RendererTargetInput): RendererTarget {
  // Test seam (like ASCUA_RENDERER): scripted phrases for the fake recognizer.
  const fake = input.env['ASCUA_VOICE_FAKE'];
  const query: Record<string, string> = fake ? { voiceFake: fake } : {};
  if (!input.packaged && input.env['ASCUA_RENDERER'] !== 'dist') {
    return {
      kind: 'url',
      url: `http://localhost:${rendererAppPort}`,
      query,
    };
  }
  return {
    kind: 'file',
    path: join(input.dir, '..', rendererAppName, 'index.html'),
    query,
  };
}

/** The URL to hand to `loadURL` for a `url` target (query included). */
export function targetUrl(target: Extract<RendererTarget, { kind: 'url' }>) {
  const qs = new URLSearchParams(target.query).toString();
  return qs ? `${target.url}/?${qs}` : target.url;
}

/** True when `url` is the page of our own renderer (any query or hash). */
export function isOwnRendererUrl(
  url: string | undefined,
  target: RendererTarget,
  platform: NodeJS.Platform,
): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (target.kind === 'url') {
    return parsed.origin === new URL(target.url).origin;
  }
  if (parsed.protocol !== 'file:') return false;
  let path: string;
  try {
    path = resolve(fileURLToPath(parsed));
  } catch {
    return false;
  }
  const own = resolve(target.path);
  return platform === 'win32'
    ? path.toLowerCase() === own.toLowerCase()
    : path === own;
}
