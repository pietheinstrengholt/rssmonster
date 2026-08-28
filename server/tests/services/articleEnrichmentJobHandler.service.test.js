import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  analyzeArticleContent: vi.fn()
}));

vi.mock('../../services/crawl/enrichment/analyzeArticleContent.js', () => ({
  default: mocked.analyzeArticleContent,
  isInferenceQueueFullError: error =>
    error?.code === 'INFERENCE_UNAVAILABLE' &&
    error?.inferenceErrorCode === 'inference_queue_full'
}));

import db from '../../models/index.js';
import {
  buildArticleAnalysisInputHash
} from '../../services/crawl/enrichment/articleEnrichmentJobs.js';
import {
  handleArticleEnrichmentJob
} from '../../services/jobs/handlers/articleEnrichmentJobHandler.js';
import {
  executeClaimedProcessingJob,
  getProcessingJobHandler
} from '../../services/jobs/processingJobHandlers.js';

const { Article, Category, Feed, ProcessingFailure, ProcessingJob, Tag, User } = db;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const leaseOwner = 'article-enrichment-test-worker';

const successfulAnalysis = {
  contentSummaryBullets: ['First fact', 'Second fact'],
  tags: ['Inferred Topic', 'Provider Topic'],
  advertisementScore: 81,
  sentimentScore: 72,
  qualityScore: 83
};

