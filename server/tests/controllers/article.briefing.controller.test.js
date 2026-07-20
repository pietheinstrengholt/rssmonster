import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { extractBriefingExcerpt } from '../../services/dailyBriefing/dailyBriefing.service.js';

const {
  Article,
  BriefingPreference,
  Category,
  Event,
  Feed,
  Island,
  IslandTopic,
  Setting,
  Topic,
  User,
  sequelize
} = db;

let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const hoursAgo = hours => new Date(Date.now() - hours * 60 * 60 * 1000);

// This function creates an authenticated test user.
const createUser = username => User.create({
  username,
  password: 'hashed-password',
  hash: `${username}-hash`,
  role: 'user'
});

// This function creates the bearer token expected by authenticated routes.
const authHeaderFor = user => `Bearer ${jwt.sign({
  username: user.username,
  userId: user.id
}, getJwtSecret())}`;

// This function creates a canonical article suitable for briefing fixtures.
const createArticle = ({ user, feed, slug, title, publishedAt, status = 'unread', interestScore = 0 }) => (
  Article.create({
    userId: user.id,
    feedId: feed.id,
    status,
    interestScore,
    url: `https://example.com/${user.username}/${slug}`,
    title,
    contentOriginal: `<p>${title}. Original article content.</p>`,
    contentHtml: `${title}. Original article content.`,
    contentText: `${title}. This is the first useful briefing sentence with enough detail to explain the development clearly. A second useful sentence adds context for readers following the story this morning.`,
    publishedAt
  })
);

