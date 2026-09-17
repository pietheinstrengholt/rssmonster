import { articleRecords } from '../../services/articles/articleRecords.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ analyzeArticleContent: vi.fn() }));

vi.mock('../../services/crawl/enrichment/analyzeArticleContent.js', () => ({
  default: mocked.analyzeArticleContent,
  isInferenceQueueFullError: () => false
}));

import { handleArticleEnrichmentJob } from '../../services/jobs/handlers/articleEnrichmentJobHandler.js';

import db from '../../models/index.js';
import saveArticle from '../../services/crawl/persistence/saveArticle.js';
import updateArticle, {
  applyArticleUpdate
} from '../../services/crawl/persistence/updateArticle.js';

const { Category, Feed, ProcessingJob, User } = db;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const analysis = {
  contentSummaryBullets: [],
  tags: [],
  advertisementScore: 70,
  sentimentScore: 70,
  qualityScore: 70
};

const actionResult = {
  shouldDiscard: false,
  status: 'unread',
  favoriteInd: false,
  clickedAmount: 0,
  hotInd: false,
  tags: [],
  advertisementScore: null,
  qualityScore: null
};

const articleData = (suffix, overrides = {}) => ({
  link: `https://example.com/enrichment-atomicity/${suffix}`,
  normalizedUrl: `https://example.com/enrichment-atomicity/${suffix}`,
  title: `Atomic article ${suffix}`,
  description: 'Atomic article description',
  categories: ['Provider'],
  contentOriginal: `<p>Atomic body ${suffix}</p>`,
  contentHtml: `<p>Atomic body ${suffix}</p>`,
  contentText: `Atomic body ${suffix}`,
  contentTextHash: `atomic-text-hash-${suffix}`,
  contentSourceHash: `atomic-source-hash-${suffix}`,
  language: 'en',
  aiAnalysisStatus: 'pending',
  publishedAt: new Date('2026-08-28T00:00:00Z'),
  ...overrides
});

describe('article enrichment transaction atomicity', () => {
  let feed;

  beforeAll(async () => {
    const username = uniqueName('article-enrichment-user');
    const user = await User.create({
      username,
      password: 'secret',
      feverCredentialHash: `${username}-hash`,
      role: 'user'
    });
    const category = await Category.create({
      userId: user.id,
      name: uniqueName('article-enrichment-category')
    });
    feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Article enrichment atomicity feed',
      url: `https://example.com/${uniqueName('article-enrichment-feed')}.xml`,
      feedTags: []
    });
  });

  it.each(['rule', 'feed'])('scores new articles and revisions with overlapping %s tags', async tagType => {
    const suffix = uniqueName(tagType);
    const data = articleData(suffix, { categories: ['Provider', 'OpenAI'] });
    const actions = { ...actionResult, tags: tagType === 'rule' ? ['OpenAI'] : [] };
    await feed.update({ feedTags: tagType === 'feed' ? ['OpenAI'] : [] });
    mocked.analyzeArticleContent.mockResolvedValue({ ...analysis, qualityScore: 91 });

    const { article } = await saveArticle(feed, data, analysis, actions, {}, {
      providerTags: data.categories,
      actionResult: actions
    });
    const job = await ProcessingJob.findOne({ where: { articleId: article.id } });
    await expect(handleArticleEnrichmentJob(job)).resolves.toMatchObject({ status: 'completed' });
    await article.reload();
    expect(article.aiAnalysisStatus).toBe('complete');
    expect(article.qualityScore).toBe(91);

    const revisedData = { ...data, title: 'Revised overlap article' };
    const updatePlan = await updateArticle(feed, revisedData, { article });
    await applyArticleUpdate({
      updatePlan,
      derivedValues: { aiAnalysisStatus: 'pending', aiAnalysisCompletedAt: null },
      tagUpdates: {
        providerTags: data.categories,
        feedTags: feed.feedTags,
        ruleTags: actions.tags,
        inferredTags: []
      },
      articleEnrichment: { providerTags: data.categories, actionResult: actions },
      userId: feed.userId
    });
    const jobs = await ProcessingJob.findAll({ where: { articleId: article.id } });
    expect(jobs).toHaveLength(2);
    const revisedJob = jobs.find(row => row.id !== job.id);
    await expect(handleArticleEnrichmentJob(revisedJob)).resolves.toMatchObject({ status: 'completed' });
    await article.reload();
    expect(article.aiAnalysisStatus).toBe('complete');
    expect(article.qualityScore).toBe(91);
    expect(mocked.analyzeArticleContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ categories: ['provider'] }),
      expect.any(Object)
    );
  });

  it('rolls back a new article when its enrichment job cannot be inserted', async () => {
    const suffix = uniqueName('new');
    const data = articleData(suffix);
    const queueError = new Error('Queue insert failed');
    const findOrCreate = vi.spyOn(ProcessingJob, 'findOrCreate').mockRejectedValue(queueError);

    await expect(saveArticle(feed, data, analysis, actionResult, {}, {
      providerTags: data.categories,
      actionResult
    })).rejects.toBe(queueError);

    findOrCreate.mockRestore();
    expect(await articleRecords.findOne({ where: { url: data.link } })).toBeNull();
  });

  it('rolls back a revision when its versioned enrichment job cannot be inserted', async () => {
    const suffix = uniqueName('revision');
    const originalData = articleData(suffix, { aiAnalysisStatus: 'complete' });
    const saved = await saveArticle(feed, originalData, analysis, actionResult);
    const revisedData = articleData(suffix, {
      title: 'Revised atomic title',
      contentText: 'Revised atomic body',
      contentTextHash: `${originalData.contentTextHash}-v2`
    });
    const updatePlan = await updateArticle(feed, revisedData, { article: saved.article });
    const queueError = new Error('Revision queue insert failed');
    const findOrCreate = vi.spyOn(ProcessingJob, 'findOrCreate').mockRejectedValue(queueError);

    await expect(applyArticleUpdate({
      updatePlan,
      derivedValues: { aiAnalysisStatus: 'pending' },
      articleEnrichment: {
        providerTags: revisedData.categories,
        actionResult
      },
      userId: feed.userId
    })).rejects.toBe(queueError);

    findOrCreate.mockRestore();
    const persisted = await articleRecords.findByPk(saved.article.id);
    expect(persisted.title).toBe(originalData.title);
    expect(persisted.contentTextHash).toBe(originalData.contentTextHash);
    expect(persisted.aiAnalysisStatus).toBe('complete');
    expect(await ProcessingJob.count({ where: { articleId: saved.article.id } })).toBe(0);
  });
});
