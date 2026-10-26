#!/usr/bin/env node
// Read-only MCP server (stdio, newline-delimited JSON-RPC 2.0) exposing the
// Ascua "Mis notas" folder to Claude Code. No dependencies; never writes.
//
// Folder: --dir <path>, else ASCUA_NOTES_DIR, else <userData>/ascua/notes.
// stdout carries JSON-RPC messages only; diagnostics go to stderr.
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';

const VERSION = '1.0.0';
const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BYTES = 1024 * 1024;
const MAX_HITS = 50;

function defaultDir() {
  if (process.platform === 'win32') {
    return join(
      process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
      'ascua',
      'notes',
    );
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'ascua', 'notes');
  }
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
    'ascua',
    'notes',
  );
}

function notesDir() {
  const i = process.argv.indexOf('--dir');
  if (i >= 0 && process.argv[i + 1]) return resolve(process.argv[i + 1]);
  if (process.env.ASCUA_NOTES_DIR) return resolve(process.env.ASCUA_NOTES_DIR);
  return defaultDir();
}

const dir = notesDir();

// Small copy of `headingSlug` from `@ascua/notes` (libs/notes/src/lib/outline.ts):
// this .mjs cannot import TS. GitHub-style, `-1`/`-2` suffix on duplicates.
function headingSlug(text, seen) {
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

// ATX headings only, skipping fenced code blocks.
function parseHeadings(text) {
  const lines = text.split(/\r?\n/);
  const seen = new Map();
  const headings = [];
  let fence = null;
  lines.forEach((line, index) => {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.len)
        fence = null;
      return;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (open) {
      fence = { char: open[1][0], len: open[1].length };
      return;
    }
    const m = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (!m) return;
    const title = m[2].trim();
    if (!title) return;
    headings.push({
      level: m[1].length,
      text: title,
      slug: headingSlug(title, seen),
      line: index,
    });
  });
  return { lines, headings };
}

function validName(name) {
  if (typeof name !== 'string' || !name.trim())
    throw new Error('Note name is required.');
  const clean = name.trim().replace(/\.md$/i, '');
  if (!validNoteFileName(clean)) throw new Error(`Invalid note name: ${name}`);
  return clean;
}

// Accepts `Nota`, `Nota.md`, `Nota#H`, `[[Nota#H]]`, `[[Nota#H|alias]]`.
function parseTarget(rawName, heading) {
  if (typeof rawName !== 'string') return { name: rawName, heading };
  let s = rawName.trim();
  const wiki = /^\[\[(.*)\]\]$/s.exec(s);
  if (wiki) s = wiki[1];
  if (wiki || s.includes('#')) {
    const bar = s.indexOf('|');
    if (bar >= 0) s = s.slice(0, bar);
    const hash = s.indexOf('#');
    if (hash >= 0) {
      const h = s.slice(hash + 1).trim();
      s = s.slice(0, hash);
      if ((heading === undefined || heading === '') && h) heading = h;
    }
  }
  return { name: s.trim(), heading };
}

// Keeps one tool result under Claude Code's MCP output limit.
const MAX_OUTPUT = 100 * 1024;
function capOutput(t, hint) {
  if (t.length <= MAX_OUTPUT) return t;
  return `${t.slice(0, MAX_OUTPUT)}\n\n[Truncated at ${MAX_OUTPUT} characters. ${hint}]`;
}

// Copy of `noteNameError` from `@ascua/notes` (libs/notes/src/lib/note-name.ts):
// keep in sync. Files the app cannot name or link are skipped.
// eslint-disable-next-line no-control-regex
const NAME_BAD = /[/\\:*?"<>|#[\]\u0000-\u001f\u007f]/;
const NAME_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
function validNoteFileName(name) {
  return !(
    name.trim() === '' ||
    name !== name.trim() ||
    name.length > 120 ||
    NAME_BAD.test(name) ||
    name.startsWith('.') ||
    name.endsWith('.') ||
    NAME_RESERVED.test(name)
  );
}

async function listFiles() {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith('.md')) continue;
    try {
      if ((await stat(join(dir, e.name))).size > MAX_BYTES) continue;
    } catch {
      continue;
    }
    const base = e.name.slice(0, -3);
    if (validNoteFileName(base)) names.push(base);
  }
  return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function readNoteText(rawName) {
  const name = validName(rawName);
  const file = resolve(dir, `${name}.md`);
  if (!file.startsWith(resolve(dir) + sep))
    throw new Error(`Invalid note name: ${name}`);
  let info;
  try {
    info = await stat(file);
  } catch {
    // Case-insensitive fallback, like note links.
    const match = (await listFiles()).find(
      (n) => n.toLowerCase() === name.toLowerCase(),
    );
    if (!match || match === name) {
      const all = await listFiles();
      const shown = all.slice(0, MAX_HITS).join(', ');
      throw new Error(
        `Note not found: ${name}. Available notes: ${shown || '(none)'}${all.length > MAX_HITS ? `, ... (${all.length - MAX_HITS} more)` : ''}`,
      );
    }
    return readNoteText(match);
  }
  if (info.size > MAX_BYTES) throw new Error(`Note too large: ${name}`);
  return { name, text: await readFile(file, 'utf8') };
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });

