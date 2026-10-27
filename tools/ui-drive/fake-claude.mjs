// Stand-in for the user's `claude` CLI (ui-drive). Runs under Electron-as-node
// (ASCUA_CLAUDE_CLI=this file). It speaks the stream-json shapes Ascua parses and
// does real HTTP to the Ascua MCP server; a small phrase table plays the model.
import * as fs from 'node:fs';
import * as readline from 'node:readline';

const argv = process.argv.slice(2);

if (argv[0] === 'auth') {
  process.stdout.write('{"loggedIn":true}\n');
  process.exit(0);
}

const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const config = JSON.parse(fs.readFileSync(flag('--mcp-config'), 'utf8'));
const { url, headers } = config.mcpServers.ascua;
const sessionId = 'fake-session';

// Start marker: one `<pid> <timestamp>` line per spawn, so a test can tell a
// warm process (exists before the first message) from a cold one.
if (process.env.ASCUA_FAKE_STARTS) {
  fs.appendFileSync(
    process.env.ASCUA_FAKE_STARTS,
    `${process.pid} ${Date.now()}\n`,
  );
}

const emit = (line) => process.stdout.write(JSON.stringify(line) + '\n');

let rpcId = 0;
async function rpc(method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  return res.json();
}

// Non-literal phrases standing in for the model's intent inference.
const table = [
  [/qu[eé] proyectos/i, 'projects_list', {}],
  [/repositorios/i, 'window_navigate', { screen: 'repositories' }],
  [/ajustes/i, 'window_navigate', { screen: 'settings' }],
  [/termin[eé]/i, 'window_collapse_room', {}],
];

let initialized = false;
let started = false;
let n = 0;
// The turn being played, so an `interrupt` can stop its stream.
let current = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One tool round trip as the CLI shows it; the HTTP call blocks while the user
// answers the confirmation bubble.
async function callTool(tool, input) {
  const id = `toolu_${++n}`;
  emit({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id, name: `mcp__ascua__${tool}`, input }],
    },
  });
  const out = await rpc('tools/call', { name: tool, arguments: input });
  const result = out.result;
  const isError = !result || result.isError === true;
  emit({
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: id,
          is_error: isError,
          content: result?.content ?? [],
        },
      ],
    },
  });
  return { result, isError, text: result?.content?.[0]?.text ?? '' };
}

const firstProjectId = async () => {
  const { text } = await callTool('projects_list', {});
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : (data.projects ?? []);
  return list[0]?.id;
};

// Multi-step phrases; each returns the reply, or null when `ctl` was aborted.
const scripts = [
  [
    /contame una historia/i,
    async (ctl) => {
      const story = 'Había una vez una brasa que no se quería apagar. ';
      ctl.streamed = true;
      for (const piece of story.match(/.{1,6}/gs) ?? []) {
        if (ctl.aborted) return null;
        emit({
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: piece },
          },
        });
        await sleep(150);
      }
      return story;
    },
  ],
  [/cual es tu pid/i, async () => `pid ${process.pid}`],
  [
    /levanta todo/i,
    async () => {
      const projectId = await firstProjectId();
      const { isError } = await callTool('terminals_start_all', { projectId });
      return isError ? 'No levanté nada.' : 'Levanté todo.';
    },
  ],
  [
    /abri una terminal/i,
    async () => {
      const projectId = await firstProjectId();
      const { isError, text } = await callTool('terminals_open_shell', {
        projectId,
      });
      return isError ? 'Quedó rechazada, no abrí nada.' : `Abrí ${text}`;
    },
  ],
  [
    /escribi largo/i,
    async () => {
      const { text } = await callTool('terminals_list', {});
      const running = JSON.parse(text).find((s) => s.status === 'running');
      const long = Array.from(
        { length: 20 },
        (_, i) => `echo paso-${i + 1}-con-un-texto-bastante-largo`,
      ).join(' && ');
      const { isError } = await callTool('terminals_write', {
        id: running?.id,
        text: long,
      });
      return isError ? 'Quedó rechazada, no escribí.' : 'Escribí el comando.';
    },
  ],
  [
    /donde esta el boton de terminal/i,
    async () => {
      const { text } = await callTool('ui_guide', { topic: 'terminals' });
      return text.includes('+ Terminal')
        ? 'El botón es + Terminal.'
        : 'No encontré la etiqueta.';
    },
  ],
];

async function turn(text, ctl) {
  if (!initialized) {
    await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'fake-claude', version: '0' },
    });
    initialized = true;
  }
  if (!started) {
    started = true;
    emit({
      type: 'system',
      subtype: 'init',
      session_id: sessionId,
      mcp_servers: [{ name: 'ascua', status: 'connected' }],
    });
  }
  let reply = 'Listo, nos vemos.';
  const script = scripts.find(([re]) => re.test(text));
  const hit = script ? undefined : table.find(([re]) => re.test(text));
  if (script) {
    reply = await script[1](ctl);
  } else if (hit) {
    const [, tool, input] = hit;
    const { result, isError } = await callTool(tool, input);
    if (tool === 'projects_list' && !isError) {
      try {
        const data = JSON.parse(result.content[0].text);
        const list = Array.isArray(data) ? data : (data.projects ?? []);
        reply = `Tienes ${list.map((p) => p.name).join(', ')}.`;
      } catch {
        reply = 'Aquí están tus proyectos.';
      }
    }
  } else {
    reply = 'Te escucho, pero no sé hacer eso todavía.';
  }
  if (ctl.aborted || reply === null) {
    emit({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      session_id: sessionId,
    });
    return;
  }
  if (!ctl.streamed) {
    for (const piece of reply.match(/.{1,8}/gs) ?? []) {
      emit({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: piece },
        },
      });
    }
  }
  emit({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: reply,
    session_id: sessionId,
  });
}

let chain = Promise.resolve();
readline.createInterface({ input: process.stdin }).on('line', (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg?.type === 'control_request') {
    // Outside the turn chain, like the real CLI: ack now, then the running turn
    // ends with an error result and the process stays alive.
    if (msg.request?.subtype === 'interrupt' && current) current.aborted = true;
    emit({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: msg.request_id,
        response: { still_queued: [] },
      },
    });
    return;
  }
  const c = msg?.message?.content;
  const text = typeof c === 'string' ? c : '';
  chain = chain
    .then(async () => {
      const ctl = { aborted: false, streamed: false };
      current = ctl;
      try {
        await turn(text, ctl);
      } finally {
        current = null;
      }
    })
    .catch(() => {
      emit({
        type: 'result',
        subtype: 'error',
        is_error: true,
        result: 'fake failure',
      });
    });
});
