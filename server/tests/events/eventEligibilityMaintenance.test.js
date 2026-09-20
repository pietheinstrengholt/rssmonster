import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { prepareArticleEventRemoval, reconcileTouchedEvents } from '../../services/events/eventReconciliation.js';
import { assignArticleToExistingEvent } from '../../services/events/updateEvents.js';
import { applyArticleUpdate } from '../../services/crawl/persistence/updateArticle.js';
import { markArticleAsDuplicate } from '../../services/duplicates/articleDuplicates.js';
import { removeFeedSubscription } from '../../services/feeds/feedManagement.js';
import cleanupController from '../../controllers/cleanup.js';
import categoryController from '../../controllers/category.js';

async function fixture(count = 3) {
  const user = await db.User.create({ username: `event-maintenance-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Removal' });
  const otherCategory = await db.Category.create({ userId: user.id, name: 'Keep' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Removal', url: `https://${user.id}.example/a` });
  const otherFeed = await db.Feed.create({ userId: user.id, categoryId: otherCategory.id, feedName: 'Keep', url: `https://${user.id}.example/b` });
  const articles = [];
  for (let index = 0; index < count; index++) articles.push(await db.Article.create({ userId: user.id,
    feedId: index ? otherFeed.id : feed.id, title: `Occurrence ${index}`, status: 'unread', favoriteInd: index ? 1 : 0,
    createdAt: new Date(Date.now() - (index ? 0 : 10 * 86400000)),
    publishedAt: new Date('2026-09-17T00:00:00Z'), articleVector: [1, index / 10], embedding_model: 'test-model' }));
  const event = await db.Event.create({ userId: user.id, representativeArticleId: articles[0].id,
    developingArticleId: articles[0].id, articleCount: count, name: 'Occurrence', embedding_model: 'test-model', eventVector: [1, 0] });
  await db.Article.update({ eventId: event.id }, { where: { id: articles.map(article => article.id) } });
  for (const article of articles) await article.reload();
  return { user, category, feed, otherFeed, articles, event };
}
const response = () => {
  const res = { status: vi.fn(), json: vi.fn(), send: vi.fn() };
  for (const fn of Object.values(res)) fn.mockReturnValue(res);
  return res;
};

describe('Event eligibility maintenance', () => {
  it('dissolves a singleton, clears assignments and preserves Article state', async () => {
    const { user, articles: [article], event } = await fixture(1);
    await article.update({ favoriteInd: 1, clickedAmount: 2, interestScore: 0.3 });
    const result = await reconcileTouchedEvents(user.id, [event.id]);
    await article.reload();
    expect(await db.Event.findByPk(event.id)).toBeNull();
    expect(article).toMatchObject({ eventId: null, status: 'unread', favoriteInd: 1, clickedAmount: 2 });
    expect(Number(article.interestScore)).toBe(0.3);
    expect(result.articlesByEventId[event.id]).toEqual([]);
  });

  it.each(['filtered', 'duplicate', 'detached', 'foreign'])('repairs a %s representative from eligible members and clears invalid assignments', async kind => {
    const { user, articles, event } = await fixture();
    const [invalid, first, second] = articles;
    if (kind === 'filtered') await invalid.update({ filteredInd: true });
    if (kind === 'duplicate') await invalid.update({ duplicateOfArticleId: first.id, status: 'duplicate' });
    if (kind === 'detached') await invalid.update({ eventId: null });
    if (kind === 'foreign') {
      const foreign = await fixture(2);
      await invalid.update({ eventId: null });
      await event.update({ representativeArticleId: foreign.articles[0].id });
    }
    await reconcileTouchedEvents(user.id, [event.id]); await event.reload(); await invalid.reload();
    expect(event).toMatchObject({ representativeArticleId: first.id, developingArticleId: first.id, articleCount: 2 });
    expect(invalid.eventId).toBeNull();
    expect(event.eventVector).toEqual([1, 0.15000000000000002]);
    // A valid later representative remains stable even though an earlier member exists.
    await event.update({ representativeArticleId: second.id });
    await reconcileTouchedEvents(user.id, [event.id]); await event.reload();
    expect(event.representativeArticleId).toBe(second.id);
  });

  it('maintains membership within publisher-rule filtering, without another assignment pass', async () => {
    const { user, articles, event } = await fixture();
    for (const article of articles.slice(0, 2)) {
      await applyArticleUpdate({ userId: user.id, updatePlan: { article, updateValues: {} }, derivedValues: { filteredInd: true } });
    }
    expect(await db.Event.findByPk(event.id)).toBeNull();
    for (const article of articles) { await article.reload(); expect(article.eventId).toBeNull(); }
    expect(articles[2]).toMatchObject({ filteredInd: false, favoriteInd: 1 });
  });

  it('dissolves the old pair atomically when a member becomes a duplicate', async () => {
    const { articles, event } = await fixture(2);
    await markArticleAsDuplicate(articles[0], articles[1]);
    expect(await db.Event.findByPk(event.id)).toBeNull();
    await articles[1].reload();
    expect(articles[1]).toMatchObject({ eventId: null, favoriteInd: 1, duplicateCount: 1 });
  });

  it.each(['feed', 'category', 'cleanup'])('repairs the representative before %s deletion can cascade away a valid Event', async mode => {
    const { user, category, feed, articles, event } = await fixture();
    if (mode === 'feed') await removeFeedSubscription({ userId: user.id, feedId: feed.id });
    else {
      const res = response();
      if (mode === 'cleanup') {
        await db.ArchivingSetting.create({ userId: user.id, maximumArticleAge: 7, maximumArticleAgeUnit: 'days' });
        await articles[0].update({ status: 'read' });
        await cleanupController.cleanup({ userData: { userId: user.id } }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ deletedCount: 1 }));
      } else {
        await categoryController.deleteCategory({ userData: { userId: user.id }, params: { categoryId: category.id } }, res);
        expect(res.status).toHaveBeenCalledWith(204);
      }
    }
    await event.reload();
    expect(await db.Article.findByPk(articles[0].id)).toBeNull();
    expect(event).toMatchObject({ representativeArticleId: articles[1].id, developingArticleId: articles[1].id, articleCount: 2, sourceCount: 1 });
  });

  it('rolls back dissolution, assignments and deletion together', async () => {
    const { user, articles, event } = await fixture(2);
    await expect(db.sequelize.transaction(async transaction => {
      await prepareArticleEventRemoval(user.id, { id: articles[0].id }, transaction);
      await articles[0].destroy({ transaction });
      throw new Error('abort removal');
    })).rejects.toThrow('abort removal');
    await event.reload();
    expect(event.representativeArticleId).toBe(articles[0].id);
    for (const article of articles) { await article.reload(); expect(article.eventId).toBe(event.id); }
  });

  it('keeps membership when an Article becomes favorited during cleanup selection', async () => {
    const { user, articles: [article], event } = await fixture();
    await db.ArchivingSetting.create({ userId: user.id, maximumArticleAge: 7, maximumArticleAgeUnit: 'days' });
    await article.update({ status: 'read' });
    const findEvents = db.Event.findAll.bind(db.Event);
    const boundary = vi.spyOn(db.Event, 'findAll').mockImplementationOnce(async options => {
      // Selection has read the old flag, but the removal transaction has not locked it yet.
      await article.update({ favoriteInd: 1 });
      return findEvents(options);
    });
    try {
      const res = response();
      await cleanupController.cleanup({ userData: { userId: user.id } }, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ deletedCount: 0 }));
      await article.reload(); await event.reload();
      expect(article).toMatchObject({ status: 'read', favoriteInd: 1, eventId: event.id });
      expect(event).toMatchObject({ representativeArticleId: article.id, articleCount: 3 });
    } finally { boundary.mockRestore(); }
  });

  it('maintains membership after a concurrent assignment commits', async () => {
    const { user, otherFeed, event, articles: [representative] } = await fixture(1);
    const incoming = await db.Article.create({ userId: user.id, feedId: otherFeed.id, title: 'Occurrence 0',
      publishedAt: representative.publishedAt, articleVector: [1, 0], embedding_model: 'test-model' });
    const transaction = await db.sequelize.transaction();
    let removal;
    try {
      await assignArticleToExistingEvent({ article: incoming, articleEventVector: incoming.articleVector, bestEvent: event, cache: null, transaction });
      removal = applyArticleUpdate({ userId: user.id, updatePlan: { article: incoming, updateValues: {} }, derivedValues: { filteredInd: true } });
      await new Promise(resolve => setImmediate(resolve));
      await transaction.commit();
      await removal;
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      await removal?.catch(() => {});
      throw error;
    }
    expect(await db.Event.findByPk(event.id)).toBeNull();
    await incoming.reload(); await representative.reload();
    expect(incoming).toMatchObject({ eventId: null, filteredInd: true });
    expect(representative.eventId).toBeNull();
  });
});
