import { beforeEach, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import {
  loadProcessingJobOperationalSnapshot
} from '../../services/jobs/processingJobObservability.js';
import {
  listDeadProcessingJobs,
  requeueDeadProcessingJobs
} from '../../services/jobs/processingJobOperator.js';

const { ProcessingJob, User } = db;
const NOW = new Date('2026-08-28T12:00:00.000Z');
const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

let user;
let otherUser;

const createUser = () => User.create({
  username: uniqueName('processing-operations-user'),
  password: 'secret',
  feverCredentialHash: uniqueName('processing-operations-hash'),
  role: 'user'
});

const createJob = values => ProcessingJob.create({
  type: 'article_enrichment',
  userId: user.id,
  dedupeKey: uniqueName('operations-job'),
  payload: { articleId: 123, privateText: 'must-not-be-returned' },
  availableAt: NOW,
  ...values
});

describe('processing job operational services', () => {
  beforeEach(async () => {
    [user, otherUser] = await Promise.all([createUser(), createUser()]);
  });

  it('reports queue depth, retries, terminal counts, and bounded latency', async () => {
    const before = await loadProcessingJobOperationalSnapshot({ now: NOW });
    await Promise.all([
      createJob({ type: 'article_enrichment', status: 'pending', attempts: 0 }),
      createJob({ type: 'semantic_label', status: 'pending', attempts: 1 }),
      createJob({
        status: 'running',
        attempts: 1,
        leaseOwner: 'worker-a',
        leaseUntil: new Date(NOW.getTime() + 60_000)
      }),
      createJob({
        status: 'succeeded',
        attempts: 1,
        startedAt: new Date(NOW.getTime() - 2000),
        completedAt: new Date(NOW.getTime() - 1000)
      }),
      createJob({
        status: 'dead',
        attempts: 5,
        startedAt: new Date(NOW.getTime() - 4000),
        completedAt: new Date(NOW.getTime() - 1000)
      })
    ]);

    const snapshot = await loadProcessingJobOperationalSnapshot({ now: NOW });

    expect(snapshot.event).toBe('processing_jobs.snapshot');
    expect(snapshot.pendingByType.article_enrichment)
      .toBe((before.pendingByType.article_enrichment || 0) + 1);
    expect(snapshot.pendingByType.semantic_label)
      .toBe((before.pendingByType.semantic_label || 0) + 1);
    expect(snapshot.runningCount).toBe(before.runningCount + 1);
    expect(snapshot.retryCount).toBe(before.retryCount + 1);
    expect(snapshot.deadJobCount).toBe(before.deadJobCount + 1);
    expect(snapshot.completionCount).toBe(before.completionCount + 1);
    expect(snapshot.failureCount).toBeGreaterThanOrEqual(before.failureCount);
    expect(snapshot.processingLatencyMs).toMatchObject({
      sampleSize: expect.any(Number),
      average: expect.any(Number),
      maximum: expect.any(Number)
    });
    expect(snapshot.oldestPendingJobAgeMs).toBeGreaterThanOrEqual(0);
  });

  it('lists one owned bounded dead-job set without returning payloads', async () => {
    const owned = await createJob({
      status: 'dead',
      attempts: 5,
      lastErrorCode: 'INFERENCE_UNAVAILABLE',
      lastErrorMessage: 'Inference unavailable',
      completedAt: NOW
    });
    await createJob({
      userId: otherUser.id,
      status: 'dead',
      attempts: 5,
      completedAt: NOW
    });

    const jobs = await listDeadProcessingJobs({
      userId: user.id,
      jobIds: [owned.id],
      limit: 10
    });

    expect(jobs).toEqual([expect.objectContaining({
      id: owned.id,
      userId: user.id,
      status: 'dead',
      target: { articleId: 123 }
    })]);
    expect(JSON.stringify(jobs)).not.toContain('privateText');
    await expect(listDeadProcessingJobs({ userId: user.id, limit: 101 }))
      .rejects.toThrow(/between 1 and 100/);
  });

  it('requeues only explicit dead-job IDs for the selected owner', async () => {
    const owned = await createJob({
      status: 'dead',
      attempts: 5,
      completedAt: NOW,
      lastErrorCode: 'INFERENCE_UNAVAILABLE'
    });
    const foreign = await createJob({
      userId: otherUser.id,
      status: 'dead',
      attempts: 5,
      completedAt: NOW
    });

    await expect(requeueDeadProcessingJobs({ userId: user.id, jobIds: [] }))
      .rejects.toThrow(/explicit processing job IDs/);
    const result = await requeueDeadProcessingJobs({
      userId: user.id,
      jobIds: [owned.id, foreign.id],
      availableAt: NOW
    });

    expect(result).toMatchObject({ requestedCount: 2, requeuedCount: 1 });
    expect(await owned.reload()).toMatchObject({
      status: 'pending',
      attempts: 0,
      lastErrorCode: null,
      startedAt: null,
      completedAt: null
    });
    expect((await foreign.reload()).status).toBe('dead');
  });
});
