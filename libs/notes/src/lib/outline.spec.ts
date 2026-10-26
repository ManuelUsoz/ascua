import { describe, expect, it } from 'vitest';
import {
  headingSlug,
  noteKey,
  parseOutline,
  parseWikiLink,
  renameNoteLinks,
} from './outline';

describe('headingSlug', () => {
  it('lowercases, strips punctuation and dashes spaces', () => {
    expect(headingSlug('Hello, World!')).toBe('hello-world');
    expect(headingSlug('Ñandú útil')).toBe('ñandú-útil');
  });

  it('suffixes duplicates', () => {
    const seen = new Map<string, number>();
    expect(headingSlug('Idea', seen)).toBe('idea');
    expect(headingSlug('Idea', seen)).toBe('idea-1');
    expect(headingSlug('Idea', seen)).toBe('idea-2');
  });
});

describe('parseWikiLink', () => {
  it('parses note, heading and alias', () => {
    expect(parseWikiLink('Nota')).toEqual({ note: 'Nota' });
    expect(parseWikiLink('Nota#Intro')).toEqual({
      note: 'Nota',
      heading: 'Intro',
    });
    expect(parseWikiLink('Nota#Intro|ver')).toEqual({
      note: 'Nota',
      heading: 'Intro',
      label: 'ver',
    });
    expect(parseWikiLink('Nota|ver')).toEqual({ note: 'Nota', label: 'ver' });
  });
});

describe('parseOutline', () => {
  it('lists headings with unique slugs and links', () => {
    const out = parseOutline(
      '# Título\n\ntexto [[Otra#Parte]] y [[Sola]]\n\n## Idea\n## Idea ##\n',
    );
    expect(out.headings).toEqual([
      { level: 1, text: 'Título', slug: 'título' },
      { level: 2, text: 'Idea', slug: 'idea' },
      { level: 2, text: 'Idea', slug: 'idea-1' },
    ]);
    expect(out.links).toEqual([
      { note: 'Otra', heading: 'Parte' },
      { note: 'Sola' },
    ]);
  });

  it('ignores fenced and inline code', () => {
    const out = parseOutline(
      '```\n# no\n[[no]]\n```\n`[[tampoco]]` [[si]]\n~~~md\n# no\n~~~\n# yes\n',
    );
    expect(out.headings.map((h) => h.text)).toEqual(['yes']);
    expect(out.links).toEqual([{ note: 'si' }]);
  });
});

describe('noteKey', () => {
  it('is case-insensitive', () => {
    expect(noteKey(' Ideas ')).toBe(noteKey('ideas'));
  });
});

describe('renameNoteLinks', () => {
  it('rewrites the note part keeping heading and alias', () => {
    const src = '[[Viejo]] [[viejo#H]] [[Viejo#H|alias]] [[Viejo|alias]]';
    expect(renameNoteLinks(src, 'Viejo', 'Nuevo')).toEqual({
      text: '[[Nuevo]] [[Nuevo#H]] [[Nuevo#H|alias]] [[Nuevo|alias]]',
      count: 4,
    });
  });

  it('leaves other links and same-note anchors alone', () => {
    const src = '[[#H]] [[Otra]] [[Otra#Viejo|Viejo]]';
    expect(renameNoteLinks(src, 'Viejo', 'Nuevo')).toEqual({
      text: src,
      count: 0,
    });
  });

  it('ignores fenced and inline code', () => {
    const src =
      '```\n[[Viejo]]\n```\n~~~\n[[Viejo]]\n~~~\n`[[Viejo]]` [[Viejo]]\n';
    expect(renameNoteLinks(src, 'Viejo', 'Nuevo')).toEqual({
      text: '```\n[[Viejo]]\n```\n~~~\n[[Viejo]]\n~~~\n`[[Viejo]]` [[Nuevo]]\n',
      count: 1,
    });
  });

  it('preserves CRLF line endings', () => {
    const src = '[[Viejo]]\r\ntexto\r\n[[Viejo]]\n';
    expect(renameNoteLinks(src, 'Viejo', 'N')).toEqual({
      text: '[[N]]\r\ntexto\r\n[[N]]\n',
      count: 2,
    });
  });

  it('handles case-only renames', () => {
    expect(renameNoteLinks('[[ideas]] [[Ideas]]', 'ideas', 'Ideas')).toEqual({
      text: '[[Ideas]] [[Ideas]]',
      count: 1,
    });
  });
});
