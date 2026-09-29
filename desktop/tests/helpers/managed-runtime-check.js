import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { startRuntime } from '../../runtime.js';

let modelsReady = false;
let resolveModels;
const modelReadiness = new Promise(resolve => { resolveModels = resolve; });
const events = [];
const inference = createServer((req, res) => {
  assert.equal(req.socket.localAddress, '127.0.0.1');
  res.setHeader('Content-Type', 'application/json');
  if (req.url !== '/health') assert.equal(req.headers['x-inference-api-key'], process.env.INFERENCE_API_KEY);
  const capabilities = Object.fromEntries(['embeddings', 'generation', 'classification', 'assistant'].map(name => [name, {
    configured: name !== 'assistant', available: modelsReady && name !== 'assistant',
    provider: name === 'assistant' ? null : 'local', model: name === 'assistant' ? null : 'test-model', ...(name === 'embeddings' ? { dimensions: 1024 } : {})
  }]));
  res.end(JSON.stringify(req.url === '/api/capabilities'
    ? { service: 'rssmonster-inference', apiVersion: '1', version: '2.4.0', status: modelsReady ? 'ready' : 'starting', capabilities }
    : { status: 'ok', state: modelsReady ? 'ready' : 'starting', acceptingWork: modelsReady }));
});
const runtime = await startRuntime(process.argv[2], {
  startInference: async () => {
    await new Promise(resolve => inference.listen(0, '127.0.0.1', resolve));
    return {
      url: `http://127.0.0.1:${inference.address().port}`, ready: modelReadiness,
      stop: async () => { events.push('inference stopped'); await new Promise(resolve => inference.close(resolve)); }
    };
  },
  startAiWorker: async () => {
    assert.equal(modelsReady, true);
    events.push('worker started');
    return { stop: async () => { events.push('worker stopped'); } };
  }
});
let token;
const api = async (route, body) => {
  const response = await fetch(`${runtime.origin}/api${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  assert.equal(response.ok, true, route);
  return response.json();
};
try {
  const credentials = { username: 'managed-test', password: 'managed-test-password' };
  await api('/auth/register', { ...credentials, password_repeat: credentials.password });
  token = (await api('/auth/login', credentials)).token;
  assert.equal((await api('/setting')).AIEnabled, false);
  assert.deepEqual(events, []);
  modelsReady = true;
  resolveModels();
  await runtime.ready;
  assert.equal((await api('/setting')).AIEnabled, true);
  assert.equal(process.env.INFERENCE_ASSISTANT_ENABLED, 'false');
  const { default: db } = await import('../../../server/models/index.js');
  assert.equal(await db.CrawlRun.count(), 0);
} finally {
  await runtime.stop();
}
assert.deepEqual(events, ['worker started', 'worker stopped', 'inference stopped']);
await assert.rejects(fetch(`${runtime.origin}/api/health`));
process.exit(0);
