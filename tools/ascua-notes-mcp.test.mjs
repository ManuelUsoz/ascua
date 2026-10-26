import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  'ascua-notes-mcp.mjs',
);
let dir;
let child;
let nextId = 1;
const pending = new Map();

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
    );
  });
}

const call = (name, args) => request('tools/call', { name, arguments: args });

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ascua-notes-'));
  await writeFile(
    join(dir, 'Plan.md'),
    '# Plan\nintro\n## Goals\nship the Thing\n### Detail\nfine print\n## Risks\nnone\n```\n# not a heading\n```\n',
  );
  await writeFile(join(dir, 'Other.md'), '# Other\nmentions thing here\n');
  await writeFile(join(dir, 'ignored.txt'), 'thing');
  child = spawn(process.execPath, [script, '--dir', dir], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  createInterface({ input: child.stdout }).on('line', (line) => {
    const msg = JSON.parse(line);
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  });
});

after(async () => {
  child.kill();
  await rm(dir, { recursive: true, force: true });
});

test('initialize negotiates the protocol version', async () => {
  const res = await request('initialize', { protocolVersion: '2025-03-26' });
  assert.equal(res.result.protocolVersion, '2025-03-26');
  assert.equal(res.result.serverInfo.name, 'ascua-notes');
  const fallback = await request('initialize', {
    protocolVersion: '1999-01-01',
  });
  assert.equal(fallback.result.protocolVersion, '2025-06-18');
});

test('tools/list exposes the three tools', async () => {
  const res = await request('tools/list');
  assert.deepEqual(res.result.tools.map((t) => t.name).sort(), [
    'list_notes',
    'read_note',
    'search_notes',
  ]);
});

test('list_notes shows names and outline', async () => {
  const res = await call('list_notes', {});
  const out = res.result.content[0].text;
  assert.match(out, /# Plan/);
  assert.match(out, /Goals \(#goals\)/);
  assert.match(out, /# Other/);
  assert.doesNotMatch(out, /not a heading/);
});

test('read_note returns a section up to the next same-or-higher heading', async () => {
  const res = await call('read_note', { name: 'Plan', heading: 'goals' });
  const out = res.result.content[0].text;
  assert.match(out, /## Goals/);
  assert.match(out, /### Detail/);
  assert.match(out, /fine print/);
  assert.doesNotMatch(out, /Risks/);
});

test('search_notes reports note, heading and line', async () => {
  const res = await call('search_notes', { query: 'THING' });
  const out = res.result.content[0].text;
  assert.match(out, /Plan > Goals:4: ship the Thing/);
  assert.match(out, /Other > Other:2:/);
});

// Parity with libs/notes/src/lib/outline.ts (headingSlug / parseOutline).
test('slugs and fences match @ascua/notes', async () => {
  await writeFile(
    join(dir, 'Parity.md'),
    '# Café  Olé\n## Café  Olé\n````\n```\n# fake\n````\n## \n## Año nuevo!\n### real after\n',
  );
  const list = await call('list_notes', {});
  const out = list.result.content[0].text;
  assert.match(out, /Café {2}Olé \(#café--olé\)/);
  assert.match(out, /Café {2}Olé \(#café--olé-1\)/);
  assert.match(out, /Año nuevo! \(#año-nuevo\)/);
  assert.match(out, /real after \(#real-after\)/);
  assert.doesNotMatch(out, /fake/);
  const sec = await call('read_note', {
    name: 'Parity',
    heading: 'café--olé-1',
  });
  const text = sec.result.content[0].text;
  assert.match(text, /# fake/);
  assert.doesNotMatch(text, /real after/);
});

test('unusual or unreadable entries are skipped, not fatal', async () => {
  await writeFile(join(dir, 'con#hash.md'), '# Hashed\nzzmarker\n');
  await writeFile(join(dir, '.hidden.md'), '# Hidden\nzzmarker\n');
  await writeFile(join(dir, 'CON.md'), '# Reserved\nzzmarker\n');
  await mkdir(join(dir, 'dir.md'));
  const list = await call('list_notes', {});
  assert.notEqual(list.result.isError, true);
  const out = list.result.content[0].text;
  assert.match(out, /# Plan/);
  assert.doesNotMatch(out, /con#hash|\.hidden|# CON/);
  const found = await call('search_notes', { query: 'zzmarker' });
  assert.notEqual(found.result.isError, true);
  assert.equal(found.result.content[0].text, 'No matches.');
});

test('bad names are tool errors', async () => {
  const res = await call('read_note', { name: '../x' });
  assert.equal(res.result.isError, true);
});

test('read_note accepts links, .md, #-prefixed and text-as-slug headings', async () => {
  const t = async (args) => (await call('read_note', args)).result;
  assert.match(
    (await t({ name: '[[Plan#Goals]]' })).content[0].text,
    /## Goals/,
  );
  assert.match(
    (await t({ name: '[[Plan#Goals|the goals]]' })).content[0].text,
    /fine print/,
  );
  assert.match((await t({ name: 'Plan#Risks' })).content[0].text, /## Risks/);
  assert.match((await t({ name: 'Plan.md' })).content[0].text, /# Plan/);
  assert.match(
    (await t({ name: 'Plan', heading: '#Goals' })).content[0].text,
    /## Goals/,
  );
  await writeFile(join(dir, 'Slugs.md'), '# Año nuevo!\nbody\n');
  assert.match(
    (await t({ name: 'Slugs', heading: 'Año Nuevo' })).content[0].text,
    /body/,
  );
});

test('read_note uses the strict name check and lists names on miss', async () => {
  const bad = (await call('read_note', { name: 'a:c' })).result;
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /Invalid note name/);
  const miss = (await call('read_note', { name: 'Nope' })).result;
  assert.equal(miss.isError, true);
  assert.match(miss.content[0].text, /Available notes: .*Plan/);
});

test('large notes are truncated with a hint', async () => {
  await writeFile(
    join(dir, 'Big.md'),
    `# Big\n${'x'.repeat(200 * 1024)}\n## Small\nok\n`,
  );
  const res = (await call('read_note', { name: 'Big' })).result;
  const out = res.content[0].text;
  assert.ok(out.length < 110 * 1024);
  assert.match(out, /Truncated.*heading/);
  const sec = (await call('read_note', { name: 'Big#Small' })).result;
  assert.doesNotMatch(sec.content[0].text, /Truncated/);
});

test('unknown method is a JSON-RPC error', async () => {
  const res = await request('nope');
  assert.equal(res.error.code, -32601);
});