const tools = {
  list_notes: {
    description:
      'List the notes in the user\'s Ascua "Mis notas" folder with each note\'s heading outline. Start here to discover note names and headings.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async run() {
      const names = await listFiles();
      if (!names.length) return text('No notes.');
      const out = [];
      for (const name of names) {
        let body;
        try {
          body = (await readNoteText(name)).text;
        } catch {
          continue; // unreadable or vanished: skip it
        }
        const { headings } = parseHeadings(body);
        const outline = headings.map(
          (h) => `${'  '.repeat(h.level)}- ${h.text} (#${h.slug})`,
        );
        out.push([`# ${name}`, ...outline].join('\n'));
      }
      return text(
        capOutput(
          out.join('\n\n'),
          'Use read_note with a note name to see a specific note',
        ),
      );
    },
  },
  read_note: {
    description:
      'Read a note in Markdown. Notes link to each other as [[Note#Heading]]; you may pass such a link directly as `name` (or `Note#Heading`). Pass `heading` (slug or text, case-insensitive) to read only that section, up to the next heading of the same or higher level. Output is truncated at 100 KB: use `heading` for long notes.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Note name (with or without .md), or a link like [[Note#Heading]].',
        },
        heading: {
          type: 'string',
          description: 'Optional heading text or slug of the section to read.',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
    async run(args) {
      const target = parseTarget(args.name, args.heading);
      const heading = target.heading;
      const note = await readNoteText(target.name);
      const hint =
        'Pass the `heading` argument to read a single section (see list_notes)';
      if (heading === undefined || heading === '')
        return text(capOutput(note.text, hint));
      const { lines, headings } = parseHeadings(note.text);
      const raw = String(heading).trim().replace(/^#+/, '').trim();
      const want = raw.toLowerCase();
      const wantSlug = headingSlug(raw);
      const at = headings.find(
        (h) =>
          h.slug === want ||
          h.slug === wantSlug ||
          h.text.toLowerCase() === want,
      );
      if (!at) {
        throw new Error(
          `Heading not found in ${note.name}: ${heading}. Available: ${headings.map((h) => h.text).join(', ') || '(none)'}`,
        );
      }
      const next = headings.find(
        (h) => h.line > at.line && h.level <= at.level,
      );
      return text(
        capOutput(
          lines
            .slice(at.line, next ? next.line : lines.length)
            .join('\n')
            .trimEnd(),
          'Pass a more specific `heading` (a subsection)',
        ),
      );
    },
  },
  search_notes: {
    description:
      'Case-insensitive text search across all notes. Returns note, nearest heading and line number for each match (at most 50).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to look for.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async run({ query }) {
      if (typeof query !== 'string' || !query.trim())
        throw new Error('A query is required.');
      const q = query.toLowerCase();
      const hits = [];
      for (const name of await listFiles()) {
        let body;
        try {
          body = (await readNoteText(name)).text;
        } catch {
          continue; // unreadable or vanished: skip it
        }
        const { lines, headings } = parseHeadings(body);
        for (let i = 0; i < lines.length && hits.length < MAX_HITS; i++) {
          if (!lines[i].toLowerCase().includes(q)) continue;
          const near = [...headings].reverse().find((h) => h.line <= i);
          hits.push(
            `${name}${near ? ` > ${near.text}` : ''}:${i + 1}: ${lines[i].trim()}`,
          );
        }
        if (hits.length >= MAX_HITS) break;
      }
      return text(hits.length ? hits.join('\n') : 'No matches.');
    },
  },
};

async function handle(msg) {
  const { method, params } = msg;
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'ascua-notes', version: VERSION },
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return {
        tools: Object.entries(tools).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    case 'tools/call': {
      const tool = Object.hasOwn(tools, params?.name)
        ? tools[params.name]
        : undefined;
      if (!tool) {
        const e = new Error(`Unknown tool: ${params?.name}`);
        e.code = -32602;
        throw e;
      }
      try {
        return await tool.run(params.arguments ?? {});
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: String(error?.message ?? error) }],
        };
      }
    }
    default: {
      const e = new Error(`Method not found: ${method}`);
      e.code = -32601;
      throw e;
    }
  }
}

const send = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    send({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
    return;
  }
  const isRequest =
    msg &&
    msg.id !== undefined &&
    msg.id !== null &&
    typeof msg.method === 'string';
  if (!isRequest) return; // notifications and stray responses get no reply
  try {
    send({ jsonrpc: '2.0', id: msg.id, result: await handle(msg) });
  } catch (error) {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: error.code ?? -32603, message: String(error.message) },
    });
  }
});
