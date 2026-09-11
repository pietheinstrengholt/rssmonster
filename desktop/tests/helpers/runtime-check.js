import assert from 'node:assert/strict';
import path from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { startRuntime } from '../../runtime.js';

const [userData, phase] = process.argv.slice(2);
let feedRequests = 0;
let releaseFeed;
let feedStarted;
const started = new Promise(resolve => { feedStarted = resolve; });
const fixture = createServer(async (_req, res) => {
  feedRequests++;
  if (releaseFeed) {
    const release = releaseFeed;
    feedStarted();
    await release;
  }
  res.setHeader('Content-Type', 'application/rss+xml');
  res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>Desktop fixture</title>
    <link>https://example.com/</link><description>Fixture</description><item>
    <title>Desktop persisted article</title><guid>desktop-article-1</guid>
    <link>https://example.com/desktop-article-1</link>
    <description>A deterministic desktop article for testing persistence and reading.</description>
    <pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
});
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
const inference = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url !== '/health' && req.headers['x-inference-api-key'] !== 'desktop-test-key') {
    res.writeHead(401); res.end(JSON.stringify({ error: 'unauthorized' })); return;
  }
  const capabilities = Object.fromEntries(['embeddings', 'generation', 'classification', 'assistant'].map(name => [name, {
    configured: true, available: true, provider: 'openai-compatible', model: 'desktop-test-model',
    ...(name === 'embeddings' ? { dimensions: 1024 } : {})
  }]));
  res.end(JSON.stringify(req.url === '/api/capabilities'
    ? { service: 'rssmonster-inference', apiVersion: '1', version: '2.3.0', status: 'ready', capabilities }
    : { status: 'ok', state: 'ready', acceptingWork: true }));
});
await new Promise(resolve => inference.listen(0, '127.0.0.1', resolve));
const inferenceUrl = `http://127.0.0.1:${inference.address().port}`;

process.env.RSSMONSTER_INTERNAL_HOST_ALLOWLIST = `127.0.0.1:${fixture.address().port}`;
// Inference permission is deployment-independent; no endpoint still means unavailable.
process.env.INFERENCE_AI_ENABLED = 'true';
process.env.EMAIL_ENABLED = 'true';
delete process.env.INFERENCE_BASE_URL;
delete process.env.INFERENCE_URL;
const runtime = await startRuntime(userData);
const { default: db } = await import('../../../server/models/index.js');
const { waitForActiveCrawls } = await import('../../../server/controllers/crawl.js');
let token;
const api = async (route, body, method = body ? 'POST' : 'GET') => {
  const response = await fetch(`${runtime.origin}/api${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json();
  assert.ok(response.ok, `${route}: ${response.status} ${JSON.stringify(result)}`);
  return result;
};
try {
  assert.equal(process.env.INFERENCE_AI_ENABLED, 'true');
  assert.equal(process.env.EMAIL_ENABLED, 'false');
  assert.equal(db.sequelize.options.storage, path.join(userData, 'rssmonster.sqlite'));
  const html = await (await fetch(runtime.origin)).text();
  assert.match(html, /<div id="app">/);
  const credentials = { username: 'desktop-test', password: 'desktop-test-password' };
  if (phase === 'create') await api('/auth/register', { ...credentials, password_repeat: credentials.password });
  token = (await api('/auth/login', credentials)).token;
  assert.ok(token);
  const disabled = await fetch(`${runtime.origin}/api/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ input: 'test' })
  });
  assert.equal(disabled.status, 503);
  assert.equal((await disabled.json()).code, 'INFERENCE_DISABLED');
  if (phase === 'create') {
    assert.equal(await db.CrawlRun.count(), 0);
    const category = await api('/categories', { name: 'Desktop feeds' });
    const result = await api('/feeds', {
      categoryId: category.id,
      url: `http://127.0.0.1:${fixture.address().port}/feed.xml`,
      feedName: 'Desktop fixture', crawlSince: 'all'
    });
    assert.ok(result.feed.id);
    assert.equal(result.feed.generateEmbeddings, false);
    assert.equal(result.feed.applyAiAnalysis, false);
    const saved = await api('/setting/inference', { baseUrl: inferenceUrl, apiKeyAction: 'replace', apiKey: 'desktop-test-key' }, 'PUT');
    assert.equal(saved.apiKeyConfigured, true);
    assert.equal(JSON.stringify(saved).includes('desktop-test-key'), false);
    assert.equal((await api('/setting/inference/test', {})).ready, true);

    assert.equal(await db.Article.count(), 0);
    assert.equal(await db.CrawlRun.count(), 0);
    let unblock;
    releaseFeed = new Promise(resolve => { unblock = resolve; });
    const refresh = await api('/feeds/refresh', {});
    assert.ok(refresh.jobId);
    await started;
    // Shutdown must wait for the detached crawl, even after the refresh response completed.
    let stopped = false;
    const stopping = runtime.stop().then(() => { stopped = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stopped, false);
    unblock();
    await stopping;
    await assert.rejects(fetch(`${runtime.origin}/api/health`));
  } else {
    const persisted = await api('/setting/inference');
    assert.equal(persisted.configurationSource, 'database');
    assert.equal(persisted.apiKeyConfigured, true);
    assert.equal(JSON.stringify(persisted).includes('desktop-test-key'), false);
    await api('/setting/inference', { baseUrl: inferenceUrl, apiKeyAction: 'keep' }, 'PUT');
    const checked = await api('/setting/inference/test', {});
    assert.equal(checked.ready, true);
    assert.equal(checked.capabilities.embeddings.dimensions, 1024);
    assert.equal(await db.Article.count(), 1);
    const article = await db.Article.findOne();
    assert.equal(article.title, 'Desktop persisted article');
    assert.equal(await db.ProcessingJob.count(), 0);
    assert.equal(await db.Event.count(), 0);
    assert.equal(await db.Topic.count(), 0);
    await api(`/articles/${article.id}`);
    await api('/articles/markasread', { articleIds: [article.id] });
    await article.reload();
    assert.ok(article.readAt);
    assert.equal(article.embedding_model, null);
    assert.equal(article.articleVector, null);
    const runs = await db.CrawlRun.count();
    await api('/health');
    assert.equal(await db.CrawlRun.count(), runs);
    assert.equal(feedRequests, 0);
    // The legacy API also executes directly, without a worker.
    await api('/crawl');
    await waitForActiveCrawls();
  }
  assert.ok(JSON.parse(await readFile(path.join(userData, 'secrets.json'), 'utf8')).JWT_SECRET);
} finally {
  await runtime.stop();
  await new Promise(resolve => fixture.close(resolve));
  await new Promise(resolve => inference.close(resolve));
}
// SSE job retention timers are owned by the reused server; Electron exits after the DB drain too.
process.exit(0);