// This function creates the full semantic fixture used by the Daily Briefing endpoint tests.
async function createBriefingFixture() {
  const owner = await createUser(uniqueName('briefing-owner'));
  const foreignUser = await createUser(uniqueName('briefing-foreign'));
  const category = await Category.create({
    userId: owner.id,
    name: `${owner.username} category`,
    categoryOrder: 1
  });
  const firstFeed = await Feed.create({
    userId: owner.id,
    categoryId: category.id,
    feedName: 'First briefing source',
    url: `https://example.com/${owner.username}/first.xml`
  });
  const secondFeed = await Feed.create({
    userId: owner.id,
    categoryId: category.id,
    feedName: 'Second briefing source',
    url: `https://example.com/${owner.username}/second.xml`
  });
  await Setting.create({ userId: owner.id });

  const topic = await Topic.create({
    userId: owner.id,
    name: 'Artificial Intelligence',
    topicKey: uniqueName('briefing-topic')
  });
  const island = await Island.create({
    userId: owner.id,
    label: 'Artificial Intelligence',
    weight: 0.9
  });
  await IslandTopic.create({
    islandId: island.id,
    topicId: topic.id,
    similarity: 0.9,
    confidence: 0.95
  });

  const eventOneRepresentative = await createArticle({
    user: owner,
    feed: firstFeed,
    slug: 'event-one-representative',
    title: 'First event representative',
    publishedAt: hoursAgo(2),
    interestScore: 0.7
  });
  const sharedRepresentative = await createArticle({
    user: owner,
    feed: firstFeed,
    slug: 'shared-representative',
    title: 'Shared representative headline',
    publishedAt: hoursAgo(72),
    interestScore: -0.4
  });
  const fourthRepresentative = await createArticle({
    user: owner,
    feed: firstFeed,
    slug: 'fourth-representative',
    title: 'Fallback representative headline',
    publishedAt: hoursAgo(3),
    interestScore: 0.8
  });
  const fifthRepresentative = await createArticle({
    user: owner,
    feed: firstFeed,
    slug: 'fifth-representative',
    title: 'Fifth representative headline',
    publishedAt: hoursAgo(4),
    interestScore: 0.6
  });
  const sixthRepresentative = await createArticle({
    user: owner,
    feed: firstFeed,
    slug: 'sixth-representative',
    title: 'Sixth representative headline',
    publishedAt: hoursAgo(5),
    interestScore: 0.5
  });

  const eventOne = await Event.create({
    userId: owner.id,
    topicId: topic.id,
    representativeArticleId: eventOneRepresentative.id,
    name: 'First event',
    articleCount: 2,
    eventStrength: 5
  });
  const eventTwo = await Event.create({
    userId: owner.id,
    topicId: topic.id,
    representativeArticleId: sharedRepresentative.id,
    name: 'Lower-ranked shared event',
    articleCount: 1,
    eventStrength: 10
  });
  const eventThree = await Event.create({
    userId: owner.id,
    topicId: topic.id,
    representativeArticleId: sharedRepresentative.id,
    name: 'Top-ranked shared event',
    articleCount: 1,
    eventStrength: 20
  });
  const eventFour = await Event.create({
    userId: owner.id,
    topicId: topic.id,
    representativeArticleId: fourthRepresentative.id,
    name: null,
    articleCount: 1,
    eventStrength: 15
  });
  const eventFive = await Event.create({
    userId: owner.id,
    topicId: topic.id,
    representativeArticleId: fifthRepresentative.id,
    name: 'Fifth event',
    articleCount: 1,
    eventStrength: 12
  });
  const eventSix = await Event.create({
    userId: owner.id,
    topicId: topic.id,
    representativeArticleId: sixthRepresentative.id,
    name: 'Sixth event',
    articleCount: 1,
    eventStrength: 11,
    createdAt: hoursAgo(24 * 10),
    updatedAt: hoursAgo(24 * 10)
  });

  await Promise.all([
    eventOneRepresentative.update({ eventId: eventOne.id, topicId: topic.id }),
    sharedRepresentative.update({ eventId: eventTwo.id, topicId: topic.id }),
    fourthRepresentative.update({ eventId: eventFour.id, topicId: topic.id }),
    fifthRepresentative.update({ eventId: eventFive.id, topicId: topic.id }),
    sixthRepresentative.update({ eventId: eventSix.id, topicId: topic.id })
  ]);

  const eventOneReadMember = await createArticle({
    user: owner,
    feed: secondFeed,
    slug: 'event-one-read-member',
    title: 'Read multi-article event member',
    publishedAt: hoursAgo(1),
    status: 'read'
  }).then(async article => {
    await article.update({ eventId: eventOne.id, topicId: topic.id });
    return article;
  });

  await createArticle({
    user: owner,
    feed: secondFeed,
    slug: 'event-three-member',
    title: 'Recent member of shared event',
    publishedAt: hoursAgo(1),
    interestScore: 0.9
  }).then(article => article.update({ eventId: eventThree.id, topicId: topic.id }));

  await Article.create({
    userId: owner.id,
    feedId: firstFeed.id,
    status: 'unread',
    interestScore: 1,
    filteredInd: true,
    url: `https://example.com/${owner.username}/filtered`,
    title: 'Filtered briefing article',
    contentOriginal: '<p>Filtered briefing article.</p>',
    contentHtml: 'Filtered briefing article.',
    contentText: 'Filtered briefing article with enough text to otherwise qualify for the briefing.',
    publishedAt: hoursAgo(1)
  });

  const foreignCategory = await Category.create({
    userId: foreignUser.id,
    name: `${foreignUser.username} category`,
    categoryOrder: 1
  });
  const foreignFeed = await Feed.create({
    userId: foreignUser.id,
    categoryId: foreignCategory.id,
    feedName: 'Foreign source',
    url: `https://example.com/${foreignUser.username}/feed.xml`
  });
  await createArticle({
    user: foreignUser,
    feed: foreignFeed,
    slug: 'foreign-briefing',
    title: 'Foreign briefing article',
    publishedAt: hoursAgo(1),
    interestScore: 1
  });

  return {
    owner,
    island,
    topic,
    feeds: { firstFeed, secondFeed },
    events: { eventOne, eventTwo, eventThree, eventFour, eventFive, eventSix },
    representatives: {
      eventOneRepresentative,
      eventOneReadMember,
      sharedRepresentative,
      fourthRepresentative
    }
  };
}

