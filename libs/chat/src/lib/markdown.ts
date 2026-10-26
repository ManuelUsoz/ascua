/** Small dependency-free markdown parser. Emits tokens only, never HTML. */

export type MdInline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: MdInline[] }
  | { kind: 'em'; children: MdInline[] }
  | { kind: 'link'; href: string; label: MdInline[] };

export type MdBlock =
  | { kind: 'paragraph'; inlines: MdInline[] }
  | { kind: 'heading'; level: number; inlines: MdInline[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'list'; ordered: boolean; items: MdInline[][] }
  | { kind: 'quote'; inlines: MdInline[] }
  | { kind: 'table'; head: MdInline[][]; rows: MdInline[][][] }
  | { kind: 'rule' };

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !isClosing(lines[i], marker))
        body.push(lines[i++]);
      i++;
      blocks.push({ kind: 'code', lang: fence[2], text: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length,
        inlines: parseInline(heading[2]),
      });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]))
        body.push(QUOTE.exec(lines[i++])![1]);
      blocks.push({ kind: 'quote', inlines: parseInline(body.join('\n')) });
      continue;
    }
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      TABLE_SEP.test(lines[i + 1]) &&
      lines[i + 1].includes('-')
    ) {
      const head = splitRow(line).map(parseInline);
      i += 2;
      const rows: MdInline[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitRow(lines[i++]).map(parseInline));
      }
      blocks.push({ kind: 'table', head, rows });
      continue;
    }
    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      const re = ordered ? ORDERED : BULLET;
      const items: MdInline[][] = [];
      while (i < lines.length) {
        const m = re.exec(lines[i]);
        if (m) {
          items.push(parseInline(m[1]));
          i++;
        } else if (
          items.length &&
          /^\s{2,}\S/.test(lines[i]) &&
          !ORDERED.test(lines[i]) &&
          !BULLET.test(lines[i])
        ) {
          items[items.length - 1].push(
            { kind: 'text', text: ' ' },
            ...parseInline(lines[i].trim()),
          );
          i++;
        } else break;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]))
      para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    blocks.push({ kind: 'paragraph', inlines: parseInline(para.join('\n')) });
  }
  return blocks;
}

function isClosing(line: string, marker: string): boolean {
  const t = line.trim();
  return t.length >= marker.length && t === marker[0].repeat(t.length);
}

function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line)
  );
}

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

function safeHref(href: string): string | null {
  try {
    const p = new URL(href).protocol;
    return p === 'https:' || p === 'http:' || p === 'mailto:' ? href : null;
  } catch {
    return null;
  }
}

function push(out: MdInline[], text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last?.kind === 'text') last.text += text;
  else out.push({ kind: 'text', text });
}

export function parseInline(src: string): MdInline[] {
  const out: MdInline[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (
      c === '\\' &&
      i + 1 < src.length &&
      /[\\`*_[\]()#|~>-]/.test(src[i + 1])
    ) {
      push(out, src[i + 1]);
      i += 2;
      continue;
    }
    if (c === '`') {
      let n = 1;
      while (src[i + n] === '`') n++;
      const ticks = '`'.repeat(n);
      const end = src.indexOf(ticks, i + n);
      if (end > 0) {
        out.push({
          kind: 'code',
          text: src.slice(i + n, end).replace(/^ (.*) $/s, '$1'),
        });
        i = end + n;
        continue;
      }
      push(out, ticks);
      i += n;
      continue;
    }
    if (c === '*' || c === '_') {
      const dbl = src[i + 1] === c;
      const mark = dbl ? c + c : c;
      const end = findClose(src, mark, i + mark.length);
      if (
        end > 0 &&
        src[i + mark.length] !== ' ' &&
        (c === '*' || isBoundary(src, i, end + mark.length))
      ) {
        const children = parseInline(src.slice(i + mark.length, end));
        out.push({ kind: dbl ? 'strong' : 'em', children });
        i = end + mark.length;
        continue;
      }
      push(out, c);
      i++;
      continue;
    }
    if (c === '[') {
      const m = /^\[([^\]]*)\]\(([^)\s]*)\)/.exec(src.slice(i));
      if (m) {
        const href = safeHref(m[2]);
        const label = parseInline(m[1]);
        if (href) out.push({ kind: 'link', href, label });
        else out.push(...label);
        i += m[0].length;
        continue;
      }
    }
    if (c === 'h' && /^https?:\/\//.test(src.slice(i, i + 8))) {
      const m = /^https?:\/\/[^\s<>)\]]+[^\s<>)\].,;:!?'"]/.exec(src.slice(i));
      if (m && safeHref(m[0])) {
        out.push({
          kind: 'link',
          href: m[0],
          label: [{ kind: 'text', text: m[0] }],
        });
        i += m[0].length;
        continue;
      }
    }
    push(out, c);
    i++;
  }
  return out;
}

function findClose(src: string, mark: string, from: number): number {
  let i = from;
  while (i < src.length) {
    if (src[i] === '\\') i += 2;
    else if (src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      i = end < 0 ? i + 1 : end + 1;
    } else if (src.startsWith(mark, i) && i > from && src[i - 1] !== ' ')
      return i;
    else i++;
  }
  return -1;
}

function isBoundary(src: string, start: number, end: number): boolean {
  return !/\w/.test(src[start - 1] ?? '') && !/\w/.test(src[end] ?? '');
}
