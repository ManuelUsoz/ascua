import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * Finds a runtime file (.wasm, .scm). The bundle ships them next to main.mjs;
 * from source (dev, tests) they come from `devPaths`: a path relative to this
 * file, or a node_modules specifier.
 */
export const findAsset = (name: string, ...devPaths: string[]): string => {
  const sibling = fileURLToPath(new URL(name, import.meta.url));
  if (existsSync(sibling)) return sibling;
  const require = createRequire(import.meta.url);
  for (const devPath of devPaths) {
    const local = fileURLToPath(new URL(devPath, import.meta.url));
    if (existsSync(local)) return local;
    try {
      return require.resolve(devPath);
    } catch {
      // not a node_modules specifier, try the next one
    }
  }
  throw new Error(`asset not found: ${name}`);
};
