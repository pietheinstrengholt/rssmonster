import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkCrawlWorkerHealth,
  createCrawlWorkerHealthReporter,
  evaluateCrawlWorkerHealth,
  getCrawlWorkerHealthConfig
} from '../../src/workers/crawlWorkerHealth.js';

const temporaryDirectories = [];

describe('crawl worker health', () => {
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory => (
      rm(directory, { recursive: true, force: true })
    )));
  });

  it('validates configurable health thresholds', () => {
    expect(getCrawlWorkerHealthConfig({})).toMatchObject({
      maxFailures: 3,
      maxStaleMs: 900_000
    });
    expect(getCrawlWorkerHealthConfig({
      CRAWL_WORKER_HEALTH_MAX_FAILURES: '5',
      CRAWL_WORKER_HEALTH_MAX_STALE_MS: '120000'
    })).toMatchObject({ maxFailures: 5, maxStaleMs: 120_000 });
    expect(() => getCrawlWorkerHealthConfig({
      CRAWL_WORKER_HEALTH_MAX_FAILURES: '0'
    })).toThrow(/positive integer/);
  });

  it('rejects stale, repeatedly failing, and invalid worker states', () => {
    const now = Date.parse('2026-08-21T12:15:00.000Z');
    const state = {
      status: 'healthy',
      consecutiveFailures: 0,
      updatedAt: '2026-08-21T12:14:00.000Z'
    };

    expect(evaluateCrawlWorkerHealth(state, { now })).toEqual({
      healthy: true,
      reason: 'healthy'
    });
    expect(evaluateCrawlWorkerHealth(state, { now, maxStaleMs: 30_000 }).healthy)
      .toBe(false);
    expect(evaluateCrawlWorkerHealth({
      ...state,
      status: 'degraded',
      consecutiveFailures: 3
    }, { now }).reason).toMatch(/consecutive crawl failures/);
    expect(evaluateCrawlWorkerHealth({ ...state, status: 'stopping' }, { now }).healthy)
      .toBe(false);
  });

  it('atomically persists and reads the worker state', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-worker-health-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'health.json');
    const now = new Date('2026-08-21T12:00:00.000Z');
    const reporter = createCrawlWorkerHealthReporter({ filePath, now: () => now });

    await reporter({ status: 'healthy', consecutiveFailures: 0 });

    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({
      status: 'healthy',
      consecutiveFailures: 0,
      updatedAt: now.toISOString()
    });
    await expect(checkCrawlWorkerHealth({
      environment: {
        CRAWL_WORKER_HEALTH_FILE: filePath,
        CRAWL_WORKER_HEALTH_MAX_STALE_MS: '60000'
      },
      now: now.getTime()
    })).resolves.toEqual({ healthy: true, reason: 'healthy' });
  });
});
