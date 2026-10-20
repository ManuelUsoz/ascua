#!/usr/bin/env node
// Claude Code permission hook: stdin JSON -> Ascua -> stdout.
//
// This is the non-binary replacement for the old Rust `ascua-hook.exe`.
// Fail open: if Ascua is not running, or anything goes wrong, print nothing and
// exit 0 so Claude Code falls back to its own terminal prompt.
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const user = process.env.USERNAME ?? process.env.USER ?? 'user';
const endpoint =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\ascua-${user}`
    : join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), 'ascua.sock');

// Read one line, like the old hook did; do not wait for stdin to close.
const input = await new Promise((resolve) => {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    const newline = buffer.indexOf('\n');
    if (newline >= 0) resolve(buffer.slice(0, newline));
  });
  process.stdin.on('end', () => resolve(buffer));
});

try {
  JSON.parse(input);
} catch {
  process.exit(0);
}

let reply = '';
let finished = false;
const finish = () => {
  if (finished) return;
  finished = true;
  if (reply.trim()) process.stdout.write(reply);
  socket.destroy();
  process.exit(0);
};

let socket;
try {
  socket = connect(endpoint);
} catch {
  process.exit(0);
}
socket.setEncoding('utf8');
socket.on('connect', () => socket.write(`${input.trim()}\n`));
socket.on('data', (chunk) => {
  reply += chunk;
  if (reply.includes('\n')) finish();
});
socket.on('end', finish);
socket.on('close', finish);
socket.on('error', () => process.exit(0));

// If the user leaves the prompt unanswered for half an hour, let Claude Code
// take over rather than blocking a terminal forever.
setTimeout(() => process.exit(0), 30 * 60 * 1000).unref();
