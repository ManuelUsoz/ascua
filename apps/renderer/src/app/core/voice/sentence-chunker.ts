const MAX_SENTENCE = 240;
const ABBREVIATIONS = new Set([
  'sr',
  'sra',
  'srta',
  'dr',
  'dra',
  'etc',
  'vs',
  'ej',
  'p',
  'e.g',
  'i.e',
  'mr',
  'mrs',
  'ms',
  'prof',
  'núm',
]);
const CLOSERS = '"\')]»”’*_';

function isAbbreviation(text: string, dot: number): boolean {
  let start = dot;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  const token = text.slice(start, dot).toLowerCase();
  return ABBREVIATIONS.has(token);
}

function split(
  text: string,
  final: boolean,
): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    let cut = -1;
    if (c === '\n' && text[i + 1] === '\n') {
      cut = i + 2;
    } else if (c === '.' || c === '!' || c === '?' || c === '…') {
      let j = i + 1;
      while (j < text.length && CLOSERS.includes(text[j])) j++;
      if (j >= text.length) break;
      if (/\s/.test(text[j]) && (c !== '.' || !isAbbreviation(text, i))) {
        cut = j;
      }
    }
    if (cut > 0) {
      sentences.push(text.slice(from, cut));
      from = cut;
      i = cut - 1;
    }
  }
  const rest = text.slice(from);
  if (final) {
    if (rest.trim()) sentences.push(rest);
    return { sentences, rest: '' };
  }
  return { sentences, rest };
}

function clean(raw: string): string {
  return raw
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function limit(sentence: string): string[] {
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > MAX_SENTENCE) {
    const window = rest.slice(0, MAX_SENTENCE);
    let at = window.lastIndexOf(',');
    if (at < 1) at = window.lastIndexOf(' ');
    if (at < 1) at = MAX_SENTENCE - 1;
    out.push(rest.slice(0, at + 1).trim());
    rest = rest.slice(at + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function finish(raw: string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const text = clean(r);
    if (!text) continue;
    for (const piece of limit(text)) {
      if ((piece.match(/\p{L}/gu) ?? []).length >= 2) out.push(piece);
    }
  }
  return out;
}

/** Turns streamed text deltas into sentences a TTS engine can speak. */
export class SentenceChunker {
  private buf = '';
  private inFence = false;

  push(delta: string): string[] {
    this.buf += delta.replace(/\r\n/g, '\n');
    return finish(this.drain(false));
  }

  flush(): string[] {
    const out = finish(this.drain(true));
    this.inFence = false;
    this.buf = '';
    return out;
  }

  private drain(final: boolean): string[] {
    const out: string[] = [];
    for (;;) {
      const idx = this.buf.indexOf('```');
      if (this.inFence) {
        if (idx < 0) {
          this.buf = final ? '' : (this.buf.match(/`{1,2}$/)?.[0] ?? '');
          break;
        }
        this.buf = this.buf.slice(idx + 3);
        this.inFence = false;
        continue;
      }
      if (idx >= 0) {
        const head = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + 3);
        this.inFence = true;
        out.push(...split(head, true).sentences);
        continue;
      }
      const tail = final ? '' : (this.buf.match(/`{1,2}$/)?.[0] ?? '');
      const text = this.buf.slice(0, this.buf.length - tail.length);
      const r = split(text, final);
      out.push(...r.sentences);
      this.buf = r.rest + tail;
      break;
    }
    return out;
  }
}
