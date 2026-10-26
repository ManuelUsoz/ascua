export interface NoteHeading {
  level: number;
  text: string;
  slug: string;
}

export interface WikiLink {
  /** Target note name. */
  note: string;
  heading?: string;
  label?: string;
}

export interface NoteOutline {
  headings: NoteHeading[];
  links: WikiLink[];
}

/** Case-insensitive comparison key of a note name. */
export function noteKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * GitHub-style slug: lowercase, punctuation stripped, spaces to `-`. With
 * `seen`, repeated slugs get `-1`, `-2`... (one map per document).
 */
export function headingSlug(text: string, seen?: Map<string, number>): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
  if (!seen) return base;
  const count = seen.get(base);
  if (count === undefined) {
    seen.set(base, 0);
    return base;
  }
  const next = count + 1;
  seen.set(base, next);
  return `${base}-${next}`;
}

/** `Nota#Encabezado|alias` -> parts. Empty parts are omitted. */
export function parseWikiLink(inner: string): WikiLink {
  let rest = inner;
  let label: string | undefined;
  const pipe = rest.indexOf('|');
  if (pipe >= 0) {
    label = rest.slice(pipe + 1).trim() || undefined;
    rest = rest.slice(0, pipe);
  }
  let heading: string | undefined;
  const hash = rest.indexOf('#');
  if (hash >= 0) {
    heading = rest.slice(hash + 1).trim() || undefined;
    rest = rest.slice(0, hash);
  }
  const link: WikiLink = { note: rest.trim() };
  if (heading !== undefined) link.heading = heading;
  if (label !== undefined) link.label = label;
  return link;
}

/**
 * Line scanner for fenced code: feed it every line in order; it returns true
 * for fence delimiters and lines inside a fence.
 */
function fenceScanner(): (line: string) => boolean {
  let fence: { char: string; len: number } | undefined;
  return (line) => {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.len) {
        fence = undefined;
      }
      return true;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (open) {
      fence = { char: open[1][0], len: open[1].length };
      return true;
    }
    return false;
  };
}

/**
 * Rewrites every `[[from...]]` link to point at `to`, keeping `#heading` and
 * `|alias` and the original line endings. Fenced and inline code are left
 * alone. `count` is the number of links that changed.
 */
export function renameNoteLinks(
  text: string,
  from: string,
  to: string,
): { text: string; count: number } {
  const fromKey = noteKey(from);
  const inFence = fenceScanner();
  let count = 0;
  // Odd indexes are the separators ("\n" / "\r\n"), kept as they were.
  const parts = text.split(/(\r?\n)/);
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i];
    if (inFence(line)) continue;
    parts[i] = line.replace(
      /(`+).*?\1|\[\[([^[\]\n]+?)\]\]/g,
      (match: string, _ticks: string, inner: string | undefined) => {
        if (inner === undefined) return match;
        const note = parseWikiLink(inner).note;
        if (!note || noteKey(note) !== fromKey) return match;
        const pipe = inner.indexOf('|');
        const hash = (pipe >= 0 ? inner.slice(0, pipe) : inner).indexOf('#');
        const end = hash >= 0 ? hash : pipe >= 0 ? pipe : inner.length;
        const next = `[[${to}${inner.slice(end)}]]`;
        if (next === match) return match;
        count++;
        return next;
      },
    );
  }
  return { text: parts.join(''), count };
}

/** Headings and `[[links]]` of a note, ignoring fenced and inline code. */
export function parseOutline(text: string): NoteOutline {
  const headings: NoteHeading[] = [];
  const links: WikiLink[] = [];
  const seen = new Map<string, number>();
  const inFence = fenceScanner();

  for (const line of text.split(/\r?\n/)) {
    if (inFence(line)) continue;

    const h = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (h) {
      const heading = h[2].trim();
      if (heading) {
        headings.push({
          level: h[1].length,
          text: heading,
          slug: headingSlug(heading, seen),
        });
      }
    }

    const plain = line.replace(/(`+).*?\1/g, '');
    for (const m of plain.matchAll(/\[\[([^[\]\n]+?)\]\]/g)) {
      const link = parseWikiLink(m[1]);
      if (link.note) links.push(link);
    }
  }
  return { headings, links };
}
