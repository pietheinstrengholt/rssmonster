import { articleRecords } from '../../services/articles/articleRecords.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ analyzeArticleContent: vi.fn() }));
vi.mock('../../services/crawl/enrichment/analyzeArticleContent.js', () => ({
  default: mocked.analyzeArticleContent,
  isInferenceQueueFullError: () => false
}));

import db from '../../models/index.js';
import { requeueFailedProcessingJobs } from '../../services/jobs/processingJobOperator.js';
import { getProcessingJobStatus } from '../../services/jobs/getProcessingJobStatus.js';
import { handleArticleEnrichmentJob } from '../../services/jobs/handlers/articleEnrichmentJobHandler.js';
import { buildArticleAnalysisInputHash } from '../../services/crawl/enrichment/articleEnrichmentJobs.js';
import { countStrandedArticleAnalyses } from '../../services/jobs/strandedArticleRecovery.js';

const { Category, Feed, ProcessingJob, Tag, User } = db;
const uniqueName = () => `recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let user;
let feed;
const createOwner = async () => {
  const owner = await User.create({ username: uniqueName(), password: 'secret', feverCredentialHash: uniqueName(), role: 'user' });
  const category = await Category.create({ userId: owner.id, name: uniqueName() });
  const ownedFeed = await Feed.create({ userId: owner.id, categoryId: category.id, feedName: uniqueName(), url: `https://example.com/${uniqueName()}`, applyAiAnalysis: true });
  return { user: owner, feed: ownedFeed };
};
const createArticle = (values = {}) => articleRecords.create({
  userId: user.id, feedId: feed.id, title: uniqueName(), contentText: 'Article body',
  contentTextHash: 'body-hash', aiAnalysisStatus: 'pending', ...values
});
const createJob = (article, status, values = {}) => ProcessingJob.create({
  userId: article.userId, articleId: article.id, type: 'article_enrichment',
  dedupeKey: uniqueName(), status, availableAt: new Date(), payload: {}, ...values
});

beforeEach(async () => {
  ({ user, feed } = await createOwner());
  mocked.analyzeArticleContent.mockReset().mockResolvedValue({
    contentSummaryBullets: ['Summary'], tags: [], advertisementScore: 90, sentimentScore: 80, qualityScore: 85
  });
});

describe('stranded article recovery', () => {
  it('rebuilds stale succeeded work from current tags and completes scoring with rule overrides', async () => {
    const article = await createArticle({
      qualityScore: 95, qualityScoreActionOverrideInd: true,
      advertisementScore: 70, advertisementScoreActionOverrideInd: false
    });
    await Tag.create({ articleId: article.id, userId: user.id, name: 'openai', tagType: 'rule' });
    const oldJob = await createJob(article, 'succeeded', {
      payload: { expectedAnalysisInputHash: buildArticleAnalysisInputHash({ article, providerTags: ['openai'] }) }
    });
    const status = await getProcessingJobStatus({ userId: user.id, workerHealthReader: async () => ({ healthy: true }) });
    expect(status.summary).toMatchObject({ dead: 0, stranded: 1 });
    expect(await requeueFailedProcessingJobs({ userId: user.id })).toEqual({
      requeuedCount: 1, recoveredCount: 1, remainingCount: 0
    });
    const job = await ProcessingJob.findOne({ where: { articleId: article.id, status: 'pending' } });
    expect(job.payload.expectedAnalysisInputHash).toBe(buildArticleAnalysisInputHash({ article, providerTags: [] }));
    expect(job.payload.expectedAnalysisInputHash).not.toBe(oldJob.payload.expectedAnalysisInputHash);
    expect(job.payload.scoreOverrides).toEqual({ qualityScore: 95, advertisementScore: null });
    await expect(handleArticleEnrichmentJob(job)).resolves.toMatchObject({ status: 'completed' });
    await article.reload();
    expect(article).toMatchObject({ aiAnalysisStatus: 'complete', qualityScore: 95, advertisementScore: 90, sentimentScore: 80 });
  });

  it('recovers missing history but leaves active, completed, filtered, disabled, and foreign articles alone', async () => {
    const stranded = await createArticle({ aiAnalysisStatus: 'processing' });
    const active = await Promise.all(['pending', 'running'].map(async status => {
      const article = await createArticle();
      await createJob(article, status);
      return article;
    }));
    const completed = await createArticle({ aiAnalysisStatus: 'complete' });
    const filtered = await createArticle({ filteredInd: true });
    const disabledFeed = await Feed.create({ userId: user.id, categoryId: feed.categoryId, feedName: 'Disabled', url: `https://example.com/${uniqueName()}`, applyAiAnalysis: false });
    const disabled = await createArticle({ feedId: disabledFeed.id });
    const foreign = await createOwner();
    const foreignArticle = await createArticle({ userId: foreign.user.id, feedId: foreign.feed.id });
    expect(await requeueFailedProcessingJobs({ userId: user.id })).toMatchObject({ recoveredCount: 1, remainingCount: 0 });
    expect((await stranded.reload()).aiAnalysisStatus).toBe('pending');
    for (const article of [completed, filtered, disabled, foreignArticle]) {
      expect(await ProcessingJob.count({ where: { articleId: article.id } })).toBe(0);
    }
    for (const article of active) expect(await ProcessingJob.count({ where: { articleId: article.id } })).toBe(1);
    expect(await requeueFailedProcessingJobs({ userId: user.id })).toMatchObject({ requeuedCount: 0 });
  });

  it('limits combined dead-job retries and stranded recovery to 100 per request', async () => {
    await ProcessingJob.create({ userId: user.id, type: 'semantic_label', dedupeKey: uniqueName(), status: 'dead', availableAt: new Date(), payload: {} });
    await articleRecords.bulkCreate(Array.from({ length: 100 }, () => ({
      userId: user.id, feedId: feed.id, title: uniqueName(), aiAnalysisStatus: 'pending'
    })));
    expect(await requeueFailedProcessingJobs({ userId: user.id })).toEqual({ requeuedCount: 100, recoveredCount: 99, remainingCount: 1 });
    expect(await requeueFailedProcessingJobs({ userId: user.id })).toEqual({ requeuedCount: 1, recoveredCount: 1, remainingCount: 0 });
  }, 30_000);

  it('serializes concurrent recovery requests without duplicate jobs', async () => {
    const article = await createArticle();
    const results = await Promise.all([
      requeueFailedProcessingJobs({ userId: user.id }),
      requeueFailedProcessingJobs({ userId: user.id })
    ]);
    expect(results.reduce((sum, result) => sum + result.recoveredCount, 0)).toBe(1);
    expect(await ProcessingJob.count({ where: { articleId: article.id } })).toBe(1);
  });

  it('rolls back article state if enqueue fails', async () => {
    const article = await createArticle({ aiAnalysisStatus: 'processing' });
    const insert = vi.spyOn(ProcessingJob, 'findOrCreate').mockRejectedValue(new Error('Queue unavailable'));
    try {
      await expect(requeueFailedProcessingJobs({ userId: user.id })).rejects.toThrow('Queue unavailable');
    } finally {
      insert.mockRestore();
    }
    expect((await article.reload()).aiAnalysisStatus).toBe('processing');
    expect(await countStrandedArticleAnalyses({ userId: user.id })).toBe(1);
  });
});
