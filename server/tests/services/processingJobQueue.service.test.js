import { beforeEach, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import {
  claimProcessingJobs,
  completeProcessingJob,
  deadLetterProcessingJob,
  enqueueProcessingJob,
  recoverExpiredProcessingJobs,
  renewProcessingJobLease,
  retryProcessingJob
} from '../../services/jobs/processingJobQueue.js';

const { Article, Category, Feed, ProcessingJob, User, sequelize } = db;
const NOW = new Date('2026-08-28T12:00:00.000Z');

let user;

const uniqueName = prefix =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createUser = () => User.create({
  username: uniqueName('processing-job-user'),
  password: 'secret',
  feverCredentialHash: uniqueName('processing-job-hash'),
  role: 'user'
});

const enqueue = (suffix, overrides = {}, options = {}) => enqueueProcessingJob({
  type: 'article_enrichment',
  userId: user.id,
  dedupeKey: uniqueName(suffix),
  payload: { suffix },
  availableAt: NOW,
  ...overrides
}, options);

describe('processing job queue', () => {
  beforeEach(async () => {
    user = await createUser();
  });

  it('enqueues transactionally and returns the owned duplicate', async () => {
    const dedupeKey = uniqueName('transactional-dedupe');

    await expect(sequelize.transaction(async transaction => {
      await enqueue('rolled-back', { dedupeKey }, { transaction });
      throw new Error('rollback requested');
    })).rejects.toThrow('rollback requested');
    expect(await ProcessingJob.count({ where: { userId: user.id, dedupeKey } })).toBe(0);

    const first = await enqueue('created', { dedupeKey });
    const duplicate = await enqueue('duplicate', {
      dedupeKey,
      payload: { ignored: true }
    });

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.job.id).toBe(first.job.id);
    expect(duplicate.job.userId).toBe(user.id);
    expect(duplicate.job.payload).toEqual({ suffix: 'created' });
  });

  it('rejects an article-scoped job owned by another user', async () => {
    const articleOwner = await createUser();
    const category = await Category.create({
      userId: articleOwner.id,
      name: uniqueName('processing-job-category'),
      categoryOrder: 0
    });
    const feed = await Feed.create({
      userId: articleOwner.id,
      categoryId: category.id,
      feedName: 'Processing job ownership feed',
      url: `https://example.com/${uniqueName('processing-job-feed')}.xml`
    });
    const article = await Article.create({
      userId: articleOwner.id,
      feedId: feed.id,
      title: 'Owned by another user',
      publishedAt: NOW
    });

    await expect(enqueue('foreign-article', {
      articleId: article.id
    })).rejects.toMatchObject({
      code: 'PROCESSING_JOB_ARTICLE_OWNERSHIP'
    });
    expect(await ProcessingJob.count({
      where: { userId: user.id, articleId: article.id }
    })).toBe(0);
  });

  it('claims only available work in priority order and increments attempts', async () => {
    const low = (await enqueue('low', { priority: 1 })).job;
    const high = (await enqueue('high', { priority: 10 })).job;
    await enqueue('future', {
      priority: 100,
      availableAt: new Date(NOW.getTime() + 60_000)
    });

    const claimed = await claimProcessingJobs({
      userId: user.id,
      limit: 2,
      now: NOW,
      leaseMs: 60_000,
      leaseOwner: 'worker-a'
    });
    const expectedCount = sequelize.getDialect() === 'sqlite' ? 1 : 2;

    expect(claimed).toHaveLength(expectedCount);
    expect(claimed[0]).toMatchObject({
      id: high.id,
      status: 'running',
      attempts: 1,
      leaseOwner: 'worker-a'
    });
    if (expectedCount === 2) expect(claimed[1].id).toBe(low.id);
  });

  it('claims newer jobs first within the same priority', async () => {
    const older = (await enqueue('older')).job;
    const newer = (await enqueue('newer')).job;
    await ProcessingJob.update({ createdAt: new Date(NOW.getTime() - 60_000) }, {
      where: { id: older.id },
      hooks: false,
      silent: true
    });
    await ProcessingJob.update({ createdAt: new Date(NOW.getTime() - 1_000) }, {
      where: { id: newer.id },
      hooks: false,
      silent: true
    });

    const claimed = await claimProcessingJobs({
      userId: user.id,
      limit: 2,
      now: NOW,
      leaseOwner: 'worker-newest-first'
    });

    expect(claimed[0].id).toBe(newer.id);
    if (sequelize.getDialect() !== 'sqlite') expect(claimed[1].id).toBe(older.id);
  });

  it('gives concurrent MySQL workers disjoint jobs', async () => {
    if (sequelize.getDialect() !== 'mysql') return;

    await Promise.all([
      enqueue('concurrent-one'),
      enqueue('concurrent-two'),
      enqueue('concurrent-three'),
      enqueue('concurrent-four')
    ]);

    const [workerA, workerB] = await Promise.all([
      claimProcessingJobs({
        userId: user.id,
        limit: 3,
        now: NOW,
        leaseOwner: 'worker-a'
      }),
      claimProcessingJobs({
        userId: user.id,
        limit: 3,
        now: NOW,
        leaseOwner: 'worker-b'
      })
    ]);
    const claimedIds = [...workerA, ...workerB].map(job => job.id);

    expect(claimedIds).toHaveLength(4);
    expect(new Set(claimedIds).size).toBe(4);
  });

  it('fences lease renewal and completion by user and worker ownership', async () => {
    const foreignUser = await createUser();
    await enqueue('owned');
    const [job] = await claimProcessingJobs({
      userId: user.id,
      now: NOW,
      leaseMs: 60_000,
      leaseOwner: 'worker-a'
    });

    await expect(renewProcessingJobLease({
      jobId: job.id,
      userId: foreignUser.id,
      leaseOwner: 'worker-a'
    }, { now: NOW, leaseMs: 120_000 })).resolves.toBe(false);
    await expect(completeProcessingJob({
      jobId: job.id,
      userId: user.id,
      leaseOwner: 'worker-b'
    }, { now: NOW })).resolves.toBe(false);
    await expect(renewProcessingJobLease({
      jobId: job.id,
      userId: user.id,
      leaseOwner: 'worker-a'
    }, { now: NOW, leaseMs: 120_000 })).resolves.toBe(true);
    await expect(renewProcessingJobLease({
      jobId: job.id,
      userId: user.id,
      leaseOwner: 'worker-a'
    }, { now: NOW, leaseMs: 120_000 })).resolves.toBe(true);
    await expect(completeProcessingJob({
      jobId: job.id,
      userId: user.id,
      leaseOwner: 'worker-a'
    }, { now: NOW })).resolves.toBe(true);

    await job.reload();
    expect(job).toMatchObject({
      status: 'succeeded',
      leaseOwner: null,
      leaseUntil: null,
      completedAt: NOW
    });
  });

  it('retries with bounded backoff and dead-letters the final attempt', async () => {
    await enqueue('retry', { maxAttempts: 2 });
    const [firstAttempt] = await claimProcessingJobs({
      userId: user.id,
      now: NOW,
      leaseOwner: 'worker-a'
    });

    const retry = await retryProcessingJob({
      jobId: firstAttempt.id,
      userId: user.id,
      leaseOwner: 'worker-a'
    }, Object.assign(new Error('Inference unavailable'), { code: 'INFERENCE_UNAVAILABLE' }), {
      now: NOW,
      baseDelayMs: 1000,
      maxDelayMs: 10_000,
      jitterRatio: 0.25,
      random: () => 0
    });

    expect(retry).toMatchObject({
      updated: true,
      status: 'pending',
      attempts: 1,
      availableAt: new Date(NOW.getTime() + 1000)
    });

    const retryAt = retry.availableAt;
    const [secondAttempt] = await claimProcessingJobs({
      userId: user.id,
      now: retryAt,
      leaseOwner: 'worker-b'
    });
    const terminal = await retryProcessingJob({
      jobId: secondAttempt.id,
      userId: user.id,
      leaseOwner: 'worker-b'
    }, new Error('Still unavailable'), { now: retryAt, random: () => 0 });

    expect(terminal).toMatchObject({
      updated: true,
      status: 'dead',
      availableAt: null,
      attempts: 2
    });
    await secondAttempt.reload();
    expect(secondAttempt).toMatchObject({
      status: 'dead',
      leaseOwner: null,
      leaseUntil: null,
      lastErrorMessage: 'Still unavailable',
      completedAt: retryAt
    });
  });

  it('supports immediate terminal handling for non-retryable failures', async () => {
    await enqueue('dead-letter');
    const [job] = await claimProcessingJobs({
      userId: user.id,
      now: NOW,
      leaseOwner: 'worker-a'
    });

    await expect(deadLetterProcessingJob({
      jobId: job.id,
      userId: user.id,
      leaseOwner: 'worker-a'
    }, Object.assign(new Error('Invalid payload'), { code: 'INVALID_JOB_PAYLOAD' }), {
      now: NOW
    })).resolves.toBe(true);

    await job.reload();
    expect(job).toMatchObject({
      status: 'dead',
      lastErrorCode: 'INVALID_JOB_PAYLOAD',
      lastErrorMessage: 'Invalid payload',
      completedAt: NOW
    });
  });

  it('recovers expired leases without accepting the stale worker completion', async () => {
    const expired = await ProcessingJob.create({
      type: 'article_enrichment',
      userId: user.id,
      dedupeKey: uniqueName('expired'),
      payload: {},
      status: 'running',
      attempts: 1,
      availableAt: NOW,
      leaseOwner: 'stale-worker',
      leaseUntil: new Date(NOW.getTime() - 1),
      startedAt: new Date(NOW.getTime() - 60_000)
    });

    const recovered = await recoverExpiredProcessingJobs({ now: NOW, limit: 10 });

    expect(recovered.map(job => job.id)).toContain(expired.id);
    await expect(completeProcessingJob({
      jobId: expired.id,
      userId: user.id,
      leaseOwner: 'stale-worker'
    }, { now: NOW })).resolves.toBe(false);

    const [reclaimed] = await claimProcessingJobs({
      userId: user.id,
      now: NOW,
      leaseOwner: 'recovery-worker'
    });
    expect(reclaimed).toMatchObject({
      id: expired.id,
      status: 'running',
      attempts: 2,
      leaseOwner: 'recovery-worker'
    });
  });
});
