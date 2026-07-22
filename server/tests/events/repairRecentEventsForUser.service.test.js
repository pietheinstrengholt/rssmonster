import { describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';
import assignArticleToEvent, { EventCache } from '../../services/events/assignArticleToEvent.js';
import { assignArticleToExistingEvent } from '../../services/events/updateEvents.js';
import { markDuplicateArticlesForUser } from '../../services/duplicates/articleDuplicates.js';
import {
  runIncrementalEventsForUser,
  repairRecentEventsForUser,
  backfillHistoricalEventsForUser
} from '../../services/reconcile/semanticPipelineScopes.js';

const { sequelize, Article, Category, Event, EventTopic, Feed, Topic, User } = db;

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
    publishedAt: new Date(`2026-05-${28 + index}T10:00:00.000Z`),
    articleVector: [1, index / 10, 0],
    status: 'unread',
    ...overrides
  };
}

// This function returns a stable recent date inside the incremental event window.
function recentDateWithOffset(offsetMs = 0) {
  return new Date(Date.now() - 2 * 60 * 60 * 1000 + offsetMs);
}

describe('repairRecentEventsForUser', () => {
  it('incrementally assigns newly created read articles without changing their status', async () => {
    const { user, feed } = await createUserGraph('incremental-read-status');
    const sharedTitle = 'Samsung Galaxy Z Fold 8 lineup launches';
    const publishedAt = recentDateWithOffset();
    const articles = await Article.bulkCreate([
      articlePayload(user, feed, 1, {
        title: sharedTitle,
        publishedAt,
        articleVector: [1, 0, 0],
        status: 'read'
      }),
      articlePayload(user, feed, 2, {
        title: sharedTitle,
        publishedAt: new Date(publishedAt.getTime() + 60 * 1000),
        articleVector: [1, 0, 0],
        status: 'read'
      })
    ]);

    const result = await runIncrementalEventsForUser(user.id, {
      skipTopicAssignment: true
    });

    await Promise.all(articles.map(article => article.reload()));

    expect(result.articleCount).toBe(2);
    expect(result.newEventsCreatedCount).toBe(1);
    expect(articles[0].eventId).toBeTruthy();
    expect(articles[1].eventId).toBe(articles[0].eventId);
    expect(articles.map(article => article.status)).toEqual(['read', 'read']);
  });

  it('assigns an article using its persisted article vector when vectors are not supplied', async () => {
    const { user, feed } = await createUserGraph('persisted-assignment-vector');
    const representativeArticle = await Article.create(articlePayload(user, feed, 1, {
      title: 'Acme merger talks advance in Brussels',
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0]
    }));
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id,
      name: representativeArticle.title,
      articleCount: 1,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [1, 0, 0],
      eventWindowStartAt: representativeArticle.publishedAt,
      eventWindowEndAt: representativeArticle.publishedAt,
      status: 'active'
    });
    const incomingArticle = await Article.create(articlePayload(user, feed, 2, {
      title: 'Acme merger talks advance in Brussels after vote',
      publishedAt: recentDateWithOffset(5 * 60 * 1000),
      articleVector: [1, 0, 0]
    }));

    await representativeArticle.update({ eventId: event.id });

    const eventId = await assignArticleToEvent(
      incomingArticle.id,
      new EventCache([event]),
      null,
      [],
      null,
      { skipTopicAssignment: true }
    );

    await incomingArticle.reload();

    expect(eventId).toBe(event.id);
    expect(incomingArticle.eventId).toBe(event.id);
  });

  it('prefers an explicitly supplied event vector over the persisted article vector', async () => {
    const { user, feed } = await createUserGraph('explicit-assignment-vector');
    const representativeArticle = await Article.create(articlePayload(user, feed, 1, {
      title: 'Acme merger talks advance in Brussels',
      publishedAt: recentDateWithOffset(),
      articleVector: [0, 1, 0]
    }));
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id,
      name: representativeArticle.title,
      articleCount: 1,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [0, 1, 0],
      eventWindowStartAt: representativeArticle.publishedAt,
      eventWindowEndAt: representativeArticle.publishedAt,
      status: 'active'
    });
    const incomingArticle = await Article.create(articlePayload(user, feed, 2, {
      title: 'Acme merger talks advance in Brussels after vote',
      publishedAt: recentDateWithOffset(5 * 60 * 1000),
      articleVector: [1, 0, 0]
    }));

    await representativeArticle.update({ eventId: event.id });

    const eventId = await assignArticleToEvent(
      incomingArticle,
      new EventCache([event]),
      { eventVector: [0, 1, 0] },
      [],
      null,
      { skipTopicAssignment: true }
    );

    await incomingArticle.reload();

    expect(eventId).toBe(event.id);
    expect(incomingArticle.eventId).toBe(event.id);
  });

  it('keeps the topic-only no-vector path when no vector is available', async () => {
    const { user, feed } = await createUserGraph('missing-assignment-vector');
    const article = await Article.create(articlePayload(user, feed, 1, {
      articleVector: null
    }));
    const runContext = { stats: {} };

    const eventId = await assignArticleToEvent(
      article,
      new EventCache([]),
      null,
      [],
      runContext,
      { skipTopicAssignment: true }
    );

    await article.reload();

    expect(eventId).toBeNull();
    expect(article.eventId).toBeNull();
    expect(runContext.stats.topicOnlyNoVectorCount).toBe(1);
  });

  it('rejects duplicate articles before event assignment', async () => {
    const { user, feed } = await createUserGraph('duplicate-assignment-vector');
    const representativeArticle = await Article.create(articlePayload(user, feed, 1, {
      title: 'Acme merger talks advance in Brussels',
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0]
    }));
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id,
      name: representativeArticle.title,
      articleCount: 1,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [1, 0, 0],
      eventWindowStartAt: representativeArticle.publishedAt,
      eventWindowEndAt: representativeArticle.publishedAt,
      status: 'active'
    });
    const duplicateArticle = await Article.create(articlePayload(user, feed, 2, {
      title: 'Acme merger talks advance in Brussels after vote',
      publishedAt: recentDateWithOffset(5 * 60 * 1000),
      articleVector: [1, 0, 0],
      status: 'duplicate',
      duplicateOfArticleId: representativeArticle.id
    }));
    const runContext = { stats: {} };

    await representativeArticle.update({ eventId: event.id });

    const eventId = await assignArticleToEvent(
      duplicateArticle,
      new EventCache([event]),
      null,
      [],
      runContext,
      { skipTopicAssignment: true }
    );

    await duplicateArticle.reload();
    await event.reload();

    expect(eventId).toBeNull();
    expect(duplicateArticle.eventId).toBeNull();
    expect(event.articleCount).toBe(1);
    expect(runContext.stats).toEqual({});
  });

  it('excludes filtered articles from semantic duplicate candidates', async () => {
    const { user, feed } = await createUserGraph('filtered-duplicate');
    await Article.create(articlePayload(user, feed, 1, {
      filteredInd: true,
      articleVector: [1, 0, 0]
    }));
    const visibleArticle = await Article.create(articlePayload(user, feed, 2, {
      articleVector: [1, 0, 0]
    }));

    const result = await markDuplicateArticlesForUser(user.id);

    await visibleArticle.reload();

    expect(result.scannedCount).toBe(1);
    expect(result.duplicateCount).toBe(0);
    expect(visibleArticle.duplicateOfArticleId).toBeNull();
  });

  it('excludes filtered articles from incremental event candidates', async () => {
    const { user, feed } = await createUserGraph('filtered-incremental');
    const filteredArticle = await Article.create(articlePayload(user, feed, 1, {
      filteredInd: true,
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0]
    }));

    const result = await runIncrementalEventsForUser(user.id, {
      skipTopicAssignment: true
    });

    await filteredArticle.reload();

    expect(result.articleCount).toBe(0);
    expect(filteredArticle.eventId).toBeNull();
    expect(await Event.count({ where: { userId: user.id } })).toBe(0);
  });

  it('does not treat publisher revisions as new semantic candidates', async () => {
    const { user, feed } = await createUserGraph('publisher-revision');
    const article = await Article.create(articlePayload(user, feed, 1, {
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0]
    }));
    const createdAtFrom = new Date('2026-07-01T12:00:00.000Z');

    await sequelize.query(
      `
      UPDATE articles
      SET createdAt = :oldCreatedAt,
          updatedAt = :recentUpdatedAt
      WHERE id = :articleId
      `,
      {
        replacements: {
          oldCreatedAt: new Date('2026-06-01T12:00:00.000Z'),
          recentUpdatedAt: new Date('2026-07-02T12:00:00.000Z'),
          articleId: article.id
        }
      }
    );

    const duplicateResult = await markDuplicateArticlesForUser(user.id, { createdAtFrom });
    const eventResult = await runIncrementalEventsForUser(user.id, {
      createdAtFrom,
      skipTopicAssignment: true
    });

    await article.reload();

    expect(duplicateResult.scannedCount).toBe(0);
    expect(eventResult.articleCount).toBe(0);
    expect(article.eventId).toBeNull();
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

    await repairRecentEventsForUser(owner.user.id, { skipTopicAssignment: true });

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
        publishedAt: minutesFromBase(0),
        articleVector: sharedVector
      }),
      articlePayload(user, feedTwo, 2, {
        title: 'Acme merger talks advance again',
        url: `https://example.com/${user.id}/acme-2`,
        publishedAt: minutesFromBase(20),
        articleVector: sharedVector
      }),
      articlePayload(user, feed, 3, {
        title: 'Acme merger talks advance after delay',
        url: `https://example.com/${user.id}/acme-3`,
        publishedAt: minutesFromBase(25 * 60),
        articleVector: sharedVector
      }),
      articlePayload(user, feedTwo, 4, {
        title: 'Acme merger talks advance after delay again',
        url: `https://example.com/${user.id}/acme-4`,
        publishedAt: minutesFromBase(25 * 60 + 20),
        articleVector: sharedVector
      })
    ]);

    await repairRecentEventsForUser(user.id, { skipTopicAssignment: true });

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
        publishedAt: recentDateWithOffset(),
        articleVector: [1, 0, 0]
      }),
      articlePayload(user, feedTwo, 2, {
        title: 'Windows classic 3D Space Cadet pinball is getting a physical re-creation',
        url: `https://example.com/${user.id}/pinball-2`,
        publishedAt: recentDateWithOffset(60 * 60 * 1000),
        articleVector: [0.79, 0.613, 0]
      })
    ]);

    await repairRecentEventsForUser(user.id, { skipTopicAssignment: true });

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
      publishedAt: recentDateWithOffset(-2 * 60 * 60 * 1000),
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
      eventWindowStartAt: existingArticle.publishedAt,
      eventWindowEndAt: existingArticle.publishedAt,
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
        publishedAt: basePublishedAt,
        createdAt: beforeLatestEventUpdate,
        updatedAt: beforeLatestEventUpdate,
        articleVector: sharedVector
      }),
      articlePayload(user, feedTwo, 3, {
        title: 'Spanish heatwave death toll reaches 1028 in June',
        url: targetUrls[1],
        publishedAt: new Date(basePublishedAt.getTime() + 3 * 60 * 1000),
        createdAt: beforeLatestEventUpdate,
        updatedAt: beforeLatestEventUpdate,
        articleVector: sharedVector
      })
    ]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    let summaryOutput = '';

    try {
      await runIncrementalEventsForUser(user.id, { skipTopicAssignment: true });
      summaryOutput = logSpy.mock.calls
        .map(call => call.join(' '))
        .join('\n');
    } finally {
      logSpy.mockRestore();
    }

    expect(summaryOutput).not.toContain('Articles linked to events');
    expect(summaryOutput).toMatch(/Articles assigned to new events\.+ 2/);
    expect(summaryOutput).toMatch(/Total articles assigned to events\.+ 2/);

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

  it('uses already-assigned similar candidates as evidence when the event centroid misses', async () => {
    const { user, feed } = await createUserGraph('assigned-candidates');
    const existingArticleA = await Article.create(articlePayload(user, feed, 1, {
      title: 'Spanish heatwave death toll reaches 1028 in June',
      url: `https://example.com/${user.id}/assigned-candidate-a`,
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0]
    }));
    const existingArticleB = await Article.create(articlePayload(user, feed, 2, {
      title: 'Spanish heatwave death toll reaches 1028 in June',
      url: `https://example.com/${user.id}/assigned-candidate-b`,
      publishedAt: recentDateWithOffset(2 * 60 * 1000),
      articleVector: [1, 0, 0]
    }));
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: existingArticleA.id,
      name: 'Unrelated centroid label',
      articleCount: 2,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [0, 1, 0],
      eventWindowStartAt: existingArticleA.publishedAt,
      eventWindowEndAt: existingArticleB.publishedAt,
      status: 'active'
    });
    const incomingArticle = await Article.create(articlePayload(user, feed, 3, {
      title: 'Spanish heatwave death toll reaches 1028 in June',
      url: `https://example.com/${user.id}/assigned-candidate-c`,
      publishedAt: recentDateWithOffset(4 * 60 * 1000),
      articleVector: [1, 0, 0]
    }));
    const runContext = {
      records: [
        {
          id: existingArticleA.id,
          feedId: existingArticleA.feedId,
          title: existingArticleA.title,
          description: existingArticleA.description,
          publishedAt: existingArticleA.publishedAt,
          createdAt: existingArticleA.createdAt,
          eventId: event.id,
          eventVector: existingArticleA.articleVector
        },
        {
          id: existingArticleB.id,
          feedId: existingArticleB.feedId,
          title: existingArticleB.title,
          description: existingArticleB.description,
          publishedAt: existingArticleB.publishedAt,
          createdAt: existingArticleB.createdAt,
          eventId: event.id,
          eventVector: existingArticleB.articleVector
        }
      ],
      indexById: new Map([
        [existingArticleA.id, 0],
        [existingArticleB.id, 1]
      ]),
      stats: {}
    };

    await existingArticleA.update({ eventId: event.id });
    await existingArticleB.update({ eventId: event.id });

    const eventId = await assignArticleToEvent(
      incomingArticle,
      new EventCache([event]),
      { eventVector: incomingArticle.articleVector },
      [],
      runContext,
      { skipTopicAssignment: true }
    );

    await incomingArticle.reload();
    await event.reload();

    expect(eventId).toBe(event.id);
    expect(incomingArticle.eventId).toBe(event.id);
    expect(event.articleCount).toBe(3);
    expect(event.developingArticleId).toBe(incomingArticle.id);
    expect(runContext.stats.linkedToExistingEventCount).toBe(1);
  });

  it('serializes concurrent assignments and updates the cache after commit', async () => {
    const { user, feed } = await createUserGraph('concurrent-existing-event');
    const secondFeed = await Feed.create({
      userId: user.id,
      categoryId: feed.categoryId,
      feedName: 'concurrent second feed',
      url: `https://example.com/concurrent-second-${user.id}.xml`
    });
    const thirdFeed = await Feed.create({
      userId: user.id,
      categoryId: feed.categoryId,
      feedName: 'concurrent third feed',
      url: `https://example.com/concurrent-third-${user.id}.xml`
    });
    const representativeArticle = await Article.create(articlePayload(user, feed, 1, {
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0]
    }));
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: representativeArticle.id,
      name: representativeArticle.title,
      articleCount: 1,
      sourceCount: 1,
      sourceDiversityScore: Math.log(2),
      eventStrength: 0.7,
      eventVector: [1, 0, 0],
      eventWindowStartAt: representativeArticle.publishedAt,
      eventWindowEndAt: representativeArticle.publishedAt,
      status: 'active'
    });
    const incomingArticles = await Promise.all([
      Article.create(articlePayload(user, secondFeed, 2, {
        publishedAt: recentDateWithOffset(5 * 60 * 1000),
        articleVector: [0.9, 0.1, 0]
      })),
      Article.create(articlePayload(user, thirdFeed, 3, {
        publishedAt: recentDateWithOffset(10 * 60 * 1000),
        articleVector: [0.8, 0.2, 0]
      }))
    ]);
    const cache = new EventCache([event]);

    await representativeArticle.update({ eventId: event.id });
    await Promise.all(incomingArticles.map(incomingArticle => assignArticleToExistingEvent({
      article: incomingArticle,
      articleEventVector: incomingArticle.articleVector,
      bestEvent: event,
      cache,
      skipTopicAssignment: true
    })));

    await event.reload();

    expect(event.articleCount).toBe(3);
    expect(event.sourceCount).toBe(3);
    expect(event.sourceDiversityScore).toBeCloseTo(Math.log(4));
    expect(cache.events[0].articleCount).toBe(3);
    expect(cache.events[0].sourceCount).toBe(3);
  });

  it('does not increment event metadata when retrying an existing assignment', async () => {
    const { user, feed } = await createUserGraph('retried-existing-event');
    const secondFeed = await Feed.create({
      userId: user.id,
      categoryId: feed.categoryId,
      feedName: 'retried assignment second feed',
      url: `https://example.com/retried-assignment-${user.id}.xml`
    });
    const representativeArticle = await Article.create(articlePayload(user, feed, 1, {
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0]
    }));
    const incomingArticle = await Article.create(articlePayload(user, secondFeed, 2, {
      publishedAt: recentDateWithOffset(5 * 60 * 1000),
      articleVector: [0.9, 0.1, 0]
    }));
    const staleIncomingArticle = await Article.findByPk(incomingArticle.id);
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: representativeArticle.id,
      name: representativeArticle.title,
      articleCount: 1,
      sourceCount: 1,
      sourceDiversityScore: Math.log(2),
      eventStrength: 0.7,
      eventVector: [1, 0, 0],
      eventWindowStartAt: representativeArticle.publishedAt,
      eventWindowEndAt: representativeArticle.publishedAt,
      status: 'active'
    });
    const cache = new EventCache([event]);

    await representativeArticle.update({ eventId: event.id });
    const assignment = {
      articleEventVector: incomingArticle.articleVector,
      bestEvent: event,
      cache,
      skipTopicAssignment: true
    };

    await assignArticleToExistingEvent({
      ...assignment,
      article: incomingArticle
    });
    await assignArticleToExistingEvent({
      ...assignment,
      article: staleIncomingArticle
    });

    await event.reload();

    expect(event.articleCount).toBe(2);
    expect(event.sourceCount).toBe(2);
    expect(cache.events[0].articleCount).toBe(2);
    expect(staleIncomingArticle.eventId).toBe(event.id);
  });

  it('does not move an article that is already assigned to another event', async () => {
    const { user, feed } = await createUserGraph('conflicting-existing-event');
    const targetRepresentative = await Article.create(articlePayload(user, feed, 1));
    const sourceRepresentative = await Article.create(articlePayload(user, feed, 2));
    const incomingArticle = await Article.create(articlePayload(user, feed, 3));
    const staleIncomingArticle = await Article.findByPk(incomingArticle.id);
    const targetEvent = await Event.create({
      userId: user.id,
      representativeArticleId: targetRepresentative.id,
      developingArticleId: targetRepresentative.id,
      name: targetRepresentative.title,
      articleCount: 1,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [1, 0, 0],
      eventWindowStartAt: targetRepresentative.publishedAt,
      eventWindowEndAt: targetRepresentative.publishedAt,
      status: 'active'
    });
    const sourceEvent = await Event.create({
      userId: user.id,
      representativeArticleId: sourceRepresentative.id,
      developingArticleId: sourceRepresentative.id,
      name: sourceRepresentative.title,
      articleCount: 2,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [1, 0, 0],
      eventWindowStartAt: sourceRepresentative.publishedAt,
      eventWindowEndAt: incomingArticle.publishedAt,
      status: 'active'
    });
    const cache = new EventCache([targetEvent]);

    await targetRepresentative.update({ eventId: targetEvent.id });
    await Article.update(
      { eventId: sourceEvent.id },
      { where: { id: [sourceRepresentative.id, incomingArticle.id] } }
    );

    const result = await assignArticleToExistingEvent({
      article: staleIncomingArticle,
      articleEventVector: staleIncomingArticle.articleVector,
      bestEvent: targetEvent,
      cache,
      skipTopicAssignment: true
    });

    await incomingArticle.reload();
    await targetEvent.reload();

    expect(result).toBeNull();
    expect(incomingArticle.eventId).toBe(sourceEvent.id);
    expect(staleIncomingArticle.eventId).toBe(sourceEvent.id);
    expect(targetEvent.articleCount).toBe(1);
    expect(cache.events[0].articleCount).toBe(1);
  });

  it('does not update the event cache when an assignment transaction rolls back', async () => {
    const { user, feed } = await createUserGraph('rollback-existing-event');
    const representativeArticle = await Article.create(articlePayload(user, feed, 1, {
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0]
    }));
    const incomingArticle = await Article.create(articlePayload(user, feed, 2, {
      publishedAt: recentDateWithOffset(5 * 60 * 1000),
      articleVector: [0.9, 0.1, 0]
    }));
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: representativeArticle.id,
      name: representativeArticle.title,
      articleCount: 1,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [1, 0, 0],
      eventWindowStartAt: representativeArticle.publishedAt,
      eventWindowEndAt: representativeArticle.publishedAt,
      status: 'active'
    });
    const cache = new EventCache([event]);

    await representativeArticle.update({ eventId: event.id });
    const transaction = await sequelize.transaction();

    try {
      await assignArticleToExistingEvent({
        article: incomingArticle,
        articleEventVector: incomingArticle.articleVector,
        bestEvent: event,
        cache,
        skipTopicAssignment: true,
        transaction
      });

      expect(cache.events[0].articleCount).toBe(1);
    } finally {
      await transaction.rollback();
    }

    await event.reload();
    await incomingArticle.reload();

    expect(event.articleCount).toBe(1);
    expect(incomingArticle.eventId).toBeNull();
    expect(cache.events[0].articleCount).toBe(1);
  });

  it('keeps incoming status and advances a read developing pointer', async () => {
    const { user, feed } = await createUserGraph('read-developing');
    const representativeArticle = await Article.create(articlePayload(user, feed, 1, {
      title: 'Spanish heatwave death toll reaches 1028 in June',
      url: `https://example.com/${user.id}/read-developing-representative`,
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0],
      status: 'read'
    }));
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: representativeArticle.id,
      name: representativeArticle.title,
      articleCount: 1,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [1, 0, 0],
      eventWindowStartAt: representativeArticle.publishedAt,
      eventWindowEndAt: representativeArticle.publishedAt,
      status: 'active'
    });
    const incomingArticle = await Article.create(articlePayload(user, feed, 2, {
      title: 'Spanish heatwave death toll reaches 1028 in June update',
      url: `https://example.com/${user.id}/read-developing-incoming`,
      publishedAt: recentDateWithOffset(5 * 60 * 1000),
      articleVector: [1, 0, 0],
      status: 'unread'
    }));

    await representativeArticle.update({ eventId: event.id });

    const eventId = await assignArticleToEvent(
      incomingArticle,
      new EventCache([event]),
      { eventVector: incomingArticle.articleVector },
      [],
      null,
      { skipTopicAssignment: true }
    );

    await incomingArticle.reload();
    await event.reload();

    expect(eventId).toBe(event.id);
    expect(incomingArticle.eventId).toBe(event.id);
    expect(incomingArticle.status).toBe('unread');
    expect(event.developingArticleId).toBe(incomingArticle.id);
  });

  it('keeps incoming status and preserves an unread developing pointer', async () => {
    const { user, feed } = await createUserGraph('unread-developing');
    const representativeArticle = await Article.create(articlePayload(user, feed, 1, {
      title: 'Acme merger talks advance in Brussels',
      url: `https://example.com/${user.id}/unread-developing-representative`,
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0],
      status: 'unread'
    }));
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: representativeArticle.id,
      name: representativeArticle.title,
      articleCount: 1,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [1, 0, 0],
      eventWindowStartAt: representativeArticle.publishedAt,
      eventWindowEndAt: representativeArticle.publishedAt,
      status: 'active'
    });
    const incomingArticle = await Article.create(articlePayload(user, feed, 2, {
      title: 'Acme merger talks advance in Brussels after vote',
      url: `https://example.com/${user.id}/unread-developing-incoming`,
      publishedAt: recentDateWithOffset(5 * 60 * 1000),
      articleVector: [1, 0, 0],
      status: 'unread'
    }));

    await representativeArticle.update({ eventId: event.id });

    const eventId = await assignArticleToEvent(
      incomingArticle,
      new EventCache([event]),
      { eventVector: incomingArticle.articleVector },
      [],
      null,
      { skipTopicAssignment: true }
    );

    await incomingArticle.reload();
    await event.reload();

    expect(eventId).toBe(event.id);
    expect(incomingArticle.eventId).toBe(event.id);
    expect(incomingArticle.status).toBe('unread');
    expect(event.developingArticleId).toBe(representativeArticle.id);
  });

  it('preserves each article status while creating a new event', async () => {
    const { user, feed } = await createUserGraph('new-event-status');
    const existingArticle = await Article.create(articlePayload(user, feed, 1, {
      title: 'Luna launch mission reaches orbit',
      url: `https://example.com/${user.id}/new-event-status-existing`,
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0],
      status: 'read'
    }));
    const incomingArticle = await Article.create(articlePayload(user, feed, 2, {
      title: 'Luna launch mission reaches orbit successfully',
      url: `https://example.com/${user.id}/new-event-status-incoming`,
      publishedAt: recentDateWithOffset(5 * 60 * 1000),
      articleVector: [1, 0, 0],
      status: 'unread'
    }));

    const eventId = await assignArticleToEvent(
      incomingArticle,
      new EventCache([]),
      { eventVector: incomingArticle.articleVector },
      [],
      null,
      { skipTopicAssignment: true }
    );

    await existingArticle.reload();
    await incomingArticle.reload();

    expect(eventId).toBeTruthy();
    expect(existingArticle.eventId).toBe(eventId);
    expect(incomingArticle.eventId).toBe(eventId);
    expect(existingArticle.status).toBe('read');
    expect(incomingArticle.status).toBe('unread');
  });

  it('does not overwrite non-unread article status when joining a read event', async () => {
    const { user, feed } = await createUserGraph('special-status');
    const representativeArticle = await Article.create(articlePayload(user, feed, 1, {
      title: 'Market regulator opens tech probe',
      url: `https://example.com/${user.id}/special-status-representative`,
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0],
      status: 'read'
    }));
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: representativeArticle.id,
      name: representativeArticle.title,
      articleCount: 1,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [1, 0, 0],
      eventWindowStartAt: representativeArticle.publishedAt,
      eventWindowEndAt: representativeArticle.publishedAt,
      status: 'active'
    });
    const incomingArticle = await Article.create(articlePayload(user, feed, 2, {
      title: 'Market regulator opens tech probe after complaint',
      url: `https://example.com/${user.id}/special-status-incoming`,
      publishedAt: recentDateWithOffset(5 * 60 * 1000),
      articleVector: [1, 0, 0],
      status: 'favorite'
    }));

    await representativeArticle.update({ eventId: event.id });

    const eventId = await assignArticleToEvent(
      incomingArticle,
      new EventCache([event]),
      { eventVector: incomingArticle.articleVector },
      [],
      null,
      { skipTopicAssignment: true }
    );

    await incomingArticle.reload();
    await event.reload();

    expect(eventId).toBe(event.id);
    expect(incomingArticle.eventId).toBe(event.id);
    expect(incomingArticle.status).toBe('favorite');
    expect(event.developingArticleId).toBe(representativeArticle.id);
  });

  it('repairs a foreign developing pointer when an unread article joins', async () => {
    const owner = await createUserGraph('invalid-pointer-owner');
    const foreign = await createUserGraph('invalid-pointer-foreign');
    const representativeArticle = await Article.create(articlePayload(owner.user, owner.feed, 1, {
      title: 'Coastal rail project receives final approval',
      url: `https://example.com/${owner.user.id}/invalid-pointer-representative`,
      publishedAt: recentDateWithOffset(),
      articleVector: [1, 0, 0],
      status: 'read'
    }));
    const foreignArticle = await Article.create(articlePayload(foreign.user, foreign.feed, 1, {
      url: `https://example.com/${foreign.user.id}/invalid-pointer-foreign`
    }));
    const event = await Event.create({
      userId: owner.user.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: foreignArticle.id,
      name: representativeArticle.title,
      articleCount: 1,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [1, 0, 0],
      eventWindowStartAt: representativeArticle.publishedAt,
      eventWindowEndAt: representativeArticle.publishedAt,
      status: 'active'
    });
    const incomingArticle = await Article.create(articlePayload(owner.user, owner.feed, 2, {
      title: 'Coastal rail project receives final approval after review',
      url: `https://example.com/${owner.user.id}/invalid-pointer-incoming`,
      publishedAt: recentDateWithOffset(5 * 60 * 1000),
      articleVector: [1, 0, 0],
      status: 'unread'
    }));
    await representativeArticle.update({ eventId: event.id });

    const eventId = await assignArticleToEvent(
      incomingArticle,
      new EventCache([event]),
      { eventVector: incomingArticle.articleVector },
      [],
      null,
      { skipTopicAssignment: true }
    );

    await incomingArticle.reload();
    await event.reload();

    expect(eventId).toBe(event.id);
    expect(incomingArticle.status).toBe('unread');
    expect(event.developingArticleId).toBe(incomingArticle.id);
    expect(event.representativeArticleId).toBe(representativeArticle.id);
  });

  it('historical backfill assigns vectorized articles outside the recent repair window', async () => {
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
        publishedAt: oldPublishedAt,
        articleVector: sharedVector
      }),
      articlePayload(user, feedTwo, 2, {
        title: 'Historic Acme acquisition closes',
        url: `https://example.com/${user.id}/historic-acme-2`,
        publishedAt: new Date(oldPublishedAt.getTime() + 60 * 60 * 1000),
        articleVector: sharedVector
      })
    ]);

    await repairRecentEventsForUser(user.id, { skipTopicAssignment: true });

    const recentReplayEventCount = await Event.count({
      where: { userId: user.id }
    });

    const backfillResult = await backfillHistoricalEventsForUser(user.id, {
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
    expect(backfillResult.mode).toBe('historical-backfill');
    expect(events).toHaveLength(1);
    expect(events[0].articleCount).toBe(2);
    expect(events[0].articles).toHaveLength(2);
  });
});
