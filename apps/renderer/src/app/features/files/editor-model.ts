export type EditorLanguage = 'typescript' | 'javascript' | 'json' | 'html' | 'css' | 'markdown';

const BY_EXT: Readonly<Record<string, EditorLanguage>> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  md: 'markdown',
  markdown: 'markdown',
};

export function languageFor(path: string): EditorLanguage | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  if (dot < 0) return undefined;
  return BY_EXT[name.slice(dot + 1).toLowerCase()];
}

/** CRLF when the first line break is CRLF, else LF. */
export function lineSeparatorFor(text: string): '\r\n' | '\n' {
  const i = text.indexOf('\n');
  return i > 0 && text[i - 1] === '\r' ? '\r\n' : '\n';
}
