import { headingSlug, parseWikiLink, type WikiLink } from '@ascua/notes';
import DOMPurify from 'dompurify';
import { Marked, type Tokens } from 'marked';

/** What the page knows about a link target. */
export interface LinkTarget {
  exists: boolean;
  /** Anchor of the linked heading, when it resolves. */
  slug?: string;
  /** Canonical note name (defaults to the name as written). */
  note?: string;
}

export const HEADING_ID_PREFIX = 'note-h-';

interface WikiLinkToken extends Tokens.Generic {
  type: 'wikiLink';
  link: WikiLink;
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function linkLabel(link: WikiLink): string {
  if (link.label) return link.label;
  if (link.heading) {
    return link.note ? `${link.note} › ${link.heading}` : link.heading;
  }
  return link.note;
}

/**
 * Markdown -> sanitized HTML, with `[[Nota#Encabezado|alias]]` links and an
 * `id="note-h-<slug>"` on each heading. `resolve` says whether a link's note
 * exists and which anchor its heading has. A note name of `''` is the note
 * being rendered (`[[#Encabezado]]`).
 */
export function renderNoteHtml(
  text: string,
  resolve: (link: WikiLink) => LinkTarget,
): string {
  const seen = new Map<string, number>();
  const marked = new Marked({
    extensions: [
      {
        name: 'wikiLink',
        level: 'inline',
        start: (src: string) => {
          const at = src.indexOf('[[');
          return at < 0 ? undefined : at;
        },
        tokenizer(src: string): WikiLinkToken | undefined {
          const match = /^\[\[([^[\]\n]+)\]\]/.exec(src);
          if (!match) return undefined;
          const link = parseWikiLink(match[1]);
          if (!link.note && !link.heading) return undefined;
          return { type: 'wikiLink', raw: match[0], link };
        },
        renderer(token) {
          const { link } = token as WikiLinkToken;
          const target = resolve(link);
          const classes = target.exists
            ? 'as-note-link'
            : 'as-note-link is-missing';
          const note = escapeHtml(target.note ?? link.note);
          const heading = escapeHtml(
            target.slug ?? (link.heading ? headingSlug(link.heading) : ''),
          );
          return `<a class="${classes}" href="#" data-note="${note}" data-heading="${heading}">${escapeHtml(linkLabel(link))}</a>`; // i18n-ignore
        },
      },
    ],
    renderer: {
      heading(token) {
        const slug = headingSlug(token.text, seen);
        const inner = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${HEADING_ID_PREFIX}${escapeHtml(slug)}">${inner}</h${token.depth}>\n`; // i18n-ignore
      },
    },
  });
  const html = marked.parse(text, { async: false });
  // data-* attributes are kept by DOMPurify's default ALLOW_DATA_ATTR.
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form'],
    FORBID_ATTR: ['style'],
  });
}
