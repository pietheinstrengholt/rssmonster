import { describe, expect, it, vi } from 'vitest';
import { createWebhookWorker, isWebhookWorkerEntryPoint } from '../../src/workers/webhookWorker.js';

const dependenciesFor = overrides => ({
  claim: vi.fn().mockResolvedValue([]),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
  dialect: 'mysql',
  expireFinalAttempts: vi.fn().mockResolvedValue([0]),
  process: vi.fn().mockResolvedValue({ status: 'success' }),
  policy: { pollIntervalMs: 1, concurrency: 2, requestTimeoutMs: 10 },
  ...overrides
});

describe('Webhook worker', () => {
  it('recognizes direct and PM2 entry points', () => {
    const workerPath = new URL('../../src/workers/webhookWorker.js', import.meta.url).pathname;
    expect(isWebhookWorkerEntryPoint({ argv: ['node', workerPath], env: {} })).toBe(true);
    expect(isWebhookWorkerEntryPoint({ argv: ['node', '/pm2/ProcessContainerFork.js'],
      env: { pm_exec_path: workerPath } })).toBe(true);
  });

  it('claims pending work at startup and drains requests before database shutdown', async () => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const dependencies = dependenciesFor({
      claim: vi.fn().mockResolvedValueOnce([{ id: 1 }]).mockResolvedValue([]),
      process: vi.fn(() => pending)
    });
    const worker = createWebhookWorker({ loadDependencies: async () => dependencies,
      logger: { log: vi.fn(), error: vi.fn() }, registerProcessHandlers: false });
    const running = worker.start();
    await vi.waitFor(() => expect(dependencies.process).toHaveBeenCalledOnce());
    const stopping = worker.shutdown();
    expect(dependencies.closeDatabase).not.toHaveBeenCalled();
    finish({ status: 'success' });
    await stopping;
    await running;
    expect(dependencies.claim).toHaveBeenCalledWith({ limit: 2 });
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
  });

  it('limits SQLite claims to one and stops polling on shutdown', async () => {
    const dependencies = dependenciesFor({ dialect: 'sqlite' });
    const worker = createWebhookWorker({ loadDependencies: async () => dependencies,
      logger: { log: vi.fn(), error: vi.fn() }, registerProcessHandlers: false });
    dependencies.claim.mockImplementation(async () => { void worker.shutdown(); return []; });
    await worker.start();
    expect(dependencies.claim).toHaveBeenCalledWith({ limit: 1 });
    expect(dependencies.expireFinalAttempts).toHaveBeenCalledOnce();
  });
});
