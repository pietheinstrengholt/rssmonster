import { describe, it, expect, beforeAll } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';
import { searchArticles } from '../../services/articleSearch/articleSearch.service.js';

const {
  sequelize,
  User,
  Category,
  Feed,
  Article,
  Event,
  Topic,
  EventTopic,
  Island,
  IslandTopic,
  Tag,
  Setting
} = db;

describe('articleSearch.service', () => {
  let user;
  let category;
  let feed;
  const articles = {};

  beforeAll(async () => {
    await sequelize.authenticate();

    // ---- User ----
    const password = 'secret';
    const hash = await bcrypt.hash(password, 10);
    user = await User.create({
      username: 'searchtestuser',
      password,
      hash,
      role: 'user'
    });

    // ---- Category ----
    category = await Category.create({
      userId: user.id,
      name: 'Search Test Category',
      categoryOrder: 0
    });

    // ---- Feed ----
    feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Search Test Feed',
      url: 'https://example.com/search-test.xml'
    });

    // ---- Settings (default score thresholds) ----
    await Setting.create({
      userId: user.id,
      categoryId: '%',
      feedId: '%',
      status: 'unread',
      sort: 'desc',
      minAdvertisementScore: 0,
      minSentimentScore: 0,
      minQualityScore: 0,
      viewMode: 'full',
      grouping: 'none'
    });

    // ---- Articles with diverse properties ----
    const now = new Date();
    const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000);

    articles.recent = await Article.create({
      userId: user.id,
      feedId: feed.id,
      url: 'https://example.com/article-recent',
      title: 'Breaking: JavaScript Framework Released',
      description: 'A new JavaScript framework has been released today.',
      contentOriginal: '<p>A new JavaScript framework has been released today with exciting features.</p>',
      contentHtml: 'A new JavaScript framework has been released today with exciting features.',
      status: 'unread',
      firstSeen: hoursAgo(0.5),
      publishedAt: hoursAgo(1),
      advertisementScore: 90,
      sentimentScore: 80,
      qualityScore: 85
    });

    articles.old = await Article.create({
      userId: user.id,
      feedId: feed.id,
      url: 'https://example.com/article-old',
      title: 'Python Tips and Tricks',
      description: 'A collection of Python programming tips.',
      contentOriginal: '<p>Here are some useful Python programming tips and tricks for developers.</p>',
      contentHtml: 'Here are some useful Python programming tips and tricks for developers.',
      status: 'unread',
      publishedAt: hoursAgo(72),
      advertisementScore: 70,
      sentimentScore: 70,
      qualityScore: 70
    });

    articles.starred = await Article.create({
      userId: user.id,
      feedId: feed.id,
      url: 'https://example.com/article-starred',
      title: 'Rust Memory Safety Guide',
      description: 'Understanding memory safety in Rust programming language.',
      contentOriginal: '<p>Rust provides memory safety without garbage collection through its ownership system.</p>',
      contentHtml: 'Rust provides memory safety without garbage collection through its ownership system.',
      status: 'read',
      favoriteInd: 1,
      firstSeen: hoursAgo(23),
      publishedAt: hoursAgo(24),
      advertisementScore: 95,
      sentimentScore: 90,
      qualityScore: 90
    });

    articles.clicked = await Article.create({
      userId: user.id,
      feedId: feed.id,
      url: 'https://example.com/article-clicked',
      title: 'Docker Container Best Practices',
      description: 'Best practices for Docker containers in production.',
      contentOriginal: '<p>Learn the best practices for running Docker containers in production environments.</p>',
      contentHtml: 'Learn the best practices for running Docker containers in production environments.',
      status: 'read',
      clickedAmount: 3,
      publishedAt: hoursAgo(48),
      advertisementScore: 80,
      sentimentScore: 75,
      qualityScore: 80
    });

    articles.lowQuality = await Article.create({
      userId: user.id,
      feedId: feed.id,
      url: 'https://example.com/article-low-quality',
      title: 'BUY NOW Amazing Product Deal!!!',
      description: 'Incredible limited time offer on amazing products.',
      contentOriginal: '<p>Buy our amazing product now! Limited time offer! Act fast!</p>',
      contentHtml: 'Buy our amazing product now! Limited time offer! Act fast!',
      status: 'unread',
      publishedAt: hoursAgo(6),
      advertisementScore: 10,
      sentimentScore: 30,
      qualityScore: 20
    });

    articles.discarded = await Article.create({
      userId: user.id,
      feedId: feed.id,
      url: 'https://example.com/article-discarded',
      title: 'Discard-rule article',
      description: 'This row is retained for ingestion history.',
      contentOriginal: '<p>This row must stay hidden from normal queries.</p>',
      contentHtml: 'This row must stay hidden from normal queries.',
      status: 'unread',
      filteredInd: true,
      publishedAt: hoursAgo(2),
      advertisementScore: 90,
      sentimentScore: 90,
      qualityScore: 90
    });

    // ---- Tags ----
    await Tag.create({ articleId: articles.recent.id, userId: user.id, name: 'javascript' });
    await Tag.create({ articleId: articles.recent.id, userId: user.id, name: 'framework' });
    await Tag.create({ articleId: articles.starred.id, userId: user.id, name: 'rust' });
    await Tag.create({ articleId: articles.clicked.id, userId: user.id, name: 'docker' });
  });

  // ============================
  // Basic queries
  // ============================

  describe('basic queries', () => {
    it('returns unread articles by default', async () => {
      const result = await searchArticles({ userId: user.id });
      // recent, old, lowQuality are unread
      expect(result.itemIds).toContain(articles.recent.id);
      expect(result.itemIds).toContain(articles.old.id);
      expect(result.itemIds).toContain(articles.lowQuality.id);
      // starred and clicked are read
      expect(result.itemIds).not.toContain(articles.starred.id);
      expect(result.itemIds).not.toContain(articles.clicked.id);
      expect(result.itemIds).not.toContain(articles.discarded.id);
    });

    it('throws when userId is missing', async () => {
      await expect(searchArticles({})).rejects.toThrow('Missing userId');
    });

    it('returns all statuses when status is %', async () => {
      const result = await searchArticles({ userId: user.id, status: '%' });
      expect(result.itemIds.length).toBe(5);
      expect(result.itemIds).not.toContain(articles.discarded.id);
    });

    it('returns favorite articles when status is favorite', async () => {
      const result = await searchArticles({ userId: user.id, status: 'favorite' });
      expect(result.itemIds).toContain(articles.starred.id);
      expect(result.itemIds.length).toBe(1);
    });

    it('keeps legacy star status as a favorite alias', async () => {
      const result = await searchArticles({ userId: user.id, status: 'star' });
      expect(result.itemIds).toContain(articles.starred.id);
      expect(result.itemIds.length).toBe(1);
    });
  });

  // ============================
  // Text search
  // ============================

  describe('text search', () => {
    it('searches title and content with unquoted words', async () => {
      const result = await searchArticles({ userId: user.id, search: 'JavaScript', status: '%' });
      expect(result.itemIds).toContain(articles.recent.id);
    });

    it('searches with quoted exact phrase', async () => {
      const result = await searchArticles({ userId: user.id, search: '"memory safety"', status: '%' });
      expect(result.itemIds).toContain(articles.starred.id);
      expect(result.itemIds).not.toContain(articles.recent.id);
    });

    it('combines title: filter with text search', async () => {
      const result = await searchArticles({ userId: user.id, search: 'title:Docker', status: '%' });
      expect(result.itemIds).toContain(articles.clicked.id);
      expect(result.itemIds).not.toContain(articles.recent.id);
    });

    it('supports title:"exact phrase" filter', async () => {
      const result = await searchArticles({ userId: user.id, search: 'title:"Python Tips"', status: '%' });
      expect(result.itemIds).toContain(articles.old.id);
      expect(result.itemIds.length).toBe(1);
    });
  });

  // ============================
  // Field filters via search string
  // ============================

  describe('field filters', () => {
    it('filters by favorite:true', async () => {
      const result = await searchArticles({ userId: user.id, search: 'favorite:true' });
      expect(result.itemIds).toContain(articles.starred.id);
      result.itemIds.forEach(id => {
        expect(id).toBe(articles.starred.id);
      });
    });

    it('keeps legacy star:true as a favorite alias', async () => {
      const result = await searchArticles({ userId: user.id, search: 'star:true' });
      expect(result.itemIds).toContain(articles.starred.id);
    });

    it('filters by unread:true', async () => {
      const result = await searchArticles({ userId: user.id, search: 'unread:true' });
      expect(result.itemIds).toContain(articles.recent.id);
      expect(result.itemIds).not.toContain(articles.starred.id);
      expect(result.itemIds).not.toContain(articles.clicked.id);
    });

    it('filters by read:true', async () => {
      const result = await searchArticles({ userId: user.id, search: 'read:true' });
      expect(result.itemIds).toContain(articles.starred.id);
      expect(result.itemIds).toContain(articles.clicked.id);
      expect(result.itemIds).not.toContain(articles.recent.id);
    });

    it('filters by clicked:true', async () => {
      const result = await searchArticles({ userId: user.id, search: 'clicked:true' });
      expect(result.itemIds).toContain(articles.clicked.id);
      expect(result.itemIds).not.toContain(articles.recent.id);
    });

    it('filters by seen:true and seen:false', async () => {
      const seenResult = await searchArticles({ userId: user.id, search: 'seen:true', status: '%' });
      expect(seenResult.itemIds).toContain(articles.recent.id);
      expect(seenResult.itemIds).toContain(articles.starred.id);
      expect(seenResult.itemIds).not.toContain(articles.old.id);

      const unseenResult = await searchArticles({ userId: user.id, search: 'seen:false', status: '%' });
      expect(unseenResult.itemIds).toContain(articles.old.id);
      expect(unseenResult.itemIds).not.toContain(articles.recent.id);
      expect(unseenResult.itemIds).not.toContain(articles.starred.id);
    });

    it('combines multiple field filters', async () => {
      const result = await searchArticles({ userId: user.id, search: 'star:true read:true' });
      expect(result.itemIds).toContain(articles.starred.id);
      // clicked is read but not starred
      expect(result.itemIds).not.toContain(articles.clicked.id);
    });
  });

  describe('island filtering', () => {
    it('filters articles through active island memberships on any event topic', async () => {
      let linkedArticle;
      let unlinkedArticle;
      let linkedEvent;
      let unlinkedEvent;
      let topic;
      let island;

      try {
        linkedArticle = await Article.create({
          userId: user.id,
          feedId: feed.id,
          url: 'https://example.com/article-island-linked',
          title: 'Island-linked article',
          contentOriginal: '<p>Linked through an event topic to an interest island.</p>',
          contentHtml: 'Linked through an event topic to an interest island.',
          status: 'unread',
          publishedAt: new Date(),
          advertisementScore: 80,
          sentimentScore: 80,
          qualityScore: 80
        });
        unlinkedArticle = await Article.create({
          userId: user.id,
          feedId: feed.id,
          url: 'https://example.com/article-island-unlinked',
          title: 'Article without an island',
          contentOriginal: '<p>This event has no applicable interest island.</p>',
          contentHtml: 'This event has no applicable interest island.',
          status: 'unread',
          publishedAt: new Date(),
          advertisementScore: 80,
          sentimentScore: 80,
          qualityScore: 80
        });
        linkedEvent = await Event.create({
          userId: user.id,
          representativeArticleId: linkedArticle.id,
          topicId: null
        });
        unlinkedEvent = await Event.create({
          userId: user.id,
          representativeArticleId: unlinkedArticle.id,
          topicId: null
        });
        await linkedArticle.update({ eventId: linkedEvent.id });
        await unlinkedArticle.update({ eventId: unlinkedEvent.id });

        topic = await Topic.create({
          userId: user.id,
          name: 'Search island topic',
          topicKey: 'search-island-topic'
        });
        island = await Island.create({
          userId: user.id,
          label: 'Search interest island',
          weight: 0.8
        });
        await EventTopic.create({
          eventId: linkedEvent.id,
          topicId: topic.id,
          confidence: 0.9,
          rank: 1,
          primaryInd: false
        });
        await IslandTopic.create({
          islandId: island.id,
          topicId: topic.id,
          similarity: 0.9,
          confidence: 0.9
        });

        const included = await searchArticles({ userId: user.id, search: 'island:true', status: '%' });
        const excluded = await searchArticles({ userId: user.id, search: 'island:false', status: '%' });

        expect(included.itemIds).toContain(linkedArticle.id);
        expect(included.itemIds).not.toContain(unlinkedArticle.id);
        expect(excluded.itemIds).toContain(unlinkedArticle.id);
        expect(excluded.itemIds).not.toContain(linkedArticle.id);
        expect(excluded.itemIds).toContain(articles.recent.id);

        await island.update({ archivedInd: true, archivedAt: new Date() });
        const archivedIncluded = await searchArticles({ userId: user.id, search: 'island:true', status: '%' });
        const archivedExcluded = await searchArticles({ userId: user.id, search: 'island:false', status: '%' });

        expect(archivedIncluded.itemIds).not.toContain(linkedArticle.id);
        expect(archivedExcluded.itemIds).toContain(linkedArticle.id);
      } finally {
        if (linkedEvent) await EventTopic.destroy({ where: { eventId: linkedEvent.id } });
        if (island) await IslandTopic.destroy({ where: { islandId: island.id } });
        if (linkedEvent) await Event.destroy({ where: { id: linkedEvent.id } });
        if (unlinkedEvent) await Event.destroy({ where: { id: unlinkedEvent.id } });
        if (island) await Island.destroy({ where: { id: island.id } });
        if (topic) await Topic.destroy({ where: { id: topic.id } });
        if (linkedArticle) await Article.destroy({ where: { id: linkedArticle.id } });
        if (unlinkedArticle) await Article.destroy({ where: { id: unlinkedArticle.id } });
      }
    });
  });

  describe('briefing filtering', () => {
    it('combines nonzero interest scores and multi-article event membership', async () => {
      const createdArticles = [];
      const createdEvents = [];

      try {
        const articleValues = [
          { slug: 'positive-interest', interestScore: 0.7 },
          { slug: 'negative-interest', interestScore: -0.4 },
          { slug: 'event-member-one', interestScore: 0 },
          { slug: 'event-member-two', interestScore: 0 },
          { slug: 'single-event', interestScore: 0 },
          { slug: 'not-briefing', interestScore: 0 }
        ];

        for (const values of articleValues) {
          createdArticles.push(await Article.create({
            userId: user.id,
            feedId: feed.id,
            url: `https://example.com/article-briefing-${values.slug}`,
            title: `Briefing test ${values.slug}`,
            contentOriginal: `<p>Briefing test ${values.slug}.</p>`,
            contentHtml: `Briefing test ${values.slug}.`,
            status: 'unread',
            publishedAt: new Date(),
            advertisementScore: 80,
            sentimentScore: 80,
            qualityScore: 80,
            interestScore: values.interestScore
          }));
        }

        const [positiveInterest, negativeInterest, eventMemberOne, eventMemberTwo, singleEvent, notBriefing] = createdArticles;
        const multiArticleEvent = await Event.create({
          userId: user.id,
          representativeArticleId: eventMemberOne.id,
          articleCount: 2
        });
        const singletonEvent = await Event.create({
          userId: user.id,
          representativeArticleId: singleEvent.id,
          articleCount: 1
        });
        createdEvents.push(multiArticleEvent, singletonEvent);

        await eventMemberOne.update({ eventId: multiArticleEvent.id });
        await eventMemberTwo.update({ eventId: multiArticleEvent.id });
        await singleEvent.update({ eventId: singletonEvent.id });

        const included = await searchArticles({
          userId: user.id,
          search: 'briefing:true',
          status: '%'
        });
        const excluded = await searchArticles({
          userId: user.id,
          search: 'briefing:false',
          status: '%'
        });

        expect(included.itemIds).toContain(positiveInterest.id);
        expect(included.itemIds).toContain(negativeInterest.id);
        expect(included.itemIds).toContain(eventMemberOne.id);
        expect(included.itemIds).toContain(eventMemberTwo.id);
        expect(included.itemIds).not.toContain(singleEvent.id);
        expect(included.itemIds).not.toContain(notBriefing.id);

        expect(excluded.itemIds).not.toContain(positiveInterest.id);
        expect(excluded.itemIds).not.toContain(negativeInterest.id);
        expect(excluded.itemIds).not.toContain(eventMemberOne.id);
        expect(excluded.itemIds).not.toContain(eventMemberTwo.id);
        expect(excluded.itemIds).toContain(singleEvent.id);
        expect(excluded.itemIds).toContain(notBriefing.id);

        const countResult = await searchArticles({
          userId: user.id,
          search: 'briefing:true',
          status: '%',
          countOnly: true
        });
        expect(countResult.articleCount).toBe(included.itemIds.length);
      } finally {
        for (const event of createdEvents) {
          await event.destroy();
        }
        for (const article of createdArticles) {
          await article.destroy();
        }
      }
    });
  });

  // ============================
  // Score thresholds
  // ============================

  describe('score thresholds', () => {
    it.each(['quality:nope', 'freshness:nope'])(
      'keeps the default unread scope for malformed numeric filter %s',
      async malformedFilter => {
        const result = await searchArticles({ userId: user.id, search: malformedFilter });

        expect(result.itemIds).toContain(articles.recent.id);
        expect(result.itemIds).not.toContain(articles.starred.id);
        expect(result.itemIds).not.toContain(articles.clicked.id);
      }
    );

    it('still relaxes the default status for a valid numeric filter', async () => {
      const result = await searchArticles({ userId: user.id, search: 'quality:>=0' });

      expect(result.itemIds).toContain(articles.recent.id);
      expect(result.itemIds).toContain(articles.starred.id);
      expect(result.itemIds).toContain(articles.clicked.id);
    });

    it('filters out articles below minAdvertisementScore', async () => {
      const result = await searchArticles({
        userId: user.id,
        status: '%',
        minAdvertisementScore: 50
      });
      // lowQuality has advertisementScore=10, should be filtered out
      expect(result.itemIds).not.toContain(articles.lowQuality.id);
      expect(result.itemIds).toContain(articles.recent.id);
    });

    it('filters out articles below minQualityScore', async () => {
      const result = await searchArticles({
        userId: user.id,
        status: '%',
        minQualityScore: 50
      });
      // lowQuality has qualityScore=20
      expect(result.itemIds).not.toContain(articles.lowQuality.id);
      expect(result.itemIds).toContain(articles.starred.id);
    });

    it('filters out articles below minSentimentScore', async () => {
      const result = await searchArticles({
        userId: user.id,
        status: '%',
        minSentimentScore: 60
      });
      // lowQuality has sentimentScore=30
      expect(result.itemIds).not.toContain(articles.lowQuality.id);
      expect(result.itemIds).toContain(articles.recent.id);
    });

    it('applies all score thresholds together', async () => {
      const result = await searchArticles({
        userId: user.id,
        status: '%',
        minAdvertisementScore: 70,
        minSentimentScore: 70,
        minQualityScore: 70
      });
      // Only articles meeting all three thresholds
      expect(result.itemIds).toContain(articles.old.id); // 70/70/70
      expect(result.itemIds).toContain(articles.starred.id); // 95/90/90
      expect(result.itemIds).toContain(articles.recent.id); // 90/80/85
      expect(result.itemIds).toContain(articles.clicked.id); // 80/75/80
      expect(result.itemIds).not.toContain(articles.lowQuality.id); // 10/30/20
    });
  });

  // ============================
  // Tag filtering
  // ============================

  describe('tag filtering', () => {
    it('filters by tag parameter', async () => {
      const result = await searchArticles({ userId: user.id, tag: 'javascript', status: '%' });
      expect(result.itemIds).toContain(articles.recent.id);
      expect(result.itemIds.length).toBe(1);
    });

    it('filters by tag: search token', async () => {
      const result = await searchArticles({ userId: user.id, search: 'tag:rust', status: '%' });
      expect(result.itemIds).toContain(articles.starred.id);
      expect(result.itemIds.length).toBe(1);
    });

    it('tag: search token overrides tag parameter', async () => {
      const result = await searchArticles({ userId: user.id, search: 'tag:docker', tag: 'javascript', status: '%' });
      expect(result.itemIds).toContain(articles.clicked.id);
      expect(result.itemIds).not.toContain(articles.recent.id);
    });
  });

  // ============================
  // Sort
  // ============================

  describe('sorting', () => {
    it('sorts by publishedAt DESC by default', async () => {
      const result = await searchArticles({ userId: user.id, status: '%' });
      // Articles should be newest first
      const recentIdx = result.itemIds.indexOf(articles.recent.id);
      const oldIdx = result.itemIds.indexOf(articles.old.id);
      expect(recentIdx).toBeLessThan(oldIdx);
    });

    it('sorts by publishedAt ASC when specified', async () => {
      const result = await searchArticles({ userId: user.id, sort: 'asc', status: '%' });
      const recentIdx = result.itemIds.indexOf(articles.recent.id);
      const oldIdx = result.itemIds.indexOf(articles.old.id);
      expect(oldIdx).toBeLessThan(recentIdx);
    });

    it('sort: search token overrides sort parameter', async () => {
      const result = await searchArticles({ userId: user.id, search: 'sort:asc', sort: 'desc', status: '%' });
      const recentIdx = result.itemIds.indexOf(articles.recent.id);
      const oldIdx = result.itemIds.indexOf(articles.old.id);
      expect(oldIdx).toBeLessThan(recentIdx);
    });

    it('sorts by recommended using loaded cluster attributes', async () => {
      let lowCoverageArticle;
      let highCoverageArticle;
      let lowCluster;
      let highCluster;

      try {
        const now = new Date();
        lowCoverageArticle = await Article.create({
          userId: user.id,
          feedId: feed.id,
          url: 'https://example.com/article-importance-low-coverage',
          title: 'Local incident report',
          description: 'Single-source local incident report',
          contentOriginal: '<p>Single-source local incident report.</p>',
          contentHtml: 'Single-source local incident report.',
          status: 'unread',
          publishedAt: now,
          advertisementScore: 75,
          sentimentScore: 75,
          qualityScore: 75
        });

        highCoverageArticle = await Article.create({
          userId: user.id,
          feedId: feed.id,
          url: 'https://example.com/article-importance-high-coverage',
          title: 'Major event covered widely',
          description: 'Multi-source reporting of a major event',
          contentOriginal: '<p>Multi-source reporting of a major event.</p>',
          contentHtml: 'Multi-source reporting of a major event.',
          status: 'unread',
          publishedAt: now,
          advertisementScore: 75,
          sentimentScore: 75,
          qualityScore: 75
        });

        lowCluster = await Event.create({
          userId: user.id,
          representativeArticleId: lowCoverageArticle.id,
          topicId: null,
          articleCount: 2,
          sourceCount: 1,
          sourceDiversityScore: 0.69,
          eventStrength: 0.4
        });

        highCluster = await Event.create({
          userId: user.id,
          representativeArticleId: highCoverageArticle.id,
          topicId: null,
          articleCount: 30,
          sourceCount: 8,
          sourceDiversityScore: 2.4,
          eventStrength: 0.9
        });

        await lowCoverageArticle.update({ eventId: lowCluster.id });
        await highCoverageArticle.update({ eventId: highCluster.id });

        const result = await searchArticles({ userId: user.id, status: 'unread', sort: 'recommended' });
        const lowCoverageIdx = result.itemIds.indexOf(lowCoverageArticle.id);
        const highCoverageIdx = result.itemIds.indexOf(highCoverageArticle.id);

        expect(highCoverageIdx).toBeGreaterThanOrEqual(0);
        expect(lowCoverageIdx).toBeGreaterThanOrEqual(0);
        expect(highCoverageIdx).toBeLessThan(lowCoverageIdx);
      } finally {
        if (lowCluster) {
          await Event.destroy({ where: { id: lowCluster.id } });
        }
        if (highCluster) {
          await Event.destroy({ where: { id: highCluster.id } });
        }
        if (lowCoverageArticle) {
          await Article.destroy({ where: { id: lowCoverageArticle.id } });
        }
        if (highCoverageArticle) {
          await Article.destroy({ where: { id: highCoverageArticle.id } });
        }
      }
    });
  });

  // ============================
  // Limit
  // ============================

  describe('limit', () => {
    it('respects limit: search token', async () => {
      const result = await searchArticles({ userId: user.id, search: 'limit:2', status: '%' });
      expect(result.itemIds.length).toBe(2);
    });

    it('respects limitCount for smart folders', async () => {
      const result = await searchArticles({
        userId: user.id,
        status: '%',
        smartFolderSearch: true,
        limitCount: 3
      });
      expect(result.itemIds.length).toBe(3);
    });

    it('caps countOnly smart folder results with limitCount', async () => {
      const result = await searchArticles({
        userId: user.id,
        status: '%',
        smartFolderSearch: true,
        limitCount: 3,
        countOnly: true
      });
      expect(result.articleCount).toBe(3);
      expect(result).not.toHaveProperty('itemIds');
    });
  });

  // ============================
  // Date filters
  // ============================

  describe('date filters', () => {
    it.each(['@2026-02-31', '@2026-99-99'])(
      'keeps the default unread scope for invalid calendar date %s',
      async invalidDate => {
        const result = await searchArticles({ userId: user.id, search: invalidDate });

        expect(result.itemIds).toContain(articles.recent.id);
        expect(result.itemIds).not.toContain(articles.starred.id);
        expect(result.itemIds).not.toContain(articles.clicked.id);
      }
    );

    it('filters by @today (last 24h)', async () => {
      const result = await searchArticles({ userId: user.id, search: '@today', status: '%' });
      // recent (1h ago) and lowQuality (6h ago) are within 24h
      expect(result.itemIds).toContain(articles.recent.id);
      expect(result.itemIds).toContain(articles.lowQuality.id);
      // old (72h ago) is not within 24h
      expect(result.itemIds).not.toContain(articles.old.id);
    });

    it('filters by @lastweek', async () => {
      const result = await searchArticles({ userId: user.id, search: '@lastweek', status: '%' });
      // All articles are within 7 days
      expect(result.itemIds.length).toBe(5);
    });
  });

  // ============================
  // Response shape
  // ============================

  describe('response shape', () => {
    it('returns query metadata and itemIds array', async () => {
      const result = await searchArticles({ userId: user.id });
      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('itemIds');
      expect(result.query).toHaveProperty('userId', user.id);
      expect(Array.isArray(result.itemIds)).toBe(true);
    });

    it('echoes back search string in response', async () => {
      const result = await searchArticles({ userId: user.id, search: 'hello' });
      expect(result.query.search).toBe('hello');
    });

    it('echoes back tag filter in response', async () => {
      const result = await searchArticles({ userId: user.id, search: 'tag:docker', status: '%' });
      expect(result.query.tag).toBe('docker');
    });

    it('echoes back date token in response', async () => {
      const result = await searchArticles({ userId: user.id, search: '@today', status: '%' });
      expect(result.query.date).toBe('today');
    });

    it('returns articleCount without itemIds for countOnly queries', async () => {
      const result = await searchArticles({ userId: user.id, status: '%', countOnly: true });
      expect(result).toHaveProperty('query');
      expect(result.articleCount).toBe(5);
      expect(result).not.toHaveProperty('itemIds');
    });

    it('returns zero for countOnly tag queries without matches', async () => {
      const result = await searchArticles({
        userId: user.id,
        search: 'tag:missing',
        status: '%',
        countOnly: true
      });
      expect(result.articleCount).toBe(0);
      expect(result).not.toHaveProperty('itemIds');
    });
  });
});
