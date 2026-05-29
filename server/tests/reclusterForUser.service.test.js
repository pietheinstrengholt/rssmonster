import { beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';
import { resetDatabase } from './helpers/resetDb.js';
import { reclusterForUser } from '../services/events/reclusterForUser.js';

const { Article, Category, Event, EventTopic, Feed, Topic, User } = db;

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

function articlePayload(user, feed, index, overrides = {}) {
  return {
    userId: user.id,
    feedId: feed.id,
    title: `${user.username} article ${index}`,
    url: `https://example.com/${user.username}/article-${index}`,
    published: new Date(`2026-05-${28 + index}T10:00:00.000Z`),
    articleVector: [1, index / 10, 0],
    status: 'unread',
    ...overrides
  };
}

describe('reclusterForUser', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('does not clear or delete foreign events referenced by stale article data', async () => {
    const owner = await createUserGraph('owner');
    const foreign = await createUserGraph('foreign');

    const ownerArticle = await Article.create(articlePayload(owner.user, owner.feed, 1));
    const foreignRepresentative = await Article.create(articlePayload(foreign.user, foreign.feed, 1));
    const foreignTopic = await Topic.create({
      userId: foreign.user.id,
      name: 'Foreign topic',
      topicKey: `foreign-topic-${foreign.user.id}`,
      topicType: 'event',
      topicVector: [0, 1, 0],
      lastActivityAt: new Date('2026-05-21T10:00:00.000Z')
    });
    const foreignEvent = await Event.create({
      userId: foreign.user.id,
      topicId: foreignTopic.id,
      representativeArticleId: foreignRepresentative.id,
      name: 'Foreign event',
      articleCount: 1,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [0, 1, 0],
      firstSeen: new Date('2026-05-21T10:00:00.000Z'),
      lastSeen: new Date('2026-05-21T10:00:00.000Z'),
      status: 'active'
    });
    await EventTopic.create({
      eventId: foreignEvent.id,
      topicId: foreignTopic.id,
      confidence: 1,
      rank: 1,
      primaryInd: true
    });

    await ownerArticle.update({ eventId: foreignEvent.id });

    await reclusterForUser(owner.user.id, { skipTopicAssignment: true });

    const persistedForeignEvent = await Event.findByPk(foreignEvent.id);
    const persistedForeignEventTopicCount = await EventTopic.count({
      where: {
        eventId: foreignEvent.id,
        topicId: foreignTopic.id
      }
    });

    await ownerArticle.reload();

    expect(ownerArticle.eventId).toBeNull();
    expect(persistedForeignEvent).toBeTruthy();
    expect(persistedForeignEventTopicCount).toBe(1);
  });
});
