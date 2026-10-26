import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const RENAME_RETRIES = 5;
const RENAME_DELAY_MS = 40;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Writes `text` through a temp file and a rename (retried on Windows). */
export async function writeTextAtomic(
  file: string,
  text: string,
): Promise<void> {
  const tmp = `${file}.tmp`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(tmp, text, 'utf8');
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retry =
        process.platform === 'win32' &&
        (code === 'EPERM' || code === 'EBUSY') &&
        attempt < RENAME_RETRIES;
      if (!retry) throw error;
      await sleep(RENAME_DELAY_MS);
    }
  }
}

/** Writes `data` as JSON through a temp file and a rename (retried on Windows). */
export function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  return writeTextAtomic(file, JSON.stringify(data, null, 2));
}