describe('extractBriefingExcerpt', () => {
  it('normalizes whitespace, removes a duplicated title, and selects useful sentences', () => {
    const excerpt = extractBriefingExcerpt(
      'Repeated title.  Updated.   The first useful sentence contains enough detail to explain what happened across the market today. A second useful sentence provides additional context for readers following this development.',
      'Repeated title'
    );

    expect(excerpt).not.toContain('Repeated title');
    expect(excerpt).not.toContain('Updated.');
    expect(excerpt).toContain('The first useful sentence');
    expect(excerpt).toContain('A second useful sentence');
  });

  it('truncates long useful text at a word boundary and rejects insubstantial text', () => {
    const longSentence = `${'Detailed briefing context '.repeat(20).trim()}.`;
    const excerpt = extractBriefingExcerpt(longSentence, 'Different title');

    expect(excerpt.length).toBeLessThanOrEqual(280);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(extractBriefingExcerpt('Short. Tiny.', 'Title')).toBeNull();
  });

  it('removes image credits, continuation prompts, and forum calls to action', () => {
    const excerpt = extractBriefingExcerpt(
      'Image credit: Christopher PayneIn May 2026, the company announced a major expansion of its manufacturing plans. The first useful article sentence explains the announcement and why it matters to customers. " Continue Reading on AppleInsider | Discuss on our Forums',
      'Product announcement'
    );

    expect(excerpt).not.toMatch(/image credit|christopher payne/i);
    expect(excerpt).not.toMatch(/continue reading|appleinsider/i);
    expect(excerpt).not.toMatch(/discuss|forums/i);
    expect(excerpt).toContain('In May 2026');
    expect(excerpt).toContain('The first useful article sentence');
  });

  it('cleans the observed AppleInsider caption and footer while preserving article text', () => {
    const excerpt = extractBriefingExcerpt(
      'TSMC plant in Arizona - image credit: Christopher PayneIn May 2026, TSMC announced an additional $20 billion investment in its Arizona plants. " Continue Reading on AppleInsider | Discuss on our Forums',
      'Four more chip plants promised as TSMC teases a further $100 billion US expansion'
    );

    expect(excerpt).toBe('In May 2026, TSMC announced an additional $20 billion investment in its Arizona plants.');
  });

  it.each([
    'Photo Credit — Example Photographer supplied this promotional image for publication.',
    'Read more on the original publisher website for all details and related coverage.',
    'Visit our forums to join the discussion with other readers and community members.'
  ])('returns null for boilerplate-only text: %s', contentText => {
    expect(extractBriefingExcerpt(contentText, 'Unrelated title')).toBeNull();
  });
});

