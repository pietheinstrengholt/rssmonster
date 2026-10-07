// Exercise the shipped binary through its real renderer and REST API, from outside the repository.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFile, mkdtemp, readFile, rename, rm, stat, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

if (!['linux', 'win32'].includes(process.platform)) throw new Error('The packaged verifier supports Linux and Windows.');
// Windows can use Electron as the Node test host without passing that mode to the app.
delete process.env.ELECTRON_RUN_AS_NODE;

const portable = process.argv.includes('--portable');
if (portable && process.platform !== 'win32') throw new Error('Portable artifact verification requires Windows.');
const artifact = process.argv.slice(2).find(argument => argument !== '--portable');
let executable = path.resolve(artifact || (process.platform === 'win32' ? 'release/win-unpacked/RSSMonster.exe' : 'release/linux-unpacked/rssmonster'));
const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-package-test-'));
let portableDirectory = path.join(directory, 'Portable RSSMonster');
let profile = portable ? path.join(portableDirectory, 'data') : path.join(directory, 'profile');
if (portable) {
  await mkdir(portableDirectory);
  await copyFile(executable, path.join(portableDirectory, 'RSSMonster.exe'));
  executable = path.join(portableDirectory, 'RSSMonster.exe');
}
if (process.env.RSSMONSTER_TEST_MODEL_CACHE) {
  for (const location of portable ? [profile] : [profile, path.join(directory, 'RSSMonster')]) {
    await mkdir(location, { recursive: true });
    await symlink(path.resolve(process.env.RSSMONSTER_TEST_MODEL_CACHE), path.join(location, 'models'), process.platform === 'win32' ? 'junction' : 'dir');
  }
}
let feedRequests = 0;
const fixture = createServer((_req, res) => {
  feedRequests++;
  res.setHeader('Content-Type', 'application/rss+xml');
  res.end(`<rss version="2.0"><channel><title>Packaged fixture</title><link>https://example.com</link>
    <description>Fixture</description><item><title>Packaged RSSMonster article</title>
    <guid>packaged-article-1</guid><link>https://example.com/packaged-article-1</link>
    <description>Persistent packaged article content.</description><pubDate>${new Date().toUTCString()}</pubDate>
    </item></channel></rss>`);
});
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
const credentials = { username: 'package-test', password: 'package-test-password' };
let previousSecrets;
let previousToken;

