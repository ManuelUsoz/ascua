// Usage: npx electron tools/pty-smoke.cjs <path to pty-host.js>
// Forks the pty host as a utilityProcess and checks spawn, replay and kill.
const { app, utilityProcess } = require('electron');
const path = require('node:path');

const MARKER = 'ascua-pty-ok';
const hostPath = path.resolve(process.argv[2] ?? '');
const win = process.platform === 'win32';

function fail(message) {
  console.error(`FAIL: ${message}`);
  app.exit(1);
}

app.whenReady().then(async () => {
  setTimeout(() => fail('timeout after 15 s'), 15000).unref();
  console.log(`host: ${hostPath}`);

  const child = utilityProcess.fork(hostPath, [], {
    serviceName: 'Ascua PTY smoke',
  });
  child.on('exit', (code) => {
    if (code) fail(`host exited with code ${code}`);
  });

  const waiters = [];
  child.on('message', (event) => {
    for (const waiter of [...waiters]) {
      if (waiter.match(event)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(event);
      }
    }
  });
  const wait = (match, ms, what) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no ${what} within ${ms} ms`)),
        ms,
      );
      waiters.push({
        match,
        resolve: (event) => {
          clearTimeout(timer);
          resolve(event);
        },
      });
    });

  const env = { ...process.env, TERM: 'xterm-256color' };
  const [file, echoArgs, sleepArgs] = win
    ? [
        'powershell.exe',
        ['-NoLogo', '-Command', `echo ${MARKER}`],
        ['-NoLogo', '-Command', 'Start-Sleep 60'],
      ]
    : ['/bin/sh', ['-c', `echo ${MARKER}`], ['-c', 'sleep 60']];
  const cwd = process.cwd();
  let seen = '';

  try {
    const dataSeen = new Promise((resolve) => {
      child.on('message', (event) => {
        if (event.type === 'data' && event.id === 'a') {
          seen += event.data;
          if (seen.includes(MARKER)) resolve();
        }
      });
    });
    const exited = wait(
      (e) => e.type === 'exit' && e.id === 'a',
      10000,
      'exit',
    );
    child.postMessage({
      type: 'spawn',
      id: 'a',
      file,
      args: echoArgs,
      cwd,
      env,
      cols: 80,
      rows: 24,
    });
    await dataSeen;
    console.log('PASS: data event contains marker');
    await exited;
    console.log('PASS: exit event');

    const snap = wait(
      (e) => e.type === 'snapshot' && e.requestId === 1,
      5000,
      'snapshot',
    );
    child.postMessage({ type: 'snapshot', id: 'a', requestId: 1 });
    const snapshot = await snap;
    if (!snapshot.data.includes(MARKER))
      throw new Error('snapshot lacks marker');
    console.log('PASS: snapshot contains marker');

    child.postMessage({
      type: 'spawn',
      id: 'b',
      file,
      args: sleepArgs,
      cwd,
      env,
      cols: 80,
      rows: 24,
    });
    await new Promise((r) => setTimeout(r, 1000));
    const killed = wait(
      (e) => e.type === 'exit' && e.id === 'b',
      5000,
      'exit after kill',
    );
    child.postMessage({ type: 'kill', id: 'b' });
    await killed;
    console.log('PASS: kill produced exit');
  } catch (error) {
    return fail(error.message);
  }

  console.log('PASS: all');
  child.kill();
  app.exit(0);
});
