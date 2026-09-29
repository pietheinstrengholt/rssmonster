import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { localInferenceEnvironment } from '../inference-config.js';
import { startServiceProcess } from '../services.js';

const fixture = () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const failures = [];
  const messages = [];
  child.postMessage = message => messages.push(message);
  const startup = startServiceProcess({ fork: () => child }, 'inference', '/profile', {}, error => failures.push(error));
  return { child, startup, failures, messages };
};

test('local models override remote configuration and cache outside the bundle', () => {
  const environment = localInferenceEnvironment('/profile', {
    ASSISTANT_PROVIDER: 'openai-compatible', OPENAI_API_KEY: 'external-key',
    EMBEDDING_PROVIDER: 'openai-compatible', INFERENCE_API_KEY: 'local-key'
  });
  assert.equal(environment.INFERENCE_MODEL_CACHE_DIR, path.join('/profile', 'models'));
  assert.equal(environment.INFERENCE_HOST, '127.0.0.1');
  assert.equal(environment.EMBEDDING_PROVIDER, 'local');
  assert.equal(environment.EMBEDDING_MODEL, 'onnx-community/Qwen3-Embedding-0.6B-ONNX');
  assert.equal(environment.CLASSIFICATION_MODEL, 'onnx-community/ModernBERT-base-nli-ONNX');
  assert.equal(environment.GENERATION_MODEL, 'onnx-community/Qwen3.5-0.8B-ONNX');
  assert.equal(environment.ASSISTANT_PROVIDER, '');
  assert.equal(environment.OPENAI_API_KEY, '');
  assert.equal(environment.INFERENCE_ASSISTANT_ENABLED, 'false');
  assert.equal(environment.INFERENCE_API_KEY, 'local-key');
});

test('listener availability is separate from model readiness and shutdown waits for exit', async () => {
  const { child, startup, failures, messages } = fixture();
  child.emit('message', { type: 'listening', url: 'http://127.0.0.1:1234' });
  const service = await startup;
  let ready = false;
  void service.ready.then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  child.emit('message', { type: 'ready' });
  await service.ready;
  assert.equal(ready, true);
  const stopping = service.stop();
  assert.equal(service.stop(), stopping);
  assert.deepEqual(messages, ['stop']);
  child.emit('exit', 0);
  await stopping;
  assert.deepEqual(failures, []);
});

test('model startup failure rejects readiness and reports failure', async () => {
  const { child, startup, failures } = fixture();
  child.emit('message', { type: 'listening', url: 'http://127.0.0.1:1234' });
  const service = await startup;
  child.emit('exit', 1);
  await assert.rejects(service.ready, /inference exited/);
  assert.equal(failures.length, 1);
  await service.stop();
});

test('process failure before binding rejects startup', async () => {
  const { child, startup } = fixture();
  child.emit('exit', 1);
  await assert.rejects(startup, /failed to start/);
});

test('closing while models load rejects readiness without a failure notification', async () => {
  const { child, startup, failures } = fixture();
  child.emit('message', { type: 'listening', url: 'http://127.0.0.1:1234' });
  const service = await startup;
  const stopping = service.stop();
  child.emit('exit', 0);
  await stopping;
  await assert.rejects(service.ready);
  assert.deepEqual(failures, []);
});
