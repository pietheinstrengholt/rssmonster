import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAiWorkerHealthReporter,
  evaluateAiWorkerHealth,
  readAiWorkerHealthState
} from '../../src/workers/aiWorkerHealth.js';

const directories = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('AI worker health', () => {
  it('persists and evaluates dedicated worker health', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-ai-health-'));
    directories.push(directory);
    const filePath = path.join(directory, 'health.json');
    const now = new Date('2026-08-28T12:00:00.000Z');
    const reporter = createAiWorkerHealthReporter({ filePath, now: () => now });
    await reporter({ status: 'paused', consecutiveFailures: 0 });

    await expect(readAiWorkerHealthState({
      environment: { AI_WORKER_HEALTH_FILE: filePath },
      now: now.getTime()
    })).resolves.toMatchObject({
      healthy: true,
      reason: 'paused',
      state: { status: 'paused', consecutiveFailures: 0 }
    });
  });

  it('rejects stale, stopping, and repeatedly failing state', () => {
    const now = Date.parse('2026-08-28T12:00:00.000Z');
    const state = {
      status: 'healthy',
      consecutiveFailures: 0,
      updatedAt: '2026-08-28T11:59:00.000Z'
    };
    expect(evaluateAiWorkerHealth(state, { now }).healthy).toBe(true);
    expect(evaluateAiWorkerHealth(state, { now, maxStaleMs: 1000 }).healthy).toBe(false);
    expect(evaluateAiWorkerHealth({ ...state, status: 'stopping' }, { now }).healthy).toBe(false);
    expect(evaluateAiWorkerHealth({ ...state, consecutiveFailures: 3 }, { now }).healthy)
      .toBe(false);
  });
});
