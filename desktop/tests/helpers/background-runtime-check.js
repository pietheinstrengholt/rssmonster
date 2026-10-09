import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { startRuntime } from '../../runtime.js';

const children = [];
const events = [];
let requests = 0;
let holdFeed;
let feedStarted;
let releaseFeed;
const fixture = createServer(async (_req, res) => {
  requests++;
  if (holdFeed) { feedStarted(); await holdFeed; }
  res.setHeader('Content-Type', 'application/rss+xml');
  res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>Background fixture</title><link>https://example.com</link><description>Test</description><item><title>Background article</title><guid>background-1</guid><link>https://example.com/background-1</link><description>Article from a local background test.</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
});
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
process.env.RSSMONSTER_INTERNAL_HOST_ALLOWLIST = `127.0.0.1:${fixture.address().port}`;
process.env.INFERENCE_AI_ENABLED = 'false';
delete process.env.INFERENCE_BASE_URL;
const runtime = await startRuntime(process.argv[2], {
  startCrawlWorker: (directory, settings, receive, failure) => new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./crawl-child.js', import.meta.url)), [], {
      cwd: directory, env: { ...process.env, RSSMONSTER_DESKTOP_CRAWL_SETTINGS: JSON.stringify(settings) }, stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    });
    children.push(child);
    let stopping = false;
    let finished = false;
    const exited = once(child, 'exit');
    child.on('exit', code => {
      if (code && !stopping && !finished) failure(new Error(`Crawler exit ${code}`));
      reject(new Error(`Crawler failed to start (${code})`));
    });
    child.on('message', message => {
      receive(message);
      if (message.type === 'activity') events.push(message);
      if (message.type === 'finished') finished = true;
      if (message.type === 'listening') resolve({ send: message => child.send(message), stop: async () => {
        stopping = true;
        if (child.exitCode !== null) return;
        child.send('stop');
        await exited;
      } });
    });
  })
});
let token;
const api = async (route, body, method = body ? 'POST' : 'GET', expected = 200) => {
  const response = await fetch(`${runtime.origin}/api${route}`, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  assert.equal(response.status, expected, route);
  return response.json();
};
const waitActivity = async predicate => {
  if (events.some(predicate)) return;
  await new Promise(resolve => {
    const listeners = children.map(child => {
      const listener = message => {
        if (!predicate(message)) return;
        listeners.forEach(([process, callback]) => process.removeListener('message', callback));
        resolve();
      };
      child.on('message', listener);
      return [child, listener];
    });
  });
};
try {
  await runtime.ready;
  await waitActivity(message => Boolean(message.lastCompletedAt));
  const credentials = { username: 'background-test', password: 'background-test-password' };
  await api('/auth/register', { ...credentials, password_repeat: credentials.password }, 'POST', 201);
  token = (await api('/auth/login', credentials)).token;
  assert.equal((await api('/setting')).DesktopEnabled, true);
  const config = (await api('/desktop/settings')).settings;
  const category = await api('/categories', { name: 'Background' }, 'POST', 201);
  const feed = await api('/feeds', { categoryId: category.id, url: `http://127.0.0.1:${fixture.address().port}/feed.xml` }, 'POST', 201);
  const { default: db } = await import('../../../server/models/index.js');
  // No visible window exists: waking the production worker still imports articles.
  events.length = 0;
  await runtime.background.refresh();
  await waitActivity(message => Boolean(message.lastCompletedAt) && message.result?.totalNewArticles === 1);
  await waitActivity(message => Boolean(message.nextRefreshAt));
  assert.equal(await db.Article.count(), 1);
  const requestCount = requests;
  events.length = 0;
  await runtime.background.refresh();
  await waitActivity(message => Boolean(message.lastCompletedAt));
  await waitActivity(message => Boolean(message.nextRefreshAt));
  assert.equal(requests, requestCount, 'Feed-level nextFetchAt prevents early refetch');
  const activity = await api('/desktop/activity');
  assert.ok(activity.lastRefreshAt);
  assert.equal(activity.status, 'idle');
  assert.ok(activity.nextRefreshAt);
  const nextDelay = Date.parse(activity.nextRefreshAt) - Date.now();
  assert.ok(nextDelay > 890_000 && nextDelay <= 900_000, `15-minute interval: ${nextDelay}`);
  await api('/desktop/settings', { ...config, automaticRefresh: false }, 'PUT');
  assert.equal((await api('/desktop/activity')).nextRefreshAt, null);
  // The existing manual HTTP refresh still runs while automatic refresh is disabled.
  await db.Feed.update({ nextFetchAt: new Date(0) }, { where: { id: feed.feed.id } });
  holdFeed = new Promise(resolve => { releaseFeed = resolve; });
  const started = new Promise(resolve => { feedStarted = resolve; });
  await api('/crawl');
  await started;
  const beforeOverlappingRefresh = requests;
  await runtime.background.refresh();
  const overlappingChild = children.at(-1);
  await once(overlappingChild, 'exit');
  assert.equal(requests, beforeOverlappingRefresh, 'Concurrent scheduled/manual triggers reuse the active user crawl');
  assert.equal(await db.CrawlRun.count({ where: { status: 'running' } }), 1);
  releaseFeed();
  holdFeed = undefined;
  const { waitForActiveCrawls } = await import('../../../server/controllers/crawl.js');
  await waitForActiveCrawls();
  assert.ok(requests > requestCount);
  await api('/desktop/settings', { ...config, automaticRefresh: false, refreshIntervalMinutes: 5 }, 'PUT');
  await runtime.background.refresh();
  const oneShot = children.at(-1);
  await once(oneShot, 'exit');
  assert.equal(runtime.background.getState().workerStatus, 'disabled');
  const firstToken = token;
  const otherCredentials = { username: 'other-background-user', password: 'other-background-password' };
  await api('/auth/register', { ...otherCredentials, password_repeat: otherCredentials.password }, 'POST', 201);
  token = (await api('/auth/login', otherCredentials)).token;
  const otherActivity = await api('/desktop/activity');
  assert.equal(otherActivity.newArticles, null);
  assert.equal(otherActivity.lastRefreshAt, null);
  await api('/desktop/settings', { ...config, automaticRefresh: false }, 'PUT', 403);
  token = firstToken;
  await api('/desktop/settings', { ...config, refreshIntervalMinutes: 5 }, 'PUT');
  assert.equal(children.filter(child => child.exitCode === null).length, 1);
} finally {
  releaseFeed?.();
  await runtime.stop();
  await new Promise(resolve => fixture.close(resolve));
  for (const child of children) assert.notEqual(child.exitCode, null, 'No orphaned crawl workers');
}
await assert.rejects(fetch(`${runtime.origin}/api/health`));
process.exit(0);
