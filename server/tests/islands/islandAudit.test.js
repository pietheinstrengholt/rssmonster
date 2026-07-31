import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  query: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: { findAll: mocks.articleFindAll },
    sequelize: { query: mocks.query },
    Sequelize: { QueryTypes: { SELECT: 'SELECT' } }
  }
}));

import { appendPopulationAudit, buildPopulationAuditEntry } from '../../services/islands/islandAudit.js';

describe('island population audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(result.metrics).toEqual({ relatedArticleCount: 0, starredCount: 0, clickedCount: 0, negativeCount: 0 });
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
    expect(result.metrics).toEqual({ relatedArticleCount: 3, starredCount: 1, clickedCount: 1, negativeCount: 1 });
    expect(result.sourceArticles.articles.map(article => article.id)).toEqual([1, 2, 3]);
    expect(result.sourceArticles.starredArticleIds).toEqual([1]);
  });

  it('loads topic-related articles through the scoped join query', async () => {
    mocks.query.mockResolvedValue([{ id: 9, title: 'Topic article', favoriteInd: 0, clickedAmount: 1, negativeInd: 0 }]);

    const result = await buildPopulationAuditEntry({ userId: 4, topicIds: [11], transaction: 'tx' });

    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('a.userId = :userId'), expect.objectContaining({
      replacements: { userId: 4, topicIds: [11] },
      transaction: 'tx'
    }));
    expect(result.metrics.clickedCount).toBe(1);
    expect(result.articleIds).toEqual([]);
  });
});
