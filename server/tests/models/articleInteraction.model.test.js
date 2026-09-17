import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { articleRecords } from '../../services/articles/articleRecords.js';
import { computeRecommended } from '../../services/recommendations/recommendedScore.js';

async function fixture() {
  const user = await db.User.create({ username: `interaction-${randomUUID()}`, password: 'test-password' });
  const category = await db.Category.create({ userId: user.id, name: 'Interactions' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Interactions', url: `https://example.com/${user.id}` });
  const values = { userId: user.id, feedId: feed.id, title: 'Original publisher title', contentHtml: '<p>Original</p>' };
  return { user, feed, values };
}

describe('Article and ArticleInteraction persistence', () => {
  it('stores behavior separately while preserving the flat API and independent clocks', async () => {
    const { values } = await fixture();
    const seen = new Date('2026-09-01T12:00:00Z');
    const article = await articleRecords.create({ ...values, status: 'read', firstSeen: seen, favoriteInd: 1, interestScore: 0.4 });
    const source = await db.Article.findByPk(article.id);
    const interaction = await db.ArticleInteraction.findByPk(article.id);
    expect(source.toJSON()).not.toHaveProperty('favoriteInd');
    expect(source.toJSON()).not.toHaveProperty('status');
    expect(interaction).toMatchObject({ articleId: article.id, userId: article.userId, readState: 'read', favoriteInd: 1, firstSeen: seen });
    expect(article.toJSON()).toMatchObject({ status: 'read', favoriteInd: 1, content: '<p>Original</p>' });
    expect(article.toJSON()).not.toHaveProperty('contentOriginal');
    const loaded = await articleRecords.findByPk(article.id);
    expect(loaded.toJSON()).toMatchObject({ content: '<p>Original</p>', freshness: expect.any(Number) });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    try {
      expect(computeRecommended(loaded.get({ plain: true }))).toBe(computeRecommended(loaded));
    } finally {
      clock.mockRestore();
    }
    const contentClock = source.updatedAt;
    await article.update({ status: 'unread', readAt: null, clickedAmount: 1 });
    await source.reload();
    expect(source.updatedAt).toEqual(contentClock);
    expect(article.firstSeen).toEqual(seen);
    await article.update({ title: 'Publisher revision' });
    await interaction.reload();
    expect(interaction).toMatchObject({ readState: 'unread', favoriteInd: 1, clickedAmount: 1, firstSeen: seen });
  });

  it('rolls back both records if state initialization fails', async () => {
    const { values } = await fixture();
    const transaction = await db.sequelize.transaction();
    const article = await articleRecords.create(values, { transaction });
    await transaction.rollback();
    expect(await db.Article.findByPk(article.id)).toBeNull();
    expect(await db.ArticleInteraction.findByPk(article.id)).toBeNull();
    await expect(articleRecords.create({ ...values, negativeInd: null })).rejects.toThrow();
    expect(await db.Article.count({ where: { userId: values.userId } })).toBe(0);
  });

  it('rejects cross-owner state and cascades article deletion', async () => {
    const first = await fixture();
    const second = await fixture();
    const article = await articleRecords.create(first.values);
    await expect(db.ArticleInteraction.update({ userId: second.user.id }, { where: { articleId: article.id } })).rejects.toThrow();
    expect(await articleRecords.update({ favoriteInd: 1 }, { where: { id: article.id, userId: second.user.id } })).toEqual([0]);
    await db.Article.destroy({ where: { id: article.id, userId: first.user.id } });
    expect(await db.ArticleInteraction.findByPk(article.id)).toBeNull();
  });

  it('keeps favorites during bounded cleanup and preserves read state when suppressing duplicates', async () => {
    const { values } = await fixture();
    const canonical = await articleRecords.create({ ...values, favoriteInd: 1 });
    const duplicate = await articleRecords.create({ ...values, status: 'read' });
    await duplicate.update({ duplicateOfArticleId: canonical.id, status: 'duplicate', interestScore: 0 });
    expect(duplicate.status).toBe('duplicate');
    expect((await db.ArticleInteraction.findByPk(duplicate.id)).readState).toBe('read');
    expect(await articleRecords.destroy({ where: { userId: values.userId, favoriteInd: 0 } })).toBe(1);
    expect(await articleRecords.findByPk(canonical.id)).not.toBeNull();
  });
});
