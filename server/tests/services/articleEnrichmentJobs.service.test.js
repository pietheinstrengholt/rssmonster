import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  enqueueProcessingJob: vi.fn()
}));

vi.mock('../../services/jobs/processingJobQueue.js', () => ({
  enqueueProcessingJob: mocked.enqueueProcessingJob
}));

import {
  ARTICLE_ANALYSIS_CONTRACT_VERSION,
  enqueueArticleEnrichmentJob
} from '../../services/crawl/enrichment/articleEnrichmentJobs.js';

const article = overrides => ({
  id: 123,
  userId: 42,
  title: 'Article title',
  description: 'Article description',
  contentTextHash: 'content-text-hash-v1',
  ...overrides
});

describe('article enrichment job producer', () => {
  beforeEach(() => {
    mocked.enqueueProcessingJob.mockReset();
    mocked.enqueueProcessingJob.mockResolvedValue({ created: true });
  });

  it('enqueues guarded identifiers and action-owned overrides without article content', async () => {
    const transaction = { id: 'article-transaction' };

    await enqueueArticleEnrichmentJob({
      article: article(),
      userId: 42,
      providerTags: ['AI', 'Security'],
      actionResult: { advertisementScore: 0, qualityScore: 95 },
      transaction
    });

    expect(mocked.enqueueProcessingJob).toHaveBeenCalledWith({
      type: 'article_enrichment',
      userId: 42,
      articleId: 123,
      dedupeKey: expect.stringMatching(/^article:123:analysis:1:[a-f0-9]{64}$/),
      payload: {
        articleId: 123,
        userId: 42,
        expectedContentTextHash: 'content-text-hash-v1',
        expectedAnalysisInputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        analysisContractVersion: ARTICLE_ANALYSIS_CONTRACT_VERSION,
        scoreOverrides: {
          advertisementScore: 0,
          qualityScore: 95
        }
      }
    }, { transaction });
    expect(JSON.stringify(mocked.enqueueProcessingJob.mock.calls[0])).not.toContain('Article title');
    expect(JSON.stringify(mocked.enqueueProcessingJob.mock.calls[0])).not.toContain('Article description');
  });

  it('uses title and description guards so same-content revisions receive new jobs', async () => {
    await enqueueArticleEnrichmentJob({ article: article(), userId: 42 });
    await enqueueArticleEnrichmentJob({
      article: article({ title: 'Revised title' }),
      userId: 42
    });
    await enqueueArticleEnrichmentJob({
      article: article({ description: 'Revised description' }),
      userId: 42
    });

    const jobs = mocked.enqueueProcessingJob.mock.calls.map(([job]) => job);
    expect(new Set(jobs.map(job => job.dedupeKey)).size).toBe(3);
    expect(jobs.map(job => job.payload.expectedContentTextHash)).toEqual([
      'content-text-hash-v1',
      'content-text-hash-v1',
      'content-text-hash-v1'
    ]);
  });

  it('changes the dedupe guard when the content hash changes', async () => {
    await enqueueArticleEnrichmentJob({ article: article(), userId: 42 });
    await enqueueArticleEnrichmentJob({
      article: article({ contentTextHash: 'content-text-hash-v2' }),
      userId: 42
    });

    const [first, second] = mocked.enqueueProcessingJob.mock.calls.map(([job]) => job);
    expect(second.dedupeKey).not.toBe(first.dedupeKey);
    expect(second.payload.expectedContentTextHash).toBe('content-text-hash-v2');
  });
});
