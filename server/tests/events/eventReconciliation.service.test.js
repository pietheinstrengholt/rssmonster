import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';
import { reconcileTouchedEvents } from '../../services/events/eventReconciliation.js';

const { Article, Category, Event, Feed, User } = db;

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
});
