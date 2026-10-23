import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

/** CodeMirror look, built only from tokens.css variables (12px/18px like `.v9-code`). */
const theme = EditorView.theme(
  {
    '&': {
      height: '100%',
      color: 'var(--ink)',
      backgroundColor: 'var(--surface-sunken)',
      fontSize: '12px',
    },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '18px', overflow: 'auto' },
    '.cm-content': { caretColor: 'var(--oro)', padding: '12px 0' },
    '.cm-line': { padding: '0 14px 0 4px' },
    '&.cm-focused .cm-cursor, .cm-cursor': { borderLeftColor: 'var(--oro)' },
    '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection':
      { backgroundColor: 'var(--violeta-wash)' },
    '.cm-activeLine': { backgroundColor: 'var(--violeta-wash)' },
    '.cm-gutters': {
      backgroundColor: 'var(--surface-sunken)',
      color: 'var(--ink-faint)',
      border: 'none',
    },
    '.cm-gutterElement': { padding: '0 10px 0 14px' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink)' },
    '.cm-matchingBracket': { color: 'var(--oro)', outline: '1px solid var(--violeta)' },
    '.cm-panels': { backgroundColor: 'var(--surface-sunken)', color: 'var(--ink)' },
    '.cm-searchMatch': { backgroundColor: 'var(--violeta-wash)' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: 'var(--violeta)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--ok)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--oro)' },
  { tag: [t.comment, t.meta], color: 'var(--ink-faint)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.propertyName, t.attributeName], color: 'var(--ask)' },
  { tag: [t.typeName, t.className, t.tagName], color: 'var(--oro)' },
  { tag: [t.heading, t.strong], color: 'var(--ink)', fontWeight: '600' },
  { tag: [t.link, t.url], color: 'var(--ask)' },
  { tag: t.invalid, color: 'var(--alert)' },
]);

export const editorTheme: Extension = [theme, syntaxHighlighting(highlight)];
