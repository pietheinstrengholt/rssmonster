import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// This suite verifies crawl job ownership, event delivery, buffering, and cleanup.
describe('crawlJobManager', () => {
  // Each test receives isolated module state and deterministic cleanup timers.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.stubEnv('CRAWL_JOB_TTL_MS', '1000');
    vi.stubEnv('CRAWL_JOB_MAX_AGE_MS', '5000');
  });

  // Timer and environment state are restored after every isolated job scenario.
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  // This test covers subscription delivery, terminal state, replay, and TTL cleanup.
  it('tracks a job through progress, completion, replay, and cleanup', async () => {
    const { default: manager } = await import('../../services/crawl/orchestration/crawlJobManager.js');
    const closeHandlers = [];
    const req = {
      on: vi.fn((event, handler) => closeHandlers.push({ event, handler }))
    };
    const res = {
      write: vi.fn(),
      end: vi.fn()
    };
    const jobId = manager.createJob(42);

    expect(manager.getJob(jobId)).toMatchObject({
      id: jobId,
      userId: 42,
      status: 'pending',
      eventCount: 0,
      subscriberCount: 0
    });
    expect(manager.getActiveJobForUser(42)).toMatchObject({ id: jobId, status: 'pending' });
    expect(manager.getActiveJobForUser(null)).toBeNull();
    expect(manager.jobCount()).toBe(1);
    expect(manager.subscribe(jobId, req, res)).toBe(true);
    expect(closeHandlers).toHaveLength(1);

    manager.publishEvent(jobId, { message: 'Crawling' });

    expect(res.write).toHaveBeenCalledWith(
      'event: progress\ndata: {"message":"Crawling"}\n\n'
    );
    expect(manager.getJob(jobId)).toMatchObject({
      status: 'running',
      eventCount: 1,
      subscriberCount: 1
    });

    manager.publishEvent(jobId, { type: 'done', processed: 3 });

    expect(res.end).toHaveBeenCalledOnce();
    expect(manager.getJob(jobId)).toMatchObject({
      status: 'done',
      eventCount: 2,
      subscriberCount: 0,
      completedAt: expect.any(Date)
    });
    expect(manager.getActiveJobForUser(42)).toBeNull();

    const replayResponse = { write: vi.fn(), end: vi.fn() };
    expect(manager.subscribe(jobId, { on: vi.fn() }, replayResponse)).toBe(true);
    expect(replayResponse.write).toHaveBeenCalledTimes(2);
    expect(replayResponse.end).toHaveBeenCalledOnce();

    closeHandlers[0].handler();
    manager.unsubscribe('missing-job', res);
    await vi.advanceTimersByTimeAsync(1000);

    expect(manager.getJob(jobId)).toBeNull();
    expect(manager.jobCount()).toBe(0);
  });

  // This test covers missing jobs and response failures without leaking subscribers.
  it('handles missing jobs and broken event streams safely', async () => {
    const { default: manager } = await import('../../services/crawl/orchestration/crawlJobManager.js');
    const missingResponse = { write: vi.fn(), end: vi.fn() };

    expect(manager.subscribe('missing-job', { on: vi.fn() }, missingResponse)).toBe(false);
    expect(missingResponse.write).toHaveBeenCalledWith(
      'event: error\ndata: {"type":"error","message":"Job not found"}\n\n'
    );
    expect(missingResponse.end).toHaveBeenCalledOnce();
    expect(manager.getJob('missing-job')).toBeNull();
    manager.publishEvent('missing-job', { type: 'progress' });

    const jobId = manager.createJob(7);
    manager.publishEvent(jobId, { type: 'progress', sequence: 1 });

    const replayFailure = {
      write: vi.fn(() => {
        throw new Error('disconnected');
      }),
      end: vi.fn()
    };
    expect(manager.subscribe(jobId, { on: vi.fn() }, replayFailure)).toBe(false);

    const liveFailure = {
      write: vi.fn(() => {
        throw new Error('disconnected');
      }),
      end: vi.fn()
    };
    expect(manager.subscribe(manager.createJob(8), { on: vi.fn() }, liveFailure)).toBe(true);
    const secondJob = manager.getActiveJobForUser(8);
    manager.publishEvent(secondJob.id, { type: 'progress' });

    expect(manager.getJob(secondJob.id).subscriberCount).toBe(0);
  });

  // This test verifies late subscribers only receive the bounded event history.
  it('keeps the most recent 500 buffered events', async () => {
    const { default: manager } = await import('../../services/crawl/orchestration/crawlJobManager.js');
    const jobId = manager.createJob(9);

    // Publish enough events to force the ring buffer to discard its oldest entry.
    for (let sequence = 0; sequence <= 500; sequence++) {
      manager.publishEvent(jobId, { type: 'progress', sequence });
    }

    const response = { write: vi.fn(), end: vi.fn() };
    expect(manager.subscribe(jobId, { on: vi.fn() }, response)).toBe(true);
    expect(manager.getJob(jobId).eventCount).toBe(500);
    expect(response.write).toHaveBeenCalledTimes(500);
    expect(response.write.mock.calls[0][0]).toContain('"sequence":1');
    expect(response.write.mock.lastCall[0]).toContain('"sequence":500');
  });

  // This test verifies the maximum age safety timer closes and removes stale jobs.
  it('removes stale jobs and tolerates subscriber close failures', async () => {
    const { default: manager } = await import('../../services/crawl/orchestration/crawlJobManager.js');
    const jobId = manager.createJob(11);
    const response = {
      write: vi.fn(),
      end: vi.fn(() => {
        throw new Error('already closed');
      })
    };
    manager.subscribe(jobId, { on: vi.fn() }, response);

    await vi.advanceTimersByTimeAsync(5000);

    expect(response.end).toHaveBeenCalledOnce();
    expect(manager.getJob(jobId)).toBeNull();
  });
});
