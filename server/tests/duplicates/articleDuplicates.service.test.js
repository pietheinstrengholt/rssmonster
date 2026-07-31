import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import {
  DUPLICATE_ARTICLE_STATUS,
  findCanonicalDuplicateForArticle,
  markArticleAsDuplicate,
  repairDuplicateCounts
} from '../../services/duplicates/articleDuplicates.js';

describe('articleDuplicates', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects articles without an id or usable vector before querying candidates', async () => {
    const findAll = vi.spyOn(db.Article, 'findAll');

    await expect(findCanonicalDuplicateForArticle(null)).resolves.toBeNull();
    await expect(findCanonicalDuplicateForArticle({ id: 1, articleVector: [] })).resolves.toBeNull();
    expect(findAll).not.toHaveBeenCalled();
  });

  it('returns the strongest candidate at or above the requested threshold', async () => {
    vi.spyOn(db.Article, 'findAll').mockResolvedValue([
      { id: 1, articleVector: [0.8, 0.2] },
      { id: 2, articleVector: [1, 0] },
      { id: 3, articleVector: [0, 1] }
    ]);

    const result = await findCanonicalDuplicateForArticle({
      id: 4,
      userId: 9,
      articleVector: [1, 0]
    }, {
      threshold: 0.9,
      limit: 12
    });

    expect(result).toEqual({
      article: { id: 2, articleVector: [1, 0] },
      similarity: 1
    });
    expect(db.Article.findAll).toHaveBeenCalledWith(expect.objectContaining({
      limit: 12
    }));
  });

  it('rejects invalid and self-referential duplicate assignments', async () => {
    await expect(markArticleAsDuplicate(null, 1)).resolves.toBeNull();
    await expect(markArticleAsDuplicate({ id: 1 }, 1)).resolves.toBeNull();
  });

  it('returns an article that already has the requested duplicate state', async () => {
    const article = {
      id: 2,
      duplicateOfArticleId: 1,
      status: DUPLICATE_ARTICLE_STATUS
    };

    await expect(markArticleAsDuplicate(article, 1)).resolves.toBe(article);
  });

  it('updates a plain article record and resolves its canonical counter by id', async () => {
    const canonicalArticle = { increment: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(db.Article, 'findByPk').mockResolvedValue(canonicalArticle);
    const update = vi.spyOn(db.Article, 'update').mockResolvedValue([1]);
    const article = {
      id: 2,
      eventId: 8,
      topicId: 7,
      interestScore: 0.8
    };

    const result = await markArticleAsDuplicate(article, 1, {
      transaction: { id: 'transaction' }
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      duplicateOfArticleId: 1,
      status: DUPLICATE_ARTICLE_STATUS,
      eventId: null,
      topicId: null,
      interestScore: 0
    }), expect.objectContaining({
      where: { id: 2 }
    }));
    expect(canonicalArticle.increment).toHaveBeenCalledWith('duplicateCount', expect.objectContaining({
      by: 1
    }));
    expect(result).toMatchObject({
      id: 2,
      duplicateOfArticleId: 1,
      status: DUPLICATE_ARTICLE_STATUS
    });
  });

  it('returns null when the canonical article cannot be resolved', async () => {
    vi.spyOn(db.Article, 'findByPk').mockResolvedValue(null);

    await expect(markArticleAsDuplicate({ id: 2 }, 1)).resolves.toBeNull();
  });

  it('returns the affected row count reported by the duplicate counter repair query', async () => {
    const query = vi.spyOn(db.sequelize, 'query')
      .mockResolvedValueOnce([undefined, { affectedRows: 4 }])
      .mockResolvedValueOnce([{ changedRows: 3 }, undefined])
      .mockResolvedValueOnce([undefined, undefined]);

    await expect(repairDuplicateCounts({ transaction: { id: 'transaction' } })).resolves.toBe(4);
    await expect(repairDuplicateCounts()).resolves.toBe(3);
    await expect(repairDuplicateCounts()).resolves.toBe(0);
    expect(query).toHaveBeenCalledTimes(3);
  });
});
