// Exercise the shipped binary through its real renderer and REST API, from outside the repository.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

if (process.platform !== 'linux') throw new Error('The packaged verifier currently supports Linux only.');

const executable = path.resolve(process.argv[2] || 'release/linux-unpacked/rssmonster');
const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-package-test-'));
const profile = path.join(directory, 'profile');
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

const launch = (debug = true) => {
  const child = spawn(executable, debug ? ['--remote-debugging-port=0', `--user-data-dir=${profile}`] : [], {
    cwd: directory,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: directory,
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
    const timeout = setTimeout(() => finish(new Error(`Timed out: ${pattern}\n${output}`)), 60_000);
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
  return { child, waitForLog, output: () => output };
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

try {
  // Exercise argument-free startup on the installed executable; AppImage's wrapper is closed via its UI below.
  if (!executable.endsWith('.AppImage')) {
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
      const origin = (await running.waitForLog(/RSSMonster desktop ready at (http:\/\/127\.0\.0\.1:\d+)/))[1];
      const debugOrigin = (await running.waitForLog(/DevTools listening on ws:\/\/(127\.0\.0\.1:\d+)/))[1];
      const targets = await (await fetch(`http://${debugOrigin}/json/list`)).json();
      const page = targets.find(target => target.type === 'page' && target.url.startsWith(origin));
      assert.ok(page, 'Packaged local Vue page is present');
      inspector = await connect(page.webSocketDebuggerUrl);
      assert.equal(await inspector.evaluate('typeof process'), 'undefined');
      assert.equal((await stat(path.join(profile, 'rssmonster.sqlite'))).isFile(), true);
      assert.doesNotMatch(running.output(), /\[CRAWL\] Started|\[CrawlWorker\]|\[AiWorker\]/);
      const secrets = await readFile(path.join(profile, 'secrets.json'), 'utf8');
      if (phase === 'restart') assert.equal(secrets, previousSecrets);
      previousSecrets = secrets;
      let token = '';
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
      token = (await api('/auth/login', credentials)).token;
      if (phase === 'create') {
        const category = await api('/categories', { name: 'Packaged feeds' });
        const { feed } = await api('/feeds', { categoryId: category.id, url: `http://127.0.0.1:${fixture.address().port}/feed.xml` });
        assert.equal(feed.applyAiAnalysis, false);
        assert.equal(feed.generateEmbeddings, false);
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
        await running.waitForLog(/\[CRAWL\] Completed/);
      }
      const articles = await api('/articles?status=%25&persistSettings=false');
      assert.equal(articles.itemIds.length, 1, running.output());
      await api(`/articles/${articles.itemIds[0]}`);
      await api('/articles/markasread', { articleIds: articles.itemIds });
      const count = feedRequests;
      await api('/health');
      assert.equal(feedRequests, count);
      const disabled = await fetch(`${origin}/api/agent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{"input":"test"}'
      });
      assert.equal(disabled.status, 503);
      const exited = once(running.child, 'exit');
      // Close the actual window, exercising the production Electron shutdown handlers.
      await inspector.send('Page.close');
      const [code] = await exited;
      assert.equal(code, 0);
      await assert.rejects(fetch(`${origin}/api/health`));
      console.log(`${phase}: packaged Vue/API, SQLite, manual refresh/persistence and clean shutdown passed`);
    } finally {
      inspector?.socket.close();
      if (running.child.pid && running.child.exitCode === null && running.child.signalCode === null) {
        running.child.kill('SIGTERM');
        await once(running.child, 'exit');
      }
    }
  }
} finally {
  await new Promise(resolve => fixture.close(resolve));
  await rm(directory, { recursive: true, force: true, maxRetries: 3 });
}