describe('GET /api/articles/briefing', () => {
  let fixture;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
    fixture = await createBriefingFixture();
  }, 50_000);

  it('requires authentication', async () => {
    const response = await request(app).get('/api/articles/briefing');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Your session is not valid!' });
  });

  it.each([
    ['period', 'month', 'period must be one of: today, 24h, 7d'],
    ['status', 'read', 'status must be one of: unread, all']
  ])('rejects an unsupported %s filter', async (key, value, error) => {
    const response = await request(app)
      .get('/api/articles/briefing')
      .query({ [key]: value })
      .set('Authorization', authHeaderFor(fixture.owner));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
  });

  it('returns deterministic, tenant-scoped context and unique summary items', async () => {
    const response = await request(app)
      .get('/api/articles/briefing')
      .query({ period: '7d', status: 'all' })
      .set('Authorization', authHeaderFor(fixture.owner));

    expect(response.status).toBe(200);
    expect(response.body.filters).toMatchObject({ period: '7d', status: 'all' });
    expect(new Date(response.body.generatedAt).toISOString()).toBe(response.body.generatedAt);
    expect(
      new Date(response.body.generatedAt).getTime() - new Date(response.body.filters.dateFrom).getTime()
    ).toBe(7 * 24 * 60 * 60 * 1000);
    expect(response.body.context).toEqual({
      articleCount: 7,
      eventCount: 6,
      newEventCount: 5,
      topicCount: 1,
      islandCount: 1,
      sourceCount: 2
    });

    const items = response.body.morningSummary.items;
    expect(items).toHaveLength(4);
    expect(items.map(item => item.eventId)).toEqual([
      fixture.events.eventThree.id,
      fixture.events.eventFour.id,
      fixture.events.eventFive.id,
      fixture.events.eventSix.id
    ]);
    expect(new Set(items.map(item => item.eventId)).size).toBe(items.length);
    expect(new Set(items.map(item => item.representativeArticleId)).size).toBe(items.length);
    expect(items[0]).toMatchObject({
      representativeArticleId: fixture.representatives.sharedRepresentative.id,
      headline: 'Top-ranked shared event',
      island: {
        id: Number(fixture.island.id),
        name: 'Artificial Intelligence'
      }
    });
    expect(items[0].text).not.toContain('Shared representative headline');
    expect(items[1].headline).toBe(fixture.representatives.fourthRepresentative.title);
    expect(items.every(item => Object.hasOwn(item, 'text'))).toBe(true);
  });

  it('applies rolling-period and unread filters without changing the response shape', async () => {
    const [todayResponse, unreadResponse] = await Promise.all([
      request(app)
        .get('/api/articles/briefing')
        .query({ period: 'today', status: 'all' })
        .set('Authorization', authHeaderFor(fixture.owner)),
      request(app)
        .get('/api/articles/briefing')
        .query({ period: '24h', status: 'unread' })
        .set('Authorization', authHeaderFor(fixture.owner))
    ]);

    expect(todayResponse.status).toBe(200);
    expect(unreadResponse.status).toBe(200);
    expect(todayResponse.body.filters.period).toBe('today');
    expect(unreadResponse.body.filters).toMatchObject({ period: '24h', status: 'unread' });
    expect(
      new Date(todayResponse.body.generatedAt).getTime() - new Date(todayResponse.body.filters.dateFrom).getTime()
    ).toBe(24 * 60 * 60 * 1000);
    expect(
      new Date(unreadResponse.body.generatedAt).getTime() - new Date(unreadResponse.body.filters.dateFrom).getTime()
    ).toBe(24 * 60 * 60 * 1000);
    expect(todayResponse.body.context.articleCount).toBe(6);
    expect(unreadResponse.body.context.articleCount).toBe(5);
    expect(todayResponse.body.context.eventCount).toBe(5);
    expect(unreadResponse.body.context.eventCount).toBe(5);
    expect(todayResponse.body).toHaveProperty('morningSummary.items');
    expect(unreadResponse.body).toHaveProperty('morningSummary.items');
  });

  it.each([
    ['showOnlyInterestMatchedArticles', 6],
    ['showOnlyDevelopingEventArticles', 2]
  ])('applies the stored %s filter consistently', async (preferenceField, expectedCount) => {
    const preference = await BriefingPreference.create({
      userId: fixture.owner.id,
      [preferenceField]: true
    });

    try {
      const [summaryResponse, articleListResponse, countsResponse] = await Promise.all([
        request(app)
          .get('/api/articles/briefing')
          .query({ period: '7d', status: 'all' })
          .set('Authorization', authHeaderFor(fixture.owner)),
        request(app)
          .get('/api/articles')
          .query({ status: 'briefing', search: 'briefing:true @lastweek' })
          .set('Authorization', authHeaderFor(fixture.owner)),
        request(app)
          .post('/api/manager/overview-counts')
          .set('Authorization', authHeaderFor(fixture.owner))
          .send({ grouping: 'none' })
      ]);

      expect(summaryResponse.status).toBe(200);
      expect(summaryResponse.body.context.articleCount).toBe(expectedCount);
      expect(articleListResponse.status).toBe(200);
      expect(articleListResponse.body.itemIds).toHaveLength(expectedCount);
      expect(countsResponse.status).toBe(200);
      expect(countsResponse.body.briefingCount).toBe(expectedCount);
    } finally {
      await preference.destroy();
    }
  });

  it('uses the stored selection period instead of a stale requested period', async () => {
    const preference = await BriefingPreference.create({
      userId: fixture.owner.id,
      selectionPeriod: '24h',
      includeOnlyUnreadArticles: true,
      minDistinctSources: 2
    });

    try {
      const response = await request(app)
        .get('/api/articles/briefing')
        .query({ period: '7d', status: 'all' })
        .set('Authorization', authHeaderFor(fixture.owner));

      expect(response.status).toBe(200);
      expect(response.body.filters.period).toBe('24h');
      expect(response.body.filters.status).toBe('unread');
      expect(response.body.filters.minDistinctSources).toBe(2);
      expect(response.body.context.articleCount).toBe(1);

      const articleListResponse = await request(app)
        .get('/api/articles')
        .query({
          status: 'briefing',
          search: 'briefing:true @lastweek'
        })
        .set('Authorization', authHeaderFor(fixture.owner));

      expect(articleListResponse.status).toBe(200);
      expect(articleListResponse.body.itemIds).toHaveLength(1);
    } finally {
      await preference.destroy();
    }
  });

  it('adds trust sorting to the stored Daily Briefing article query', async () => {
    const preference = await BriefingPreference.create({
      userId: fixture.owner.id,
      selectionPeriod: '7d',
      prioritizeHighTrust: true
    });
    await Promise.all([
      fixture.feeds.firstFeed.update({ feedTrust: 0.1 }),
      fixture.feeds.secondFeed.update({ feedTrust: 0.9 })
    ]);

    try {
      const response = await request(app)
        .get('/api/articles')
        .query({
          status: 'briefing',
          search: 'briefing:true @lastweek',
          sort: 'desc'
        })
        .set('Authorization', authHeaderFor(fixture.owner));

      expect(response.status).toBe(200);
      expect(response.body.itemIds.indexOf(fixture.representatives.eventOneReadMember.id))
        .toBeLessThan(
          response.body.itemIds.indexOf(fixture.representatives.eventOneRepresentative.id)
        );
    } finally {
      await preference.destroy();
      await Promise.all([
        fixture.feeds.firstFeed.update({ feedTrust: 0.5 }),
        fixture.feeds.secondFeed.update({ feedTrust: 0.5 })
      ]);
    }
  });

});
