import { beforeAll, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ analyzeArticleContent: vi.fn() }));

vi.mock('../../services/crawl/enrichment/analyzeArticleContent.js', () => ({
  default: mocked.analyzeArticleContent,
  isInferenceQueueFullError: () => false
}));

import { handleArticleEnrichmentJob } from '../../services/jobs/handlers/articleEnrichmentJobHandler.js';

import db from '../../models/index.js';
import saveArticle from '../../services/crawl/persistence/saveArticle.js';
import updateArticle from '../../services/crawl/persistence/updateArticle.js';
import processArticleRevision from '../../services/crawl/orchestration/processArticleRevision.js';

const { Article, Category, Event, Feed, ProcessingJob, Tag, User } = db;

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

const revise = async (feed, article, data, actions = actionResult) => {
  const updatePlan = await updateArticle(feed, data, { article });
  return processArticleRevision({ feed, updatePlan,
    candidate: { articleData: data, actionArticle: {}, hotlinkUrls: [] },
    precomputedActionResult: actions, preloadedActions: [], hotlinkBatcher: { add() {} }
  });
};

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

  it.each(['rule', 'feed'])('preserves completed analysis through revisions with overlapping %s tags', async tagType => {
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

    const completedAt = article.aiAnalysisCompletedAt;
    const provenance = article.aiAnalysisProvenance;
    expect(provenance).toMatchObject({ inputHash: job.payload.expectedAnalysisInputHash,
      contentTextHash: data.contentTextHash, contractVersion: 1 });
    await ProcessingJob.destroy({ where: { articleId: article.id } });
    mocked.analyzeArticleContent.mockClear();
    for (const title of ['First publisher correction', 'Second publisher correction']) {
      const result = await revise(feed, article, { ...data, title,
        contentText: `Corrected body: ${title}`, contentTextHash: `corrected-hash-${title}` },
        { ...actions, qualityScore: 1, advertisementScore: 1 });
      expect(result).toMatchObject({ newArticles: 0, updatedArticles: 1 });
      await article.reload();
      expect(article).toMatchObject({ title, aiAnalysisStatus: 'complete', qualityScore: 91,
        aiAnalysisProvenance: provenance, aiAnalysisCompletedAt: completedAt });
      expect(article.contentTextHash).not.toBe(provenance.contentTextHash);
      expect(await ProcessingJob.count({ where: { articleId: article.id } })).toBe(0);
    }
    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
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
    expect(await Article.findOne({ where: { url: data.link } })).toBeNull();
  });

  it.each(['content', 'description', 'title'])('preserves all retained state on a %s revision and leaves legacy provenance unknown', async kind => {
    const suffix = uniqueName(kind);
    const data = articleData(suffix, { aiAnalysisStatus: 'complete' });
    const { article } = await saveArticle(feed, data, { ...analysis, tags: ['inferred-topic'],
      contentSummaryBullets: ['Previously analyzed fact'] }, actionResult);
    const supportingArticle = await Article.create({ userId: feed.userId, feedId: feed.id,
      title: 'Other reporting', publishedAt: data.publishedAt });
    const event = await Event.create({ userId: feed.userId, representativeArticleId: article.id,
      developingArticleId: supportingArticle.id, articleCount: 2 });
    await supportingArticle.update({ eventId: event.id });
    const clock = new Date('2026-08-28T12:00:00Z');
    const retained = { eventId: event.id, aiAnalysisCompletedAt: clock, aiAnalysisProvenance: null,
      articleVector: [1, 0], embedding_model: 'test-model', interestScore: 0.5,
      status: 'read', readAt: clock, favoriteInd: 1, favoritedAt: clock,
      clickedAmount: 2, lastClickedAt: clock, positiveInd: 1, positiveFeedbackAt: clock,
      negativeInd: 0, negativeFeedbackAt: null, firstSeen: clock,
      attentionBucket: 3, lastMeaningfulReadAt: clock, interestScoredAt: clock };
    await article.update(retained);
    const changes = kind === 'content'
      ? { contentOriginal: '<p>Corrected body</p>', contentHtml: '<p>Corrected body</p>',
          contentText: 'Corrected body', contentTextHash: 'corrected-text-hash', contentSourceHash: 'corrected-source-hash' }
      : { [kind]: 'Corrected publisher text' };
    await revise(feed, article, { ...data, ...changes });
    await article.reload();
    expect(article).toMatchObject(changes);
    await event.reload();
    expect(event).toMatchObject({ representativeArticleId: article.id, developingArticleId: supportingArticle.id, articleCount: 2 });
    expect(article).toMatchObject({ ...retained, aiAnalysisStatus: 'complete',
      contentSummaryBullets: ['Previously analyzed fact'], qualityScore: 70,
      sentimentScore: 70, advertisementScore: 70 });
    expect(await Tag.count({ where: { articleId: article.id, tagType: 'inferred', name: 'inferred-topic' } })).toBe(1);
    expect(await ProcessingJob.count({ where: { articleId: article.id } })).toBe(0);
  });

  it('does not replace pending analysis when a publisher correction makes its job stale', async () => {
    const data = articleData(uniqueName('pending-revision'));
    const { article } = await saveArticle(feed, data, analysis, actionResult, {}, { actionResult });
    const job = await ProcessingJob.findOne({ where: { articleId: article.id } });
    mocked.analyzeArticleContent.mockClear();
    await revise(feed, article, { ...data, title: 'Corrected pending title' });
    await expect(handleArticleEnrichmentJob(job)).resolves.toMatchObject({ status: 'obsolete', reason: 'stale_version' });
    await article.reload();
    expect(article).toMatchObject({ aiAnalysisStatus: 'pending', aiAnalysisProvenance: null });
    expect(await ProcessingJob.count({ where: { articleId: article.id } })).toBe(1);
    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
  });
});
