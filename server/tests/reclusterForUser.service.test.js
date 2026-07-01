import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';
import {
  incrementalClusterForUser,
  reclusterForUser,
  retrospectiveClusterForUser
} from '../services/events/reclusterForUser.js';

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

// This function returns a stable recent date inside the replay window.
function recentDateWithOffset(offsetMs = 0) {
  return new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + offsetMs);
}

describe('reclusterForUser', () => {
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
      eventWindowStartAt: new Date('2026-05-21T10:00:00.000Z'),
      eventWindowEndAt: new Date('2026-05-21T10:00:00.000Z'),
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

  it('splits otherwise similar articles into separate events when their event-time window exceeds 24 hours', async () => {
    const { user, feed } = await createUserGraph('windowed');
    const feedTwo = await Feed.create({
      userId: user.id,
      categoryId: feed.categoryId,
      feedName: 'windowed second feed',
      url: `https://example.com/windowed-second-${user.id}.xml`
    });

    const base = recentDateWithOffset();
    const minutesFromBase = minutes => new Date(base.getTime() + minutes * 60 * 1000);
    const sharedVector = [1, 0, 0];

    await Article.bulkCreate([
      articlePayload(user, feed, 1, {
        title: 'Acme merger talks advance',
        url: `https://example.com/${user.id}/acme-1`,
        published: minutesFromBase(0),
        articleVector: sharedVector
      }),
      articlePayload(user, feedTwo, 2, {
        title: 'Acme merger talks advance again',
        url: `https://example.com/${user.id}/acme-2`,
        published: minutesFromBase(20),
        articleVector: sharedVector
      }),
      articlePayload(user, feed, 3, {
        title: 'Acme merger talks advance after delay',
        url: `https://example.com/${user.id}/acme-3`,
        published: minutesFromBase(25 * 60),
        articleVector: sharedVector
      }),
      articlePayload(user, feedTwo, 4, {
        title: 'Acme merger talks advance after delay again',
        url: `https://example.com/${user.id}/acme-4`,
        published: minutesFromBase(25 * 60 + 20),
        articleVector: sharedVector
      })
    ]);

    await reclusterForUser(user.id, { skipTopicAssignment: true });

    const events = await Event.findAll({
      where: { userId: user.id },
      order: [['eventWindowStartAt', 'ASC']]
    });
    const articleCounts = events.map(event => event.articleCount);
    const eventSpansInHours = events.map(event =>
      (new Date(event.eventWindowEndAt).getTime() - new Date(event.eventWindowStartAt).getTime()) / (60 * 60 * 1000)
    );

    expect(events).toHaveLength(2);
    expect(articleCounts).toEqual([2, 2]);
    expect(eventSpansInHours.every(span => span <= 24)).toBe(true);
  });

  it('clusters near-duplicate headlines with corroborating but sub-threshold vectors', async () => {
    const { user, feed } = await createUserGraph('duplicates');
    const feedTwo = await Feed.create({
      userId: user.id,
      categoryId: feed.categoryId,
      feedName: 'duplicates second feed',
      url: `https://example.com/duplicates-second-${user.id}.xml`
    });

    await Article.bulkCreate([
      articlePayload(user, feed, 1, {
        title: 'Windows classic 3D Space Cadet pinball is getting a physical re-creation',
        url: `https://example.com/${user.id}/pinball-1`,
        published: recentDateWithOffset(),
        articleVector: [1, 0, 0]
      }),
      articlePayload(user, feedTwo, 2, {
        title: 'Windows classic 3D Space Cadet pinball is getting a physical re-creation',
        url: `https://example.com/${user.id}/pinball-2`,
        published: recentDateWithOffset(60 * 60 * 1000),
        articleVector: [0.79, 0.613, 0]
      })
    ]);

    await reclusterForUser(user.id, { skipTopicAssignment: true });

    const events = await Event.findAll({
      where: { userId: user.id },
      include: [{
        model: Article,
        as: 'articles',
        attributes: ['id']
      }]
    });

    expect(events).toHaveLength(1);
    expect(events[0].articleCount).toBe(2);
    expect(events[0].articles).toHaveLength(2);
  });

  it('incrementally clusters recent unassigned articles created before the latest event update', async () => {
    const { user, feed } = await createUserGraph('incremental-highwater');
    const feedTwo = await Feed.create({
      userId: user.id,
      categoryId: feed.categoryId,
      feedName: 'incremental highwater second feed',
      url: `https://example.com/incremental-highwater-second-${user.id}.xml`
    });
    const existingArticle = await Article.create(articlePayload(user, feed, 1, {
      title: 'Existing unrelated event article',
      url: `https://example.com/${user.id}/existing-event`,
      published: recentDateWithOffset(-2 * 60 * 60 * 1000),
      articleVector: [0, 1, 0]
    }));
    const existingEvent = await Event.create({
      userId: user.id,
      representativeArticleId: existingArticle.id,
      name: 'Existing unrelated event',
      articleCount: 1,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [0, 1, 0],
      eventWindowStartAt: existingArticle.published,
      eventWindowEndAt: existingArticle.published,
      status: 'active'
    });

    await existingArticle.update({ eventId: existingEvent.id });
    await existingEvent.update({ name: 'Existing unrelated event updated after crawl insert' });

    const beforeLatestEventUpdate = new Date(new Date(existingEvent.updatedAt).getTime() - 60 * 1000);
    const basePublishedAt = recentDateWithOffset();
    const sharedVector = [1, 0, 0];
    const targetUrls = [
      `https://example.com/${user.id}/spanish-heatwave-1`,
      `https://example.com/${user.id}/spanish-heatwave-2`
    ];
    await Article.bulkCreate([
      articlePayload(user, feed, 2, {
        title: 'Spanish heatwave death toll reaches 1028 in June',
        url: targetUrls[0],
        published: basePublishedAt,
        createdAt: beforeLatestEventUpdate,
        updatedAt: beforeLatestEventUpdate,
        articleVector: sharedVector
      }),
      articlePayload(user, feedTwo, 3, {
        title: 'Spanish heatwave death toll reaches 1028 in June',
        url: targetUrls[1],
        published: new Date(basePublishedAt.getTime() + 3 * 60 * 1000),
        createdAt: beforeLatestEventUpdate,
        updatedAt: beforeLatestEventUpdate,
        articleVector: sharedVector
      })
    ]);

    await incrementalClusterForUser(user.id, { skipTopicAssignment: true });

    const clusteredArticles = await Article.findAll({
      where: {
        userId: user.id,
        url: { [db.Sequelize.Op.in]: targetUrls }
      },
      attributes: ['eventId'],
      raw: true
    });
    const eventIds = [...new Set(clusteredArticles.map(article => article.eventId))];

    expect(eventIds).toHaveLength(1);
    expect(eventIds[0]).not.toBeNull();
    expect(eventIds[0]).not.toBe(existingEvent.id);

    const event = await Event.findByPk(eventIds[0], {
      include: [{
        model: Article,
        as: 'articles',
        attributes: ['id']
      }]
    });

    expect(event.articleCount).toBe(2);
    expect(event.articles).toHaveLength(2);
  });

  it('retrospectively clusters vectorized articles outside the replay window', async () => {
    const { user, feed } = await createUserGraph('retrospective');
    const feedTwo = await Feed.create({
      userId: user.id,
      categoryId: feed.categoryId,
      feedName: 'retrospective second feed',
      url: `https://example.com/retrospective-second-${user.id}.xml`
    });
    const oldPublishedAt = new Date('2026-05-01T10:00:00.000Z');
    const sharedVector = [1, 0, 0];

    await Article.bulkCreate([
      articlePayload(user, feed, 1, {
        title: 'Historic Acme acquisition closes',
        url: `https://example.com/${user.id}/historic-acme-1`,
        published: oldPublishedAt,
        articleVector: sharedVector
      }),
      articlePayload(user, feedTwo, 2, {
        title: 'Historic Acme acquisition closes',
        url: `https://example.com/${user.id}/historic-acme-2`,
        published: new Date(oldPublishedAt.getTime() + 60 * 60 * 1000),
        articleVector: sharedVector
      })
    ]);

    await reclusterForUser(user.id, { skipTopicAssignment: true });

    const recentReplayEventCount = await Event.count({
      where: { userId: user.id }
    });

    await retrospectiveClusterForUser(user.id, {
      skipTopicAssignment: true,
      batchSize: 250
    });

    const events = await Event.findAll({
      where: { userId: user.id },
      include: [{
        model: Article,
        as: 'articles',
        attributes: ['id']
      }]
    });

    expect(recentReplayEventCount).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0].articleCount).toBe(2);
    expect(events[0].articles).toHaveLength(2);
  });
});
