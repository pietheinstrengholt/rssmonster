import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';
import { reconcileTouchedEvents } from '../../services/events/eventReconciliation.js';
import { assignArticleToExistingEvent } from '../../services/events/updateEvents.js';

const { sequelize, Article, Category, Event, Feed, User } = db;

async function createUserGraph(prefix) {
  const hash = await bcrypt.hash('secret', 4);
  const user = await User.create({
    username: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    password: 'secret',
    hash,
    role: 'user'
  });

  const category = await Category.create({
    userId: user.id,
    name: `${prefix} category`,
    categoryOrder: 0
  });

  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: `${prefix} feed`,
    url: `https://example.com/${prefix}-${user.id}.xml`
  });

  return { user, feed };
}

async function createArticle(user, feed, index, overrides = {}) {
  return Article.create({
    userId: user.id,
    feedId: feed.id,
    title: `${user.username} article ${index}`,
    url: `https://example.com/${user.username}/article-${index}`,
    publishedAt: new Date(`2026-05-${20 + index}T10:00:00.000Z`),
    articleVector: [1, index / 10, 0],
    ...overrides
  });
}

async function createEvent(user, representativeArticle, overrides = {}) {
  return Event.create({
    userId: user.id,
    representativeArticleId: representativeArticle.id,
    name: `${user.username} event`,
    articleCount: 1,
    sourceCount: 1,
    eventStrength: 0.4,
    eventVector: [0, 1, 0],
    eventWindowStartAt: new Date('2026-05-20T10:00:00.000Z'),
    eventWindowEndAt: new Date('2026-05-20T10:00:00.000Z'),
    status: 'active',
    ...overrides
  });
}

