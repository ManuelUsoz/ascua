// i18n regression guard: fails on user-facing literals that bypass the catalogs.
// Regex based on purpose (cheap, low noise), not a parser. Mark legit non-UI
// literals with `// i18n-ignore` (sources) or `<!-- i18n-ignore -->` on the line
// before (templates).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const LETTER = /\p{L}/u;
const blank = (s) => s.replace(/[^\n]/g, ' ');

/** Literal UI text in an Angular template. Returns `{ line, message }[]`. */
export function scanTemplate(text) {
  const src = text.replace(/\r\n/g, '\n');
  const ignored = new Set();
  src.split('\n').forEach((l, i) => {
    if (l.includes('<!-- i18n-ignore -->')) ignored.add(i + 2);
  });
  let s = src
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\{\{[\s\S]*?\}\}/g, blank);
  const found = [];
  const lineOf = (index) => s.slice(0, index).split('\n').length;

  // Literal attribute values (a preceding space excludes [attr.x], [x] and (x)).
  const attr = /\s(aria-label|title|placeholder|alt)="([^"]*)"/g;
  for (const m of s.matchAll(attr)) {
    if (LETTER.test(m[2])) {
      found.push({
        line: lineOf(m.index + 1),
        message: `literal ${m[1]}="${m[2]}"`,
      });
    }
  }

  // Text nodes: drop tags, control flow and entities, what is left is text.
  s = s
    .replace(/<\/?[a-zA-Z](?:"[^"]*"|'[^']*'|[^>"'])*>/g, blank)
    .replace(/@let\s[^;]*;/g, blank)
    .replace(
      /@(?:else\s+if|if|else|for|switch|case|default|empty|defer|placeholder|loading|error)\b(?:\s*\((?:[^()]|\([^()]*\))*\))?/g,
      blank,
    )
    .replace(/&#?\w+;/g, blank);
  s.split('\n').forEach((l, i) => {
    const t = l.replace(/[{}]/g, '').trim();
    if (t && LETTER.test(t))
      found.push({ line: i + 1, message: `literal text "${t}"` });
  });

  return found
    .filter((f) => !ignored.has(f.line))
    .sort((a, b) => a.line - b.line);
}

const LIT = String.raw`(['"\`])((?:(?!\1).)*)\1`;
const CONTEXTS = [
  new RegExp(String.raw`throw\s+new\s+\w*Error\(\s*${LIT}`),
  new RegExp(String.raw`\b(?:error|message|title|label)\s*:\s*${LIT}`),
  new RegExp(String.raw`\bbuttons\s*:\s*\[\s*${LIT}`),
  new RegExp(String.raw`\.set\(\s*${LIT}`),
  new RegExp(String.raw`\breturn\s+${LIT}`),
];

/** Prose literals (a letter and a space) in user-facing positions of a TS file. */
export function scanSource(text) {
  const found = [];
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((l, i) => {
      const t = l.trim();
      if (/^(\/\/|\/\*|\*)/.test(t)) return;
      if (l.includes('console.') || l.includes('i18n-ignore')) return;
      for (const re of CONTEXTS) {
        const m = re.exec(l);
        if (m && LETTER.test(m[2]) && /\s/.test(m[2])) {
          found.push({ line: i + 1, message: `literal "${m[2]}"` });
          break;
        }
      }
    });
  return found;
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// events/ is the nx-electron scaffold; main-messages.ts is the main catalog itself.
const SKIP = [
  `apps${sep}desktop${sep}src${sep}app${sep}events${sep}`,
  join('apps', 'desktop', 'src', 'app', 'i18n', 'main-messages.ts'),
];

export function run(root = ROOT) {
  const failures = [];
  for (const base of ['apps/desktop/src/app', 'apps/renderer/src/app']) {
    for (const file of walk(join(root, base))) {
      const rel = relative(root, file);
      if (SKIP.some((s) => rel.startsWith(s))) continue;
      let hits = [];
      if (rel.endsWith('.html') && base.includes('renderer')) {
        hits = scanTemplate(readFileSync(file, 'utf8'));
      } else if (rel.endsWith('.ts') && !rel.endsWith('.spec.ts')) {
        hits = scanSource(readFileSync(file, 'utf8'));
      }
      for (const h of hits)
        failures.push(`${rel.split(sep).join('/')}:${h.line} ${h.message}`);
    }
  }
  return failures;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const failures = run();
  if (failures.length) {
    console.error(
      `i18n:check found ${failures.length} hardcoded text(s):\n${failures.join('\n')}`,
    );
    process.exit(1);
  }
  console.log('i18n:check ok');
}
