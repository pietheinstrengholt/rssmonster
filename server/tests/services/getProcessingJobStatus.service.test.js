import { beforeEach, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import {
  deriveProcessingJobHealthStatus,
  getProcessingJobStatus,
  PROCESSING_JOB_STATUS_RECENT_FAILURE_LIMIT,
  PROCESSING_JOB_STATUS_STALLED_AGE_MS
} from '../../services/jobs/getProcessingJobStatus.js';

const { ProcessingJob, User } = db;
const NOW = new Date('2026-08-28T12:00:00.000Z');
const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

let user;
let otherUser;

const createUser = () => User.create({
  username: uniqueName('processing-status-user'),
  password: 'secret',
  feverCredentialHash: uniqueName('processing-status-hash'),
  role: 'user'
});

const healthyWorker = () => Promise.resolve({
  healthy: true,
  reason: 'healthy',
  state: {
    status: 'healthy',
    updatedAt: NOW.toISOString(),
    processingJobs: {
      enabled: true,
      status: 'healthy',
      consecutiveFailures: 0
    }
  }
});

const createJob = values => ProcessingJob.create({
  type: 'article_enrichment',
  userId: user.id,
  dedupeKey: uniqueName('processing-status-job'),
  payload: { prompt: 'never expose this', token: 'private-token' },
  status: 'pending',
  availableAt: NOW,
  ...values
});

describe('processing job status service', () => {
  beforeEach(async () => {
    [user, otherUser] = await Promise.all([createUser(), createUser()]);
  });

  it('returns owned queue counts, types, runnable age, latency, and safe failures', async () => {
    await Promise.all([
      createJob({
        type: 'article_enrichment',
        createdAt: new Date(NOW.getTime() - 120_000),
        availableAt: new Date(NOW.getTime() - 1000)
      }),
      createJob({
        type: 'semantic_label',
        attempts: 1,
        createdAt: new Date(NOW.getTime() - 3_600_000),
        availableAt: new Date(NOW.getTime() + 60_000)
      }),
      createJob({
        type: 'article_enrichment',
        status: 'running',
        attempts: 1,
        leaseOwner: 'private-worker-name',
        leaseUntil: new Date(NOW.getTime() + 60_000)
      }),
      createJob({
        type: 'article_enrichment',
        status: 'dead',
        attempts: 5,
        maxAttempts: 5,
        lastErrorCode: 'INFERENCE_TIMEOUT',
        lastErrorMessage: 'Bearer private-bearer token=private-token timed out',
        completedAt: new Date(NOW.getTime() - 2000)
      }),
      createJob({ type: 'semantic_label', status: 'cancelled' }),
      createJob({
        type: 'article_enrichment',
        status: 'succeeded',
        attempts: 1,
        startedAt: new Date(NOW.getTime() - 5000),
        completedAt: new Date(NOW.getTime() - 4000)
      }),
      createJob({
        type: 'semantic_label',
        status: 'succeeded',
        attempts: 1,
        startedAt: new Date(NOW.getTime() - 5000),
        completedAt: new Date(NOW.getTime() - 3000)
      }),
      createJob({ userId: otherUser.id, status: 'pending' })
    ]);

    const result = await getProcessingJobStatus({
      userId: user.id,
      now: NOW,
      workerHealthReader: healthyWorker
    });

    expect(result.health).toEqual({ status: 'degraded', workerRunning: true });
    expect(result.summary).toEqual({
      pending: 2,
      running: 1,
      retrying: 1,
      dead: 1,
      cancelled: 1,
      completedToday: 2,
      failedToday: 1,
      oldestPendingAgeSeconds: 120,
      averageProcessingLatencyMs: 1500
    });
    expect(result.types).toEqual([
      {
        type: 'article_enrichment',
        pending: 1,
        running: 1,
        retrying: 0,
        dead: 1,
        cancelled: 0,
        completedToday: 1,
        failedToday: 1,
        oldestPendingAgeSeconds: 120,
        averageProcessingLatencyMs: 1000
      },
      {
        type: 'semantic_label',
        pending: 1,
        running: 0,
        retrying: 1,
        dead: 0,
        cancelled: 1,
        completedToday: 1,
        failedToday: 0,
        oldestPendingAgeSeconds: null,
        averageProcessingLatencyMs: 2000
      }
    ]);
    expect(result.recentFailures).toEqual([
      expect.objectContaining({
        type: 'article_enrichment',
        attempts: 5,
        maxAttempts: 5,
        errorCode: 'INFERENCE_TIMEOUT'
      })
    ]);
    expect(result.recentFailures[0].errorMessage).not.toContain('private-bearer');
    expect(result.recentFailures[0].errorMessage).not.toContain('private-token');
    const serialized = JSON.stringify(result);
    for (const sensitiveField of ['payload', 'dedupeKey', 'leaseOwner', 'prompt']) {
      expect(serialized).not.toContain(sensitiveField);
    }
  });

  it('bounds recent failures and returns a stable empty response', async () => {
    const empty = await getProcessingJobStatus({
      userId: user.id,
      now: NOW,
      workerHealthReader: healthyWorker
    });
    expect(empty).toEqual({
      health: { status: 'healthy', workerRunning: true },
      summary: {
        pending: 0,
        running: 0,
        retrying: 0,
        dead: 0,
        cancelled: 0,
        completedToday: 0,
        failedToday: 0,
        oldestPendingAgeSeconds: null,
        averageProcessingLatencyMs: null
      },
      types: [],
      recentFailures: []
    });

    await Promise.all(Array.from({ length: 12 }, (_, index) => createJob({
      status: 'dead',
      attempts: 5,
      completedAt: new Date(NOW.getTime() - index * 1000)
    })));
    const bounded = await getProcessingJobStatus({
      userId: user.id,
      now: NOW,
      workerHealthReader: healthyWorker
    });
    expect(bounded.recentFailures).toHaveLength(PROCESSING_JOB_STATUS_RECENT_FAILURE_LIMIT);
    expect(bounded.summary.dead).toBe(12);
  });

  it('derives healthy, busy, degraded, and stalled states explicitly', () => {
    const emptySummary = {
      pending: 0,
      running: 0,
      retrying: 0,
      dead: 0,
      oldestPendingAgeSeconds: null
    };
    expect(deriveProcessingJobHealthStatus({
      summary: emptySummary,
      workerHealthy: true,
      workerRunning: true,
      now: NOW
    })).toBe('healthy');
    expect(deriveProcessingJobHealthStatus({
      summary: { ...emptySummary, pending: 2, oldestPendingAgeSeconds: 10 },
      workerHealthy: true,
      workerRunning: true,
      now: NOW
    })).toBe('busy');
    expect(deriveProcessingJobHealthStatus({
      summary: { ...emptySummary, retrying: 3 },
      workerHealthy: true,
      workerRunning: true,
      now: NOW
    })).toBe('degraded');
    expect(deriveProcessingJobHealthStatus({
      summary: { ...emptySummary, dead: 1 },
      workerHealthy: true,
      workerRunning: true,
      now: NOW
    })).toBe('degraded');
    expect(deriveProcessingJobHealthStatus({
      summary: { ...emptySummary, pending: 1, oldestPendingAgeSeconds: 1 },
      workerHealthy: false,
      workerRunning: false,
      now: NOW
    })).toBe('stalled');
    expect(deriveProcessingJobHealthStatus({
      summary: {
        ...emptySummary,
        pending: 1,
        oldestPendingAgeSeconds: PROCESSING_JOB_STATUS_STALLED_AGE_MS / 1000
      },
      workerHealthy: true,
      workerRunning: true,
      mostRecentCompletionAt: new Date(
        NOW.getTime() - PROCESSING_JOB_STATUS_STALLED_AGE_MS - 1
      ),
      now: NOW
    })).toBe('stalled');
  });
});