describe('reconcileTouchedEvents', () => {
  it('scopes touched events and event articles to the requested user', async () => {
    const owner = await createUserGraph('owner');
    const foreign = await createUserGraph('foreign');

    const ownerArticle = await createArticle(owner.user, owner.feed, 1);
    const ownerEvent = await createEvent(owner.user, ownerArticle, {
      articleCount: 99,
      sourceCount: 99
    });
    await ownerArticle.update({ eventId: ownerEvent.id });

    const foreignRepresentative = await createArticle(foreign.user, foreign.feed, 1);
    const foreignEvent = await createEvent(foreign.user, foreignRepresentative, {
      articleCount: 7,
      sourceCount: 7,
      eventStrength: 0.7
    });
    await foreignRepresentative.update({ eventId: foreignEvent.id });

    const result = await reconcileTouchedEvents(owner.user.id, [
      ownerEvent.id,
      foreignEvent.id
    ]);

    await ownerEvent.reload();
    await foreignEvent.reload();

    expect(result.articlesByEventId[ownerEvent.id]).toHaveLength(1);
    expect(result.articlesByEventId[foreignEvent.id]).toBeUndefined();
    expect(ownerEvent.articleCount).toBe(1);
    expect(ownerEvent.sourceCount).toBe(1);
    expect(foreignEvent.articleCount).toBe(7);
    expect(foreignEvent.sourceCount).toBe(7);
    expect(foreignEvent.eventStrength).toBe(0.7);
  });

  it('keeps a valid unread developing article during reconciliation', async () => {
    const { user, feed } = await createUserGraph('sticky-reconciliation');
    const currentArticle = await createArticle(user, feed, 1, { status: 'unread' });
    const newerArticle = await createArticle(user, feed, 2, { status: 'unread' });
    const event = await createEvent(user, currentArticle, {
      developingArticleId: currentArticle.id,
      articleCount: 2
    });
    await Article.update(
      { eventId: event.id },
      { where: { id: [currentArticle.id, newerArticle.id] } }
    );

    await reconcileTouchedEvents(user.id, [event.id]);
    await event.reload();

    expect(event.developingArticleId).toBe(currentArticle.id);
  });

  it('keeps a valid read developing article during reconciliation', async () => {
    const { user, feed } = await createUserGraph('read-pointer-reconciliation');
    const currentArticle = await createArticle(user, feed, 1, { status: 'read' });
    const newerArticle = await createArticle(user, feed, 2, { status: 'unread' });
    const event = await createEvent(user, currentArticle, {
      developingArticleId: currentArticle.id,
      articleCount: 2
    });
    await Article.update(
      { eventId: event.id },
      { where: { id: [currentArticle.id, newerArticle.id] } }
    );

    await reconcileTouchedEvents(user.id, [event.id]);
    await event.reload();

    expect(event.developingArticleId).toBe(currentArticle.id);
  });

  it('repairs an invalid developing pointer using deterministic canonical ordering', async () => {
    const owner = await createUserGraph('repair-pointer-owner');
    const foreign = await createUserGraph('repair-pointer-foreign');
    const representativeArticle = await createArticle(owner.user, owner.feed, 1, {
      status: 'read'
    });
    const olderUnreadArticle = await createArticle(owner.user, owner.feed, 2, {
      publishedAt: new Date('2026-05-25T10:00:00.000Z'),
      createdAt: new Date('2026-05-25T10:30:00.000Z'),
      status: 'unread'
    });
    const newestUnreadArticle = await createArticle(owner.user, owner.feed, 3, {
      publishedAt: new Date('2026-05-25T10:00:00.000Z'),
      createdAt: new Date('2026-05-25T11:00:00.000Z'),
      status: 'unread'
    });
    const foreignArticle = await createArticle(foreign.user, foreign.feed, 1);
    const event = await createEvent(owner.user, representativeArticle, {
      developingArticleId: foreignArticle.id,
      articleCount: 3
    });
    await Article.update(
      { eventId: event.id },
      { where: { id: [representativeArticle.id, olderUnreadArticle.id, newestUnreadArticle.id] } }
    );

    await reconcileTouchedEvents(owner.user.id, [event.id]);
    await event.reload();

    expect(event.developingArticleId).toBe(newestUnreadArticle.id);
    expect(event.representativeArticleId).toBe(representativeArticle.id);
  });

  it('waits for an incremental assignment and reconciles its committed membership', async () => {
    const { user, feed } = await createUserGraph('concurrent-reconciliation');
    const representativeArticle = await createArticle(user, feed, 1, {
      status: 'unread',
      articleVector: [1, 0, 0]
    });
    const incomingArticle = await createArticle(user, feed, 2, {
      status: 'unread',
      articleVector: [0.9, 0.1, 0]
    });
    const event = await createEvent(user, representativeArticle, {
      developingArticleId: representativeArticle.id,
      articleCount: 1,
      eventVector: [1, 0, 0]
    });
    await representativeArticle.update({ eventId: event.id });

    const assignmentTransaction = await sequelize.transaction();
    let reconciliationFinished = false;
    let reconciliationPromise;

    try {
      await assignArticleToExistingEvent({
        article: incomingArticle,
        articleEventVector: incomingArticle.articleVector,
        bestEvent: event,
        cache: null,
        skipTopicAssignment: true,
        transaction: assignmentTransaction
      });

      reconciliationPromise = reconcileTouchedEvents(user.id, [event.id])
        .then(result => {
          reconciliationFinished = true;
          return result;
        });

      await new Promise(resolve => setImmediate(resolve));
      expect(reconciliationFinished).toBe(false);

      await assignmentTransaction.commit();
      const result = await reconciliationPromise;

      expect(result.articlesByEventId[event.id]).toHaveLength(2);
    } catch (error) {
      if (!assignmentTransaction.finished) {
        await assignmentTransaction.rollback();
      }
      await reconciliationPromise?.catch(() => {});
      throw error;
    }

    await event.reload();

    expect(event.articleCount).toBe(2);
    expect(event.developingArticleId).toBe(representativeArticle.id);
  });
});