const launch = (debug = true) => {
  const startedAt = Date.now();
  const child = spawn(executable, debug ? ['--remote-debugging-port=0', ...(!portable ? [`--user-data-dir=${profile}`] : [])] : [], {
    cwd: directory,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: directory,
      APPDATA: process.platform === 'win32' ? path.join(directory, 'AppData') : process.env.APPDATA,
      XDG_CACHE_HOME: path.join(directory, 'cache'),
      APPIMAGE_EXTRACT_AND_RUN: '1',
      RSSMONSTER_INTERNAL_HOST_ALLOWLIST: `127.0.0.1:${fixture.address().port}`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const observers = new Set();
  const receive = data => {
    output = (output + data).slice(-200_000);
    for (const observer of observers) observer();
  };
  child.stdout.on('data', receive);
  child.stderr.on('data', receive);
  const waitForLog = pattern => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Timed out: ${pattern}\n${output}`)), 300_000);
    const onExit = () => finish(new Error(`Exited before ${pattern}\n${output}`));
    const finish = (error, result) => {
      clearTimeout(timeout);
      observers.delete(check);
      child.off('exit', onExit);
      child.off('error', finish);
      if (error) reject(error);
      else resolve(result);
    };
    const check = () => {
      const match = output.match(pattern);
      if (match) finish(null, match);
    };
    observers.add(check);
    child.once('exit', onExit);
    child.once('error', finish);
    check();
  });
  return { child, startedAt, waitForLog, output: () => output };
};

const connect = async url => {
  const socket = new WebSocket(url);
  await once(socket, 'open');
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const response = JSON.parse(event.data);
    const task = pending.get(response.id);
    if (!task) return;
    pending.delete(response.id);
    if (response.error) task.reject(new Error(JSON.stringify(response.error)));
    else task.resolve(response.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  return { socket, send, evaluate };
};

const poll = async (running, check) => {
  const deadline = Date.now() + 300_000;
  let lastError;
  while (Date.now() < deadline) {
    assert.equal(running.child.exitCode, null, `Packaged app exited\n${running.output()}`);
    try {
      const result = await check();
      if (result) return result;
    } catch (error) { lastError = error; }
    await delay(250);
  }
  throw new Error(`Timed out waiting for packaged app: ${lastError?.message || ''}\n${running.output()}`);
};

try {
  // Exercise argument-free startup on the installed executable; AppImage's wrapper is closed via its UI below.
  if (process.platform === 'linux' && !executable.endsWith('.AppImage')) {
    // Packaged Electron has no argv[1] on an ordinary launch; test that path without debug flags.
    const plain = launch(false);
    let plainOrigin;
    try {
      plainOrigin = (await plain.waitForLog(/RSSMonster desktop ready at (http:\/\/127\.0\.0\.1:\d+)/))[1];
      assert.ok((await stat(path.join(directory, 'RSSMonster/rssmonster.sqlite'))).isFile());
    } finally {
      if (plain.child.pid && plain.child.exitCode === null && plain.child.signalCode === null) {
        const exited = once(plain.child, 'exit');
        plain.child.kill('SIGTERM');
        assert.equal((await exited)[0], 0);
      }
    }
    await assert.rejects(fetch(`${plainOrigin}/api/health`));
    console.log('ordinary launch: default userData and HTTP shutdown passed');
  }
  for (const phase of ['create', 'restart']) {
    const running = launch();
    let inspector;
    try {
      let origin;
      let page;
      if (portable) {
        // The NSIS portable wrapper does not forward the extracted app's stdout/stderr.
        page = await poll(running, async () => {
          const health = JSON.parse(await readFile(path.join(profile, 'ai-worker-health.json'), 'utf8'));
          if (health.status === 'stopping' || Date.parse(health.updatedAt) < running.startedAt) return;
          const port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
          const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
          return targets.find(target => target.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+/.test(target.url));
        });
        origin = new URL(page.url).origin;
      } else {
        origin = (await running.waitForLog(/RSSMonster desktop ready at (http:\/\/127\.0\.0\.1:\d+)/))[1];
        await running.waitForLog(/RSSMonster desktop AI ready/);
        const debugOrigin = (await running.waitForLog(/DevTools listening on ws:\/\/(127\.0\.0\.1:\d+)/))[1];
        const targets = await (await fetch(`http://${debugOrigin}/json/list`)).json();
        page = targets.find(target => target.type === 'page' && target.url.startsWith(origin));
      }
      assert.ok(page, 'Packaged local Vue page is present');
      inspector = await connect(page.webSocketDebuggerUrl);
      assert.equal(await inspector.evaluate('typeof process'), 'undefined');
      assert.equal((await stat(path.join(profile, 'rssmonster.sqlite'))).isFile(), true);
      assert.doesNotMatch(running.output(), /\[CRAWL\] Started|\[CrawlWorker\]/);
      const secrets = await readFile(path.join(profile, 'secrets.json'), 'utf8');
      if (phase === 'restart') assert.equal(secrets, previousSecrets);
      previousSecrets = secrets;
      let token = previousToken || '';
      const api = async (route, body) => {
        const response = await fetch(`${origin}/api${route}`, {
          method: body ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: body ? JSON.stringify(body) : undefined
        });
        const result = await response.json();
        assert.ok(response.ok, `${route}: ${response.status} ${JSON.stringify(result)}`);
        return result;
      };
      if (phase === 'create') await api('/auth/register', { ...credentials, password_repeat: credentials.password });
      if (phase === 'restart') await api('/setting'); // The existing JWT survives moving portable storage.
      token = (await api('/auth/login', credentials)).token;
      previousToken = token;
      assert.equal((await api('/setting')).AIEnabled, true);
      assert.equal((await api('/setting')).AssistantEnabled, false);
      if (!portable) assert.match(running.output(), /\[AiWorker\] Starting concurrency=1/);
      if (phase === 'create') {
        const category = await api('/categories', { name: 'Packaged feeds' });
        const { feed } = await api('/feeds', { categoryId: category.id, url: `http://127.0.0.1:${fixture.address().port}/feed.xml` });
        assert.equal(feed.applyAiAnalysis, true);
        assert.equal(feed.generateEmbeddings, true);
        await inspector.evaluate(`(async () => {
          for (const [id, value] of Object.entries(${JSON.stringify(credentials)})) {
            const input = document.getElementById(id);
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          document.querySelector('.auth-form').requestSubmit();
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Refresh button missing')); }, 15000);
            const check = () => {
              const button = [...document.querySelectorAll('button')].find(element =>
                element.textContent.includes('Refresh feeds') || element.getAttribute('aria-label') === 'Refresh feeds');
              if (!button) return;
              clearTimeout(timeout);
              observer.disconnect();
              button.click();
              resolve();
            };
            const observer = new MutationObserver(check);
            observer.observe(document.body, { childList: true, subtree: true });
            check();
          });
        })()`);
        if (portable) await poll(running, async () => (await api('/articles?status=%25&persistSettings=false')).itemIds.length > 0);
        else await running.waitForLog(/\[CRAWL\] Completed/);
      }
      const articles = await api('/articles?status=%25&persistSettings=false');
      assert.equal(articles.itemIds.length, 1, running.output());
      await api(`/articles/${articles.itemIds[0]}`);
      await api('/articles/markasread', { articleIds: articles.itemIds });
      const workerHealth = JSON.parse(await readFile(path.join(profile, 'ai-worker-health.json'), 'utf8'));
      assert.notEqual(workerHealth.status, 'stopping');
      assert.equal(workerHealth.consecutiveFailures, 0);
      const count = feedRequests;
      await api('/health');
      assert.equal(feedRequests, count);
      const disabled = await fetch(`${origin}/api/agent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{"input":"test"}'
      });
      assert.equal(disabled.status, 503);
      const exited = once(running.child, 'exit', { signal: AbortSignal.timeout(45_000) });
      // Close the actual window, exercising the production Electron shutdown handlers.
      // Closing a page can close CDP before its command response arrives. Wait on the process.
      void inspector.send('Page.close').catch(() => {});
      const [code] = await exited;
      assert.equal(code, 0);
      await assert.rejects(fetch(`${origin}/api/health`));
      console.log(`${phase}: packaged Vue/API, SQLite, manual refresh/persistence and clean shutdown passed`);
    } finally {
      if (running.child.pid && running.child.exitCode === null && running.child.signalCode === null) {
        if (inspector) void inspector.send('Page.close').catch(() => running.child.kill('SIGTERM'));
        else running.child.kill('SIGTERM');
        await once(running.child, 'exit');
      }
      inspector?.socket.close();
    }
    if (portable && phase === 'create') {
      const moved = path.join(directory, 'Moved Portable RSSMonster');
      await rename(portableDirectory, moved);
      portableDirectory = moved;
      executable = path.join(moved, 'RSSMonster.exe');
      profile = path.join(moved, 'data');
    }
    if (portable) {
      assert.equal(await stat(path.join(directory, 'AppData', 'RSSMonster')).then(() => true, () => false), false,
        'Portable runtime must not create an AppData profile');
    }
  }
} finally {
  await new Promise(resolve => fixture.close(resolve));
  await rm(directory, { recursive: true, force: true, maxRetries: 3 });
}