describe('article_enrichment processing-job handler', () => {
  let feed;
  let otherUser;

  beforeAll(async () => {
    const username = uniqueName('article-enrichment-handler-user');
    const user = await User.create({
      username,
      password: 'secret',
      feverCredentialHash: `${username}-hash`,
      role: 'user'
    });
    const category = await Category.create({
      userId: user.id,
      name: uniqueName('article-enrichment-handler-category')
    });
    feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Article enrichment handler feed',
      url: `https://example.com/${uniqueName('article-enrichment-handler-feed')}.xml`,
      feedTags: [],
      applyAiAnalysis: true
    });

    const otherUsername = uniqueName('article-enrichment-other-user');
    otherUser = await User.create({
      username: otherUsername,
      password: 'secret',
      feverCredentialHash: `${otherUsername}-hash`,
      role: 'user'
    });
  });

  beforeEach(() => {
    mocked.analyzeArticleContent.mockReset();
    mocked.analyzeArticleContent.mockResolvedValue(successfulAnalysis);
    vi.stubEnv('INFERENCE_AI_ENABLED', 'true');
    vi.stubEnv('SKIP_ARTICLE_CLASSIFICATION_ANALYSIS', 'false');
  });

  afterEach(() => vi.unstubAllEnvs());

  const createTarget = async ({
    providerTags = ['Provider Topic'],
    articleOverrides = {},
    jobOverrides = {},
    payloadOverrides = {}
  } = {}) => {
    const suffix = uniqueName('target');
    const article = await Article.create({
      userId: feed.userId,
      feedId: feed.id,
      title: `Handler article ${suffix}`,
      description: 'Handler article description',
      contentText: `Handler article body ${suffix}`,
      contentTextHash: `handler-content-hash-${suffix}`,
      aiAnalysisStatus: 'pending',
      ...articleOverrides
    });
    await Promise.all(providerTags.map(name => Tag.create({
      articleId: article.id,
      userId: feed.userId,
      name: name.toLowerCase(),
      tagType: 'provider'
    })));
    const expectedAnalysisInputHash = buildArticleAnalysisInputHash({ article, providerTags });
    const userId = jobOverrides.userId ?? feed.userId;
    const job = await ProcessingJob.create({
      type: 'article_enrichment',
      userId,
      articleId: article.id,
      dedupeKey: uniqueName(`article-enrichment-${article.id}`),
      payload: {
        articleId: article.id,
        userId,
        expectedContentTextHash: article.contentTextHash,
        expectedAnalysisInputHash,
        analysisContractVersion: 1,
        scoreOverrides: {
          advertisementScore: null,
          qualityScore: null
        },
        ...payloadOverrides
      },
      status: 'running',
      attempts: 1,
      maxAttempts: 5,
      leaseOwner,
      leaseUntil: new Date(Date.now() + 5 * 60 * 1000),
      availableAt: new Date(),
      ...jobOverrides
    });
    return { article, job, providerTags };
  };

  it('registers and transactionally persists the combined analysis contract', async () => {
    const logger = { log: vi.fn() };
    expect(getProcessingJobHandler('article_enrichment')).toBe(handleArticleEnrichmentJob);
    const { article, job } = await createTarget({
      payloadOverrides: {
        scoreOverrides: { advertisementScore: 4, qualityScore: 97 }
      }
    });
    await Promise.all([
      Tag.create({ articleId: article.id, userId: feed.userId, name: 'feed-tag', tagType: 'feed' }),
      Tag.create({ articleId: article.id, userId: feed.userId, name: 'rule-tag', tagType: 'rule' }),
      Tag.create({ articleId: article.id, userId: feed.userId, name: 'manual-tag', tagType: 'manual' }),
      Tag.create({ articleId: article.id, userId: feed.userId, name: 'legacy-tag', tagType: null }),
      Tag.create({ articleId: article.id, userId: feed.userId, name: 'old-inferred', tagType: 'inferred' })
    ]);

    await expect(executeClaimedProcessingJob(job, { logger })).resolves.toMatchObject({
      status: 'succeeded'
    });

    const persisted = await Article.findByPk(article.id);
    expect(persisted).toMatchObject({
      contentSummaryBullets: ['First fact', 'Second fact'],
      advertisementScore: 4,
      sentimentScore: 72,
      qualityScore: 97,
      aiAnalysisStatus: 'complete'
    });
    expect(persisted.aiAnalysisCompletedAt).toBeInstanceOf(Date);
    expect(await job.reload()).toMatchObject({ status: 'succeeded', leaseOwner: null });
    expect(mocked.analyzeArticleContent).toHaveBeenCalledWith({
      text: article.contentText,
      title: article.title,
      categories: ['provider topic'],
      feedName: feed.feedName,
      rateLimitDelayMs: 3000
    }, expect.objectContaining({ useQueueFullFallback: false }));

    const tags = await Tag.findAll({ where: { articleId: article.id }, order: [['name', 'ASC']] });
    expect(tags.map(tag => [tag.name, tag.tagType])).toEqual([
      ['feed-tag', 'feed'],
      ['inferred topic', 'inferred'],
      ['legacy-tag', null],
      ['manual-tag', 'manual'],
      ['provider topic', 'provider'],
      ['rule-tag', 'rule']
    ]);
    expect(logger.log).toHaveBeenCalledWith(expect.objectContaining({
      event: 'processing_job.completed',
      jobId: job.id,
      type: 'article_enrichment',
      attempt: 1,
      userId: feed.userId,
      target: { articleId: article.id },
      status: 'succeeded',
      processingLatencyMs: expect.any(Number)
    }));
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain(article.contentText);
  });

  it('treats duplicate execution of a completed version as successful and idempotent', async () => {
    const { article, job } = await createTarget();
    await executeClaimedProcessingJob(job);
    mocked.analyzeArticleContent.mockClear();
    const duplicate = await ProcessingJob.create({
      ...job.get({ plain: true }),
      id: undefined,
      dedupeKey: uniqueName('duplicate-enrichment'),
      status: 'running',
      attempts: 1,
      leaseOwner,
      leaseUntil: new Date(Date.now() + 5 * 60 * 1000),
      completedAt: null
    });

    await expect(executeClaimedProcessingJob(duplicate)).resolves.toMatchObject({
      status: 'succeeded',
      result: { status: 'obsolete', reason: 'already_complete' }
    });
    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
    expect((await Article.findByPk(article.id)).aiAnalysisStatus).toBe('complete');
  });

  it('completes a stale content-version job without overwriting the revision', async () => {
    const { article, job } = await createTarget();
    await article.update({
      title: 'Newer revised title',
      contentText: 'Newer revised body',
      contentTextHash: uniqueName('newer-content-hash'),
      aiAnalysisStatus: 'pending'
    });

    await expect(executeClaimedProcessingJob(job)).resolves.toMatchObject({
      status: 'succeeded',
      result: { status: 'obsolete', reason: 'stale_version' }
    });
    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
    const persisted = await Article.findByPk(article.id);
    expect(persisted.title).toBe('Newer revised title');
    expect(persisted.aiAnalysisStatus).toBe('pending');
  });

  it('rechecks the guarded version after inference before writing results', async () => {
    const { article, job } = await createTarget();
    let finishInference;
    mocked.analyzeArticleContent.mockImplementation(() => new Promise(resolve => {
      finishInference = resolve;
    }));

    const handling = handleArticleEnrichmentJob(job);
    await vi.waitFor(() => expect(finishInference).toBeTypeOf('function'));
    await Article.update({
      title: 'Revision committed during inference',
      contentTextHash: uniqueName('inference-race-hash'),
      aiAnalysisStatus: 'pending'
    }, { where: { id: article.id } });
    finishInference(successfulAnalysis);

    await expect(handling).resolves.toEqual({ status: 'obsolete', reason: 'stale_version' });
    const persisted = await Article.findByPk(article.id);
    expect(persisted.title).toBe('Revision committed during inference');
    expect(persisted.aiAnalysisStatus).toBe('pending');
    expect(persisted.contentSummaryBullets).toBeNull();
  });

  it('completes filtered, disabled, and deleted targets as obsolete without inference', async () => {
    const filtered = await createTarget({ articleOverrides: { filteredInd: true } });
    await expect(executeClaimedProcessingJob(filtered.job)).resolves.toMatchObject({
      status: 'succeeded',
      result: { status: 'obsolete', reason: 'article_filtered' }
    });
    expect((await filtered.article.reload()).aiAnalysisStatus).toBe('skipped');

    const disabled = await createTarget();
    await feed.update({ applyAiAnalysis: false });
    try {
      await expect(executeClaimedProcessingJob(disabled.job)).resolves.toMatchObject({
        status: 'succeeded',
        result: { status: 'obsolete', reason: 'analysis_disabled' }
      });
      expect((await disabled.article.reload()).aiAnalysisStatus).toBe('skipped');
    } finally {
      await feed.update({ applyAiAnalysis: true });
    }

    const deleted = await createTarget();
    await deleted.article.destroy();
    await deleted.job.reload();
    expect(deleted.job.articleId).toBeNull();
    await expect(executeClaimedProcessingJob(deleted.job)).resolves.toMatchObject({
      status: 'succeeded',
      result: { status: 'obsolete', reason: 'article_deleted' }
    });
    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
  });

  it('rejects a target article owned by another user', async () => {
    const { job } = await createTarget({
      jobOverrides: { userId: otherUser.id },
      payloadOverrides: { userId: otherUser.id }
    });

    await expect(handleArticleEnrichmentJob(job)).rejects.toMatchObject({
      code: 'PROCESSING_JOB_ARTICLE_OWNERSHIP',
      retryable: false
    });
    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
  });

  it('requeues inference queue saturation without writing default analysis', async () => {
    const logger = { log: vi.fn() };
    const { article, job } = await createTarget();
    mocked.analyzeArticleContent.mockRejectedValue(Object.assign(
      new Error('private article body must not be recorded'),
      {
        code: 'INFERENCE_UNAVAILABLE',
        inferenceErrorCode: 'inference_queue_full',
        requestId: 'queue-full-request'
      }
    ));

    await expect(executeClaimedProcessingJob(job, { logger })).resolves.toMatchObject({
      status: 'pending'
    });

    const persisted = await Article.findByPk(article.id);
    expect(persisted.aiAnalysisStatus).toBe('processing');
    expect(persisted.contentSummaryBullets).toBeNull();
    expect(persisted.qualityScore).not.toBe(83);
    const persistedJob = await job.reload();
    expect(persistedJob).toMatchObject({
      status: 'pending',
      lastErrorCode: 'INFERENCE_QUEUE_FULL',
      lastErrorMessage: 'Article enrichment inference queue is full'
    });
    const failure = await ProcessingFailure.findOne({
      where: { executionId: job.id },
      order: [['id', 'DESC']]
    });
    expect(JSON.stringify(failure?.context || {})).not.toContain('private article body');
    expect(failure?.message).toBe('Article enrichment inference queue is full');
    expect(logger.log).toHaveBeenCalledWith(expect.objectContaining({
      event: 'processing_job.failed',
      jobId: job.id,
      type: 'article_enrichment',
      attempt: 1,
      userId: feed.userId,
      target: { articleId: article.id },
      status: 'pending',
      errorCode: 'INFERENCE_QUEUE_FULL',
      retryable: true
    }));
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('private article body');
  });

  it('dead-letters an exhausted attempt and marks only the guarded article version failed', async () => {
    const { article, job } = await createTarget({
      jobOverrides: { attempts: 3, maxAttempts: 3 }
    });
    mocked.analyzeArticleContent.mockRejectedValue(Object.assign(new Error('provider unavailable'), {
      code: 'INFERENCE_UNAVAILABLE'
    }));

    await expect(executeClaimedProcessingJob(job)).resolves.toMatchObject({ status: 'dead' });

    expect((await job.reload()).status).toBe('dead');
    const persisted = await Article.findByPk(article.id);
    expect(persisted.aiAnalysisStatus).toBe('failed');
    expect(persisted.filteredInd).toBe(false);
    expect(persisted.status).toBe('unread');
  });

  it('renews the claimed lease while inference is still running', async () => {
    const { job } = await createTarget({
      jobOverrides: { leaseUntil: new Date(Date.now() + 2000) }
    });
    let finishInference;
    mocked.analyzeArticleContent.mockImplementation(() => new Promise(resolve => {
      finishInference = resolve;
    }));
    const originalLeaseUntil = job.leaseUntil;

    const execution = executeClaimedProcessingJob(job, {
      leaseMs: 60_000,
      heartbeatIntervalMs: 10
    });
    await vi.waitFor(() => expect(finishInference).toBeTypeOf('function'));
    await vi.waitFor(async () => {
      const runningJob = await ProcessingJob.findByPk(job.id);
      expect(runningJob.leaseUntil.getTime()).toBeGreaterThan(originalLeaseUntil.getTime());
    });
    finishInference(successfulAnalysis);

    await expect(execution).resolves.toMatchObject({ status: 'succeeded' });
  });
});
