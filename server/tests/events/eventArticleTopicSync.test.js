import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { syncEventTopicsToArticles } from '../../services/events/eventArticleTopicSync.js';

describe('syncEventTopicsToArticles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns without writes when an event has no canonical articles', async () => {
    vi.spyOn(db.Article, 'findAll').mockResolvedValue([]);
    const destroy = vi.spyOn(db.ArticleTopic, 'destroy');
    const update = vi.spyOn(db.Article, 'update');

    await expect(syncEventTopicsToArticles(99, [])).resolves.toBe(0);
    expect(destroy).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('replaces event-owned topic rows and mirrors the primary topic', async () => {
    vi.spyOn(db.Article, 'findAll').mockResolvedValue([{ id: 11 }, { id: 12 }]);
    const destroy = vi.spyOn(db.ArticleTopic, 'destroy').mockResolvedValue(2);
    const bulkCreate = vi.spyOn(db.ArticleTopic, 'bulkCreate').mockResolvedValue([]);
    const update = vi.spyOn(db.Article, 'update').mockResolvedValue([2]);
    const transaction = { id: 'transaction' };

    const count = await syncEventTopicsToArticles(5, [
      { topicId: 7, confidence: 0.95, primaryInd: true },
      { topicId: 8, confidence: 0.75 }
    ], transaction);

    expect(count).toBe(2);
    expect(destroy).toHaveBeenCalledOnce();
    expect(bulkCreate).toHaveBeenCalledWith([
      { articleId: 11, topicId: 7, confidence: 0.95, rank: 1, primaryInd: true },
      { articleId: 11, topicId: 8, confidence: 0.75, rank: 2, primaryInd: false },
      { articleId: 12, topicId: 7, confidence: 0.95, rank: 1, primaryInd: true },
      { articleId: 12, topicId: 8, confidence: 0.75, rank: 2, primaryInd: false }
    ], { transaction });
    expect(update).toHaveBeenCalledWith(
      { topicId: 7 },
      expect.objectContaining({ transaction })
    );
  });
});
