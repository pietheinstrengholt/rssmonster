import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  tagFindAll: vi.fn(),
  query: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: { findAll: mocks.articleFindAll },
    Tag: { findAll: mocks.tagFindAll },
    sequelize: { query: mocks.query },
    Sequelize: { QueryTypes: { SELECT: 'SELECT' } }
  }
}));

import { appendPopulationAudit, buildPopulationAuditEntry } from '../../services/islands/islandAudit.js';

describe('island population audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tagFindAll.mockResolvedValue([]);
  });

  it('keeps only the newest bounded audit history', () => {
    const previous = Array.from({ length: 30 }, (_, index) => ({ index }));
    const result = appendPopulationAudit(previous, { index: 30 });

    expect(result).toHaveLength(30);
    expect(result[0]).toEqual({ index: 1 });
    expect(result.at(-1)).toEqual({ index: 30 });
    expect(appendPopulationAudit(null, { index: 1 })).toEqual([{ index: 1 }]);
  });

  it('returns an empty audit without querying when there is no evidence', async () => {
    const result = await buildPopulationAuditEntry({ userId: 7 });

    expect(result.metrics).toEqual({ relatedArticleCount: 0, starredCount: 0, clickedCount: 0, positiveCount: 0, meaningfulReadCount: 0, negativeCount: 0 });
    expect(result.sourceArticles.articles).toEqual([]);
    expect(mocks.articleFindAll).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('loads explicit user-owned articles and sorts signal evidence deterministically', async () => {
    mocks.articleFindAll.mockResolvedValue([
      { id: 'bad', title: 'Ignored', favoriteInd: 1, clickedAmount: 9, negativeInd: 1 },
      { id: '3', title: 'Negative', favoriteInd: 0, clickedAmount: 0, negativeInd: 1 },
      { id: '2', title: 'Clicked', favoriteInd: 0, clickedAmount: 2, negativeInd: 0 },
      { id: '1', title: 'Starred', favoriteInd: 1, clickedAmount: 0, negativeInd: 0 }
    ]);

    const result = await buildPopulationAuditEntry({ userId: 7, articleIds: [3, 2, 1], transaction: 'tx' });

    expect(mocks.articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 7 }),
      transaction: 'tx'
    }));
    expect(result.metrics).toEqual({ relatedArticleCount: 3, starredCount: 1, clickedCount: 1, positiveCount: 0, meaningfulReadCount: 0, negativeCount: 1 });
    expect(result.sourceArticles.articles.map(article => article.id)).toEqual([1, 2, 3]);
    expect(result.sourceArticles.starredArticleIds).toEqual([1]);
  });

  it('retains explicit and reading clocks, legacy fallback, and bounded rule provenance', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();
    mocks.articleFindAll.mockResolvedValue([{ id: 1, title: 'Evidence', positiveInd: 1, attentionBucket: 4,
      positiveFeedbackAt: past, lastMeaningfulReadAt: future, publishedAt: past }]);
    mocks.tagFindAll.mockResolvedValue(Array.from({ length: 11 }, (_, id) => ({ id, articleId: 1, name: `rule-${id}`, createdAt: past })));
    const entry = await buildPopulationAuditEntry({ userId: 7, articleIds: [1] });
    expect(entry.metrics).toMatchObject({ positiveCount: 1, meaningfulReadCount: 1 });
    expect(entry.sourceArticles.positiveArticleIds).toEqual([1]);
    expect(entry.sourceArticles.meaningfulReadArticleIds).toEqual([1]);
    expect(entry.sourceArticles.articles[0]).toMatchObject({ positiveInd: 1, attentionBucket: 4,
      positiveFeedbackAt: past, lastMeaningfulReadAt: future,
      signalTimes: {
        positiveFeedbackAt: { active: true, effectiveAt: past, source: 'interaction' },
        lastMeaningfulReadAt: { active: true, effectiveAt: past, source: 'publication_fallback' }
      }, ruleProvenance: { source: 'article_rule_tags', truncated: true }
    });
    expect(entry.sourceArticles.articles[0].ruleProvenance.tags).toHaveLength(10);
  });

  it('bounds retained snapshots and IDs while retaining complete signal counts', async () => {
    mocks.articleFindAll.mockResolvedValue(Array.from({ length: 310 }, (_, id) => ({ id: id + 1, positiveInd: 1 })));
    const entry = await buildPopulationAuditEntry({ userId: 7, articleIds: Array.from({ length: 310 }, (_, id) => id + 1) });
    expect(entry.metrics).toMatchObject({ relatedArticleCount: 310, positiveCount: 310 });
    expect(entry.articleIds).toHaveLength(300);
    expect(entry.sourceArticles.articles).toHaveLength(300);
    expect(entry.sourceArticles.positiveArticleIds).toHaveLength(300);
  });

});
