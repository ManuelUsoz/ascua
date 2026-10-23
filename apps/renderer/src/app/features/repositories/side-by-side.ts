export type LnKind = 'ctx' | 'add' | 'del' | 'pad';

export interface Ln {
  n?: number;
  text: string;
  kind: LnKind;
}

export interface Hunk {
  header: string;
  context?: string;
  left: Ln[];
  right: Ln[];
}

const HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;

/** Splits a unified patch into hunks with aligned left/right columns. */
export function toSideBySide(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  let hunk: Hunk | undefined;
  let a = 0;
  let b = 0;
  let dels: Ln[] = [];
  let adds: Ln[] = [];

  const flush = (): void => {
    if (!hunk) return;
    const rows = Math.max(dels.length, adds.length);
    for (let i = 0; i < rows; i++) {
      hunk.left.push(dels[i] ?? { text: '', kind: 'pad' });
      hunk.right.push(adds[i] ?? { text: '', kind: 'pad' });
    }
    dels = [];
    adds = [];
  };

  for (const line of patch.split('\n')) {
    const m = HEADER.exec(line);
    if (m) {
      flush();
      a = Number(m[1]);
      b = Number(m[2]);
      hunk = {
        header: line,
        context: m[3] || undefined,
        left: [],
        right: [],
      };
      hunks.push(hunk);
      continue;
    }
    // '' is only the split remainder after a trailing newline: real context lines start with ' '
    if (!hunk || line === '' || line.startsWith('\\')) continue;
    const text = line.slice(1);
    if (line.startsWith('-')) {
      dels.push({ n: a++, text, kind: 'del' });
    } else if (line.startsWith('+')) {
      adds.push({ n: b++, text, kind: 'add' });
    } else {
      flush();
      hunk.left.push({ n: a++, text, kind: 'ctx' });
      hunk.right.push({ n: b++, text, kind: 'ctx' });
    }
  }
  flush();
  return hunks;
}
