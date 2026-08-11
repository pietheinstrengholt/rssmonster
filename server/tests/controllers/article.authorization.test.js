import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import articleController from '../../controllers/article.js';

const {
  Article,
  BriefingPreference,
  Category,
  Event,
  Feed,
  Setting,
  Topic,
  User,
  sequelize
} = db;

let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createUser = username => User.create({
  username,
  password: 'hashed-password',
  feverCredentialHash: `${username}-hash`,
  role: 'user'
});

const authHeaderFor = user => {
  const token = jwt.sign(
    {
      username: user.username,
      userId: user.id
    },
    getJwtSecret()
  );

  return `Bearer ${token}`;
};

const createArticleFor = async user => {
  const category = await Category.create({
    userId: user.id,
    name: `${user.username} category`,
    categoryOrder: 1
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: `${user.username} feed`,
    url: `https://example.com/${user.username}.xml`
  });
  const article = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    url: `https://example.com/${user.username}/article`,
    title: `${user.username} article`,
    contentOriginal: '<p>Article body</p>',
    contentHtml: 'Article body',
    contentText: 'Article body',
    publishedAt: new Date('2026-05-01T10:00:00Z')
  });

  return { category, feed, article };
};

// Restores controller dependency spies after each error-path test.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('article ownership authorization', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('returns sanitized display HTML under the contentHtml API field', async () => {
    const owner = await createUser(uniqueName('article-owner'));
    const { article } = await createArticleFor(owner);

    const res = await request(app)
      .get(`/api/articles/${article.id}`)
      .set('Authorization', authHeaderFor(owner));

    expect(res.status).toBe(200);
    expect(res.body.article.contentHtml).toBe('Article body');
    expect(res.body.article.contentText).toBe('Article body');
    expect(article.contentOriginal).toBe('<p>Article body</p>');
    expect(res.body.article).not.toHaveProperty('contentOriginal');
    expect(JSON.stringify(res.body)).not.toContain('<p>Article body</p>');
    expect(app.get('json replacer')('contentOriginal', article.contentOriginal)).toBeUndefined();
    expect(res.body.article.contentSourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.article.contentTextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.article).not.toHaveProperty('contentStripped');
    expect(res.body.article).not.toHaveProperty('contentHash');
    expect(res.body.article).not.toHaveProperty('contentStrippedHash');
  });

  it('GET article by ID rejects foreign-user article', async () => {
    const owner = await createUser(uniqueName('article-owner'));
    const foreignUser = await createUser(uniqueName('article-viewer'));
    const { article } = await createArticleFor(owner);

    const res = await request(app)
      .get(`/api/articles/${article.id}`)
      .set('Authorization', authHeaderFor(foreignUser));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Article not found' });
  });

  it('returns the persisted click count after incrementing an owned article', async () => {
    const owner = await createUser(uniqueName('article-click-owner'));
    const { article } = await createArticleFor(owner);
    await article.update({ clickedAmount: 2 });

    const res = await request(app)
      .post(`/api/articles/markclicked/${article.id}`)
      .set('Authorization', authHeaderFor(owner));

    await article.reload();

    expect(res.status).toBe(200);
    expect(res.body.clickedAmount).toBe(3);
    expect(article.clickedAmount).toBe(3);
  });

  it('preserves concurrent click increments for one article', async () => {
    const owner = await createUser(uniqueName('concurrent-click-owner'));
    const { article } = await createArticleFor(owner);
    const authorization = authHeaderFor(owner);

    const responses = await Promise.all([
      request(app)
        .post(`/api/articles/markclicked/${article.id}`)
        .set('Authorization', authorization),
      request(app)
        .post(`/api/articles/markclicked/${article.id}`)
        .set('Authorization', authorization)
    ]);

    await article.reload();

    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(article.clickedAmount).toBe(2);
  });

  it('GET article by ID hides filtered articles from their owner', async () => {
    const owner = await createUser(uniqueName('filtered-article-owner'));
    const { article } = await createArticleFor(owner);
    await article.update({ filteredInd: true });

    const res = await request(app)
      .get(`/api/articles/${article.id}`)
      .set('Authorization', authHeaderFor(owner));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Article not found' });
  });

  it('returns only frontend-consumed article fields from the batch details endpoint', async () => {
    const owner = await createUser(uniqueName('article-details-owner'));
    const { article } = await createArticleFor(owner);
    await article.update({
      embedding_model: 'test-model',
      articleVector: [0.1, 0.2, 0.3]
    });

    const response = await request(app)
      .post('/api/articles/details')
      .set('Authorization', authHeaderFor(owner))
      .send({ articleIds: String(article.id) });

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      id: article.id,
      feedId: article.feedId,
      title: article.title,
      contentHtml: article.contentHtml,
      status: article.status
    });
    expect(response.body[0]).toHaveProperty('quality');
    expect(response.body[0]).toHaveProperty('isDevelopingStory', false);
    expect(response.body[0]).not.toHaveProperty('articleVector');
    expect(response.body[0]).not.toHaveProperty('embedding_model');
    expect(response.body[0]).not.toHaveProperty('contentOriginal');
    expect(response.body[0].contentText).toBe('Article body');
    expect(response.body[0]).not.toHaveProperty('contentTextHash');
    expect(response.body[0]).not.toHaveProperty('contentSourceHash');
  });

  it('serializes developing-story presentation state from the Article model', async () => {
    const owner = await createUser(uniqueName('developing-story-details-owner'));
    const { article: representativeArticle, feed } = await createArticleFor(owner);
    const developingArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/developing-article`,
      title: `${owner.username} developing article`,
      publishedAt: new Date('2026-05-01T11:00:00Z')
    });
    const event = await Event.create({
      userId: owner.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: developingArticle.id,
      name: `${owner.username} developing event`,
      articleCount: 2
    });
    await Article.update(
      { eventId: event.id },
      { where: { id: [representativeArticle.id, developingArticle.id] } }
    );

    const response = await request(app)
      .post('/api/articles/details')
      .set('Authorization', authHeaderFor(owner))
      .send({ articleIds: `${representativeArticle.id},${developingArticle.id}` });

    const articlesById = new Map(response.body.map(article => [article.id, article]));

    expect(response.status).toBe(200);
    expect(articlesById.get(representativeArticle.id).isDevelopingStory).toBe(false);
    expect(articlesById.get(developingArticle.id).isDevelopingStory).toBe(true);
  });

  it('persists the developing-events selection from article search requests', async () => {
    const owner = await createUser(uniqueName('developing-events-owner'));
    await createArticleFor(owner);

    const response = await request(app)
      .get('/api/articles')
      .query({
        status: 'unread',
        categoryId: '%',
        feedId: '%',
        includeDevelopingEvents: true
      })
      .set('Authorization', authHeaderFor(owner));

    const settings = await Setting.findOne({ where: { userId: owner.id } });

    expect(response.status).toBe(200);
    expect(Boolean(settings.includeDevelopingEvents)).toBe(true);
  });

  it('returns event article pointers with article details', async () => {
    const owner = await createUser(uniqueName('developing-badge-owner'));
    const { article: representativeArticle, feed } = await createArticleFor(owner);
    const developingArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/developing-article`,
      title: `${owner.username} developing article`,
      publishedAt: new Date('2026-05-01T11:00:00Z')
    });
    const event = await Event.create({
      userId: owner.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: developingArticle.id,
      name: 'Developing badge event'
    });
    await Article.update(
      { eventId: event.id },
      { where: { id: [representativeArticle.id, developingArticle.id] } }
    );

    const response = await request(app)
      .post('/api/articles/details')
      .set('Authorization', authHeaderFor(owner))
      .send({ articleIds: String(developingArticle.id) });

    expect(response.status).toBe(200);
    expect(response.body[0].event).toMatchObject({
      representativeArticleId: representativeArticle.id,
      developingArticleId: developingArticle.id
    });
  });

  it('GET duplicate articles returns owned duplicates and rejects foreign users', async () => {
    const owner = await createUser(uniqueName('duplicate-owner'));
    const foreignUser = await createUser(uniqueName('duplicate-viewer'));
    const { article, feed } = await createArticleFor(owner);
    const duplicate = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      duplicateOfArticleId: article.id,
      status: 'duplicate',
      url: `https://example.com/${owner.username}/duplicate`,
      title: `${owner.username} duplicate`,
      contentOriginal: '<p>Duplicate body</p>',
      contentHtml: 'Duplicate body',
      publishedAt: new Date('2026-05-01T11:00:00Z')
    });
    await Article.create({
      userId: owner.id,
      feedId: feed.id,
      duplicateOfArticleId: article.id,
      status: 'duplicate',
      filteredInd: true,
      url: `https://example.com/${owner.username}/filtered-duplicate`,
      title: `${owner.username} filtered duplicate`,
      contentOriginal: '<p>Filtered duplicate body</p>',
      contentHtml: 'Filtered duplicate body',
      publishedAt: new Date('2026-05-01T12:00:00Z')
    });

    const ownerResponse = await request(app)
      .get(`/api/articles/duplicates/${article.id}`)
      .set('Authorization', authHeaderFor(owner));
    const foreignResponse = await request(app)
      .get(`/api/articles/duplicates/${article.id}`)
      .set('Authorization', authHeaderFor(foreignUser));

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.articles.map(item => item.id)).toEqual([duplicate.id]);
    expect(ownerResponse.body.articles[0]).not.toHaveProperty('contentOriginal');
    expect(foreignResponse.status).toBe(404);
    expect(foreignResponse.body).toEqual({ error: 'Article not found' });
  });

  it('manager overview counts only unfiltered articles', async () => {
    const owner = await createUser(uniqueName('manager-filtered-owner'));
    const { feed, article } = await createArticleFor(owner);
    await article.update({
      interestScore: 0.5,
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    });
    await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'read',
      interestScore: 0.5,
      url: `https://example.com/${owner.username}/recent-read-article`,
      title: `${owner.username} recent read article`,
      contentOriginal: '<p>Recent read article body</p>',
      contentHtml: 'Recent read article body',
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
    });
    await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      filteredInd: true,
      url: `https://example.com/${owner.username}/filtered-article`,
      title: `${owner.username} filtered article`,
      contentOriginal: '<p>Filtered article body</p>',
      contentHtml: 'Filtered article body',
      publishedAt: new Date('2026-05-01T12:00:00Z')
    });

    const res = await request(app)
      .post('/api/manager/overview-counts')
      .set('Authorization', authHeaderFor(owner))
      .send({ grouping: 'none' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.briefingCount).toBe(2);
    expect(res.body.briefingSelectionPeriod).toBe('7d');
    expect(res.body.briefingIncludeOnlyUnreadArticles).toBe(false);
    expect(res.body.briefingMarkAsReadOnScroll).toBe(false);
    expect(res.body.briefingPrioritizeHighTrust).toBe(false);
    expect(res.body.briefingShowOnlyDevelopingEventArticles).toBe(false);
    expect(res.body.unreadCount).toBe(1);
    expect(res.body.categories[0].briefingCount).toBe(2);
    expect(res.body.categories[0].feeds[0].briefingCount).toBe(2);
    expect(res.body.categories[0].feeds[0].unreadCount).toBe(1);
    expect(article.filteredInd).toBe(false);

    await BriefingPreference.create({
      userId: owner.id,
      selectionPeriod: '24h'
    });

    const oneDayResponse = await request(app)
      .post('/api/manager/overview-counts')
      .set('Authorization', authHeaderFor(owner))
      .send({ grouping: 'none' });

    expect(oneDayResponse.status).toBe(200);
    expect(oneDayResponse.body.briefingSelectionPeriod).toBe('24h');
    expect(oneDayResponse.body.briefingIncludeOnlyUnreadArticles).toBe(false);
    expect(oneDayResponse.body.briefingCount).toBe(1);
    expect(oneDayResponse.body.categories[0].briefingCount).toBe(1);
    expect(oneDayResponse.body.categories[0].feeds[0].briefingCount).toBe(1);

    await BriefingPreference.update(
      { includeOnlyUnreadArticles: true, markAsReadOnScroll: true },
      { where: { userId: owner.id } }
    );

    const unreadOnlyResponse = await request(app)
      .post('/api/manager/overview-counts')
      .set('Authorization', authHeaderFor(owner))
      .send({ grouping: 'none' });

    expect(unreadOnlyResponse.status).toBe(200);
    expect(unreadOnlyResponse.body.briefingIncludeOnlyUnreadArticles).toBe(true);
    expect(unreadOnlyResponse.body.briefingMarkAsReadOnScroll).toBe(true);
    expect(unreadOnlyResponse.body.briefingCount).toBe(0);
    expect(unreadOnlyResponse.body.categories[0].briefingCount).toBe(0);
    expect(unreadOnlyResponse.body.categories[0].feeds[0].briefingCount).toBe(0);

    await BriefingPreference.update(
      {
        selectionPeriod: '7d',
        includeOnlyUnreadArticles: false,
        minDistinctSources: 2
      },
      { where: { userId: owner.id } }
    );

    const multipleSourcesResponse = await request(app)
      .post('/api/manager/overview-counts')
      .set('Authorization', authHeaderFor(owner))
      .send({ grouping: 'none' });

    expect(multipleSourcesResponse.status).toBe(200);
    expect(multipleSourcesResponse.body.briefingMinDistinctSources).toBe(2);
    expect(multipleSourcesResponse.body.briefingCount).toBe(0);
    expect(multipleSourcesResponse.body.categories[0].briefingCount).toBe(0);
    expect(multipleSourcesResponse.body.categories[0].feeds[0].briefingCount).toBe(0);
  });

  // Verifies grouped counts use the unread developing pointer selected by the article list.
  it('manager overview counts the developing event article when enabled', async () => {
    const owner = await createUser(uniqueName('manager-developing-owner'));
    const { article: representativeArticle, feed } = await createArticleFor(owner);
    await representativeArticle.update({ status: 'read' });
    const developingArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/developing-overview-article`,
      title: `${owner.username} developing overview article`,
      publishedAt: new Date('2026-05-01T11:00:00Z')
    });
    const event = await Event.create({
      userId: owner.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: developingArticle.id,
      name: `${owner.username} developing overview event`,
      articleCount: 2
    });
    await Article.update(
      { eventId: event.id },
      { where: { id: [representativeArticle.id, developingArticle.id] } }
    );

    const response = await request(app)
      .post('/api/manager/overview-counts')
      .set('Authorization', authHeaderFor(owner))
      .send({
        grouping: 'event',
        includeDevelopingEvents: true
      });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.unreadCount).toBe(1);
    expect(response.body.readCount).toBe(0);
    expect(response.body.categories[0].feeds[0].unreadCount).toBe(1);
  });

  it('mark-as-seen rejects foreign-user article without mutating it', async () => {
    const owner = await createUser(uniqueName('article-owner'));
    const foreignUser = await createUser(uniqueName('article-marker'));
    const { article } = await createArticleFor(owner);

    const res = await request(app)
      .post(`/api/articles/markasseen/${article.id}`)
      .set('Authorization', authHeaderFor(foreignUser))
      .send({
        selectedStatus: 'unread',
        visibleSeconds: 120
      });

    await article.reload();

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Error: article not found' });
    expect(article.status).toBe('unread');
    expect(article.firstSeen).toBeNull();
    expect(article.readAt).toBeNull();
    expect(article.attentionBucket).toBe(0);
  });

  it('mark-as-seen marks related event cluster articles as read', async () => {
    const owner = await createUser(uniqueName('article-owner'));
    const { article, feed } = await createArticleFor(owner);
    const relatedArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/related-article`,
      title: `${owner.username} related article`,
      contentOriginal: '<p>Related body</p>',
      contentHtml: 'Related body',
      publishedAt: new Date('2026-05-01T11:00:00Z')
    });
    const event = await Event.create({
      userId: owner.id,
      representativeArticleId: article.id,
      developingArticleId: article.id,
      name: `${owner.username} event`,
      articleCount: 2
    });

    await Article.update(
      { eventId: event.id },
      { where: { id: [article.id, relatedArticle.id] } }
    );

    const res = await request(app)
      .post(`/api/articles/markasseen/${article.id}`)
      .set('Authorization', authHeaderFor(owner))
      .send({
        selectedStatus: 'unread',
        grouping: 'event',
        visibleSeconds: 120
      });

    await article.reload();
    await relatedArticle.reload();
    await event.reload();

    expect(res.status).toBe(200);
    expect(article.status).toBe('read');
    expect(relatedArticle.status).toBe('read');
    expect(article.readAt).toBeInstanceOf(Date);
    expect(relatedArticle.readAt).toBeInstanceOf(Date);
    expect(event.representativeArticleId).toBe(article.id);
    expect(event.developingArticleId).toBe(article.id);
    expect(res.body.readArticleIds.sort()).toEqual([article.id, relatedArticle.id].sort());
  });

  // Verifies a topic acknowledgement reaches articles in every event under that topic.
  it('mark-as-seen marks related topic articles as read', async () => {
    const owner = await createUser(uniqueName('topic-seen-owner'));
    const { article, feed } = await createArticleFor(owner);
    const topic = await Topic.create({
      userId: owner.id,
      name: `${owner.username} topic`,
      topicKey: uniqueName('topic-seen-key')
    });
    const firstEvent = await Event.create({
      userId: owner.id,
      topicId: topic.id,
      representativeArticleId: article.id,
      name: `${owner.username} first event`,
      articleCount: 1
    });
    const relatedArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/topic-related-article`,
      title: `${owner.username} topic related article`,
      publishedAt: new Date('2026-05-01T11:00:00Z')
    });
    const secondEvent = await Event.create({
      userId: owner.id,
      topicId: topic.id,
      representativeArticleId: relatedArticle.id,
      name: `${owner.username} second event`,
      articleCount: 1
    });
    await article.update({ eventId: firstEvent.id, topicId: topic.id });
    await relatedArticle.update({ eventId: secondEvent.id, topicId: topic.id });

    const response = await request(app)
      .post(`/api/articles/markasseen/${article.id}`)
      .set('Authorization', authHeaderFor(owner))
      .send({
        selectedStatus: 'unread',
        grouping: 'topic',
        visibleSeconds: 120
      });

    await Promise.all([article.reload(), relatedArticle.reload()]);

    expect(response.status).toBe(200);
    expect(article.status).toBe('read');
    expect(relatedArticle.status).toBe('read');
    expect(response.body.readArticleIds.sort()).toEqual([article.id, relatedArticle.id].sort());
  });

  // Verifies first-seen tracking handles no engagement without changing read state.
  it('mark-as-seen records zero attention without marking an event read', async () => {
    const owner = await createUser(uniqueName('zero-attention-owner'));
    const { article } = await createArticleFor(owner);
    const event = await Event.create({
      userId: owner.id,
      representativeArticleId: article.id,
      name: `${owner.username} zero attention event`,
      articleCount: 1
    });
    await article.update({ eventId: event.id, contentHtml: null });

    const response = await request(app)
      .post(`/api/articles/markasseen/${article.id}`)
      .set('Authorization', authHeaderFor(owner))
      .send({
        selectedStatus: 'read',
        grouping: 'event',
        visibleSeconds: 0
      });

    await article.reload();

    expect(response.status).toBe(200);
    expect(article.status).toBe('unread');
    expect(article.firstSeen).toBeInstanceOf(Date);
    expect(article.attentionBucket).toBe(0);
    expect(response.body).not.toHaveProperty('readArticleIds');
  });

  it('mark-as-seen keeps an article-specific read from refreshing the developing pointer', async () => {
    const owner = await createUser(uniqueName('developing-pointer-owner'));
    const { article, feed } = await createArticleFor(owner);
    const newerArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/newer-developing-article`,
      title: `${owner.username} newer developing article`,
      publishedAt: new Date('2026-05-01T12:00:00Z')
    });
    const event = await Event.create({
      userId: owner.id,
      representativeArticleId: article.id,
      developingArticleId: article.id,
      name: `${owner.username} developing event`,
      articleCount: 2
    });
    await Article.update(
      { eventId: event.id },
      { where: { id: [article.id, newerArticle.id] } }
    );

    const res = await request(app)
      .post(`/api/articles/markasseen/${article.id}`)
      .set('Authorization', authHeaderFor(owner))
      .send({
        selectedStatus: 'unread',
        grouping: 'none',
        visibleSeconds: 120
      });

    await article.reload();
    await newerArticle.reload();
    await event.reload();

    expect(res.status).toBe(200);
    expect(article.status).toBe('read');
    expect(newerArticle.status).toBe('unread');
    expect(event.representativeArticleId).toBe(article.id);
    expect(event.developingArticleId).toBe(article.id);
  });

  it('mark-as-read with no grouping updates only selected articles and preserves pointers', async () => {
    const owner = await createUser(uniqueName('ungrouped-read-owner'));
    const { article, feed } = await createArticleFor(owner);
    const siblingArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/ungrouped-read-sibling`,
      title: `${owner.username} ungrouped read sibling`,
      publishedAt: new Date('2026-05-01T12:00:00Z')
    });
    const event = await Event.create({
      userId: owner.id,
      representativeArticleId: article.id,
      developingArticleId: article.id,
      name: `${owner.username} ungrouped read event`,
      articleCount: 2
    });
    await Article.update(
      { eventId: event.id },
      { where: { id: [article.id, siblingArticle.id] } }
    );

    const response = await request(app)
      .post('/api/articles/markasread')
      .set('Authorization', authHeaderFor(owner))
      .send({ articleIds: [article.id], grouping: 'none' });

    await article.reload();
    await siblingArticle.reload();
    await event.reload();

    expect(response.status).toBe(200);
    expect(article.status).toBe('read');
    expect(article.readAt).toBeInstanceOf(Date);
    expect(siblingArticle.status).toBe('unread');
    expect(siblingArticle.readAt).toBeNull();
    expect(event.representativeArticleId).toBe(article.id);
    expect(event.developingArticleId).toBe(article.id);
  });

  it('mark-as-read with event grouping acknowledges the event without moving pointers', async () => {
    const owner = await createUser(uniqueName('grouped-read-owner'));
    const { article, feed } = await createArticleFor(owner);
    const siblingArticles = await Promise.all([
      Article.create({
        userId: owner.id,
        feedId: feed.id,
        status: 'unread',
        url: `https://example.com/${owner.username}/grouped-read-sibling-one`,
        title: `${owner.username} grouped read sibling one`,
        publishedAt: new Date('2026-05-01T11:00:00Z')
      }),
      Article.create({
        userId: owner.id,
        feedId: feed.id,
        status: 'unread',
        url: `https://example.com/${owner.username}/grouped-read-sibling-two`,
        title: `${owner.username} grouped read sibling two`,
        publishedAt: new Date('2026-05-01T12:00:00Z')
      })
    ]);
    const event = await Event.create({
      userId: owner.id,
      representativeArticleId: article.id,
      developingArticleId: article.id,
      name: `${owner.username} grouped read event`,
      articleCount: 3
    });
    await Article.update(
      { eventId: event.id },
      { where: { id: [article.id, ...siblingArticles.map(item => item.id)] } }
    );

    const response = await request(app)
      .post('/api/articles/markasread')
      .set('Authorization', authHeaderFor(owner))
      .send({ articleIds: [article.id], grouping: 'event' });

    await Promise.all([article.reload(), ...siblingArticles.map(item => item.reload())]);
    await event.reload();

    expect(response.status).toBe(200);
    expect([article, ...siblingArticles].map(item => item.status)).toEqual([
      'read',
      'read',
      'read'
    ]);
    expect([article, ...siblingArticles].every(item => item.readAt instanceof Date)).toBe(true);
    expect(event.representativeArticleId).toBe(article.id);
    expect(event.developingArticleId).toBe(article.id);

    await Article.update(
      { status: 'unread', readAt: null },
      { where: { id: [article.id, ...siblingArticles.map(item => item.id)] } }
    );
    await article.update({ status: 'read', readAt: new Date() });

    const selectionResponse = await request(app)
      .post('/api/articles/markasread')
      .set('Authorization', authHeaderFor(owner))
      .send({
        grouping: 'event',
        snapshotArticleIds: [article.id]
      });

    await Promise.all([article.reload(), ...siblingArticles.map(item => item.reload())]);

    expect(selectionResponse.status).toBe(200);
    expect(selectionResponse.body.expandedEventCount).toBe(1);
    expect([article, ...siblingArticles].map(item => item.status)).toEqual([
      'read',
      'read',
      'read'
    ]);
  });

  // Verifies a final list snapshot cannot be broadened by a new live unread search.
  it('treats snapshot article IDs as the complete mark-as-read scope', async () => {
    const owner = await createUser(uniqueName('snapshot-read-owner'));
    const { article, feed } = await createArticleFor(owner);
    const excludedArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/excluded-from-snapshot`,
      title: `${owner.username} excluded from snapshot`,
      publishedAt: new Date('2026-05-01T12:00:00Z')
    });

    const response = await request(app)
      .post('/api/articles/markasread')
      .set('Authorization', authHeaderFor(owner))
      .send({
        grouping: 'none',
        snapshotArticleIds: [article.id]
      });

    await Promise.all([article.reload(), excludedArticle.reload()]);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ updatedCount: 1, matchedCount: 1 });
    expect(article.status).toBe('read');
    expect(excludedArticle.status).toBe('unread');
    expect(excludedArticle.readAt).toBeNull();

    const emptySnapshotResponse = await request(app)
      .post('/api/articles/markasread')
      .set('Authorization', authHeaderFor(owner))
      .send({ grouping: 'none', snapshotArticleIds: [] });

    await excludedArticle.reload();

    expect(emptySnapshotResponse.status).toBe(200);
    expect(emptySnapshotResponse.body).toMatchObject({
      updatedCount: 0,
      matchedCount: 0
    });
    expect(excludedArticle.status).toBe('unread');
  });

  it('mark-as-read with topic grouping updates every event and reports topic article counts', async () => {
    const owner = await createUser(uniqueName('topic-read-owner'));
    const { article, feed } = await createArticleFor(owner);
    const topic = await Topic.create({
      userId: owner.id,
      name: `${owner.username} topic`,
      topicKey: uniqueName('topic-read-key')
    });
    const firstEvent = await Event.create({
      userId: owner.id,
      topicId: topic.id,
      representativeArticleId: article.id,
      name: `${owner.username} first topic event`,
      articleCount: 1
    });
    const relatedArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/topic-read-related`,
      title: `${owner.username} topic read related`,
      publishedAt: new Date('2026-05-01T11:00:00Z')
    });
    const secondEvent = await Event.create({
      userId: owner.id,
      topicId: topic.id,
      representativeArticleId: relatedArticle.id,
      name: `${owner.username} second topic event`,
      articleCount: 1
    });
    await article.update({ eventId: firstEvent.id, topicId: topic.id });
    await relatedArticle.update({ eventId: secondEvent.id, topicId: topic.id });

    const detailsResponse = await request(app)
      .post('/api/articles/details')
      .set('Authorization', authHeaderFor(owner))
      .send({ articleIds: String(article.id) });
    const readResponse = await request(app)
      .post('/api/articles/markasread')
      .set('Authorization', authHeaderFor(owner))
      .send({ grouping: 'topic' });

    await Promise.all([article.reload(), relatedArticle.reload()]);

    expect(detailsResponse.status).toBe(200);
    expect(detailsResponse.body[0].event.topicArticleCount).toBe(2);
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.matchedCount).toBe(1);
    expect(readResponse.body.expandedEventCount).toBe(2);
    expect(article.status).toBe('read');
    expect(relatedArticle.status).toBe('read');

    await Article.update(
      { status: 'unread', readAt: null },
      { where: { id: [article.id, relatedArticle.id] } }
    );
    const eventReadResponse = await request(app)
      .post('/api/articles/markasread')
      .set('Authorization', authHeaderFor(owner))
      .send({ grouping: 'event' });

    expect(eventReadResponse.status).toBe(200);
    expect(eventReadResponse.body.expandedEventCount).toBe(2);
  });

  it('clears readAt when an article is marked unread', async () => {
    const owner = await createUser(uniqueName('mark-unread-owner'));
    const { article } = await createArticleFor(owner);
    await article.update({
      status: 'read',
      readAt: new Date('2026-05-01T12:00:00Z')
    });

    const response = await request(app)
      .post(`/api/articles/marktounread/${article.id}`)
      .set('Authorization', authHeaderFor(owner));

    await article.reload();

    expect(response.status).toBe(200);
    expect(article.status).toBe('unread');
    expect(article.readAt).toBeNull();
  });

  // Verifies marking an unavailable article unread returns the helper's not-found response.
  it('returns not found when marking an unavailable article unread', async () => {
    const owner = await createUser(uniqueName('missing-unread-owner'));

    const response = await request(app)
      .post('/api/articles/marktounread/2147483647')
      .set('Authorization', authHeaderFor(owner));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Article not found' });
  });

  // Verifies article-list first-page hydration returns the requested article details.
  it('hydrates the first article page when requested', async () => {
    const owner = await createUser(uniqueName('first-page-owner'));
    const { article } = await createArticleFor(owner);

    const response = await request(app)
      .get('/api/articles')
      .query({
        status: 'unread',
        categoryId: '%',
        feedId: '%',
        includeFirstPage: true,
        viewMode: 'minimal'
      })
      .set('Authorization', authHeaderFor(owner));

    expect(response.status).toBe(200);
    expect(response.body.itemIds).toContain(article.id);
    expect(response.body.firstPage).toHaveLength(1);
    expect(response.body.firstPage[0]).toMatchObject({
      id: article.id,
      title: article.title,
      contentText: 'Article body'
    });
  });

  // Verifies malformed duplicate identifiers fail before a database lookup.
  it('rejects a malformed duplicate article identifier', async () => {
    const owner = await createUser(uniqueName('duplicate-validation-owner'));

    const response = await request(app)
      .get('/api/articles/duplicates/not-a-number')
      .set('Authorization', authHeaderFor(owner));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'articleId is required' });
  });

  // Verifies explicit read requests report when no selected article remains unread.
  it('returns an empty result when selected articles are already read', async () => {
    const owner = await createUser(uniqueName('already-read-owner'));
    const { article } = await createArticleFor(owner);
    await article.update({ status: 'read', readAt: new Date() });

    const response = await request(app)
      .post('/api/articles/markasread')
      .set('Authorization', authHeaderFor(owner))
      .send({ articleIds: [article.id] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: 'No unread articles to mark as read',
      articles: []
    });
  });

  // Verifies query-based bulk reads update matching canonical articles only.
  it('marks search-matched articles as read without explicit identifiers', async () => {
    const owner = await createUser(uniqueName('search-read-owner'));
    const { article, feed } = await createArticleFor(owner);
    const secondArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/second-search-result`,
      title: `${owner.username} second search result`,
      publishedAt: new Date('2026-05-01T11:00:00Z')
    });
    const filteredArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      filteredInd: true,
      url: `https://example.com/${owner.username}/filtered-search-result`,
      title: `${owner.username} filtered search result`,
      publishedAt: new Date('2026-05-01T12:00:00Z')
    });

    const response = await request(app)
      .post('/api/articles/markasread')
      .set('Authorization', authHeaderFor(owner))
      .send({ grouping: 'none' });

    await Promise.all([article.reload(), secondArticle.reload(), filteredArticle.reload()]);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: 'Articles marked as read',
      updatedCount: 2,
      matchedCount: 2,
      expandedEventCount: 0
    });
    expect([article.status, secondArticle.status]).toEqual(['read', 'read']);
    expect(filteredArticle.status).toBe('unread');
  });

  // Verifies an empty query-based bulk read returns stable zero counts.
  it('returns zero counts when a bulk read query has no matches', async () => {
    const owner = await createUser(uniqueName('empty-search-read-owner'));

    const response = await request(app)
      .post('/api/articles/markasread')
      .set('Authorization', authHeaderFor(owner))
      .send({ grouping: 'none' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: 'No unread articles to mark as read',
      updatedCount: 0,
      matchedCount: 0,
      expandedEventCount: 0
    });
  });

  // Verifies batch click tracking updates owned canonical articles and reports their counts.
  it('increments click counts for a batch of owned articles', async () => {
    const owner = await createUser(uniqueName('batch-click-owner'));
    const { article, feed } = await createArticleFor(owner);
    const secondArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      clickedAmount: 4,
      url: `https://example.com/${owner.username}/second-click`,
      title: `${owner.username} second click`,
      publishedAt: new Date('2026-05-01T11:00:00Z')
    });

    const response = await request(app)
      .post('/api/articles/markclicked')
      .set('Authorization', authHeaderFor(owner))
      .send({ articleIds: [article.id, secondArticle.id] });

    await Promise.all([article.reload(), secondArticle.reload()]);

    expect(response.status).toBe(200);
    expect(response.body.articles).toEqual(expect.arrayContaining([
      { id: article.id, clickedAmount: 1 },
      { id: secondArticle.id, clickedAmount: 5 }
    ]));
    expect([article.clickedAmount, secondArticle.clickedAmount]).toEqual([1, 5]);
  });

  it('preserves concurrent batch click increments', async () => {
    const owner = await createUser(uniqueName('concurrent-batch-click-owner'));
    const { article, feed } = await createArticleFor(owner);
    const secondArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/concurrent-second-click`,
      title: `${owner.username} concurrent second click`,
      publishedAt: new Date('2026-05-01T11:00:00Z')
    });
    const authorization = authHeaderFor(owner);
    const articleIds = [article.id, secondArticle.id];

    const responses = await Promise.all([
      request(app)
        .post('/api/articles/markclicked')
        .set('Authorization', authorization)
        .send({ articleIds }),
      request(app)
        .post('/api/articles/markclicked')
        .set('Authorization', authorization)
        .send({ articleIds })
    ]);

    await Promise.all([article.reload(), secondArticle.reload()]);

    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect([article.clickedAmount, secondArticle.clickedAmount]).toEqual([2, 2]);
  });

  // Verifies click tracking validates an otherwise empty batch request.
  it('requires an article identifier for click tracking', async () => {
    const owner = await createUser(uniqueName('click-validation-owner'));

    const response = await request(app)
      .post('/api/articles/markclicked')
      .set('Authorization', authHeaderFor(owner))
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'articleId is required' });
  });

  // Verifies negative feedback is persisted only for an owned article.
  it('marks an owned article as not interested and rejects foreign ownership', async () => {
    const owner = await createUser(uniqueName('not-interested-owner'));
    const foreignUser = await createUser(uniqueName('not-interested-foreign'));
    const { article } = await createArticleFor(owner);

    const successResponse = await request(app)
      .post(`/api/articles/marknotinterested/${article.id}`)
      .set('Authorization', authHeaderFor(owner));
    const foreignResponse = await request(app)
      .post(`/api/articles/marknotinterested/${article.id}`)
      .set('Authorization', authHeaderFor(foreignUser));

    await article.reload();

    expect(successResponse.status).toBe(200);
    expect(successResponse.body).toMatchObject({ articleId: String(article.id) });
    expect(foreignResponse.status).toBe(404);
    expect(article.negativeInd).toBe(1);
  });

  // Verifies article details reject requests that omit their identifier list.
  it('requires article identifiers for batch details', async () => {
    const owner = await createUser(uniqueName('details-validation-owner'));

    const response = await request(app)
      .post('/api/articles/details')
      .set('Authorization', authHeaderFor(owner))
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'articleIds is not set' });
  });

  // Verifies favorite actions cover validation, batch updates, and single-article clearing.
  it('validates and updates favorite state for batch and single requests', async () => {
    const owner = await createUser(uniqueName('favorite-owner'));
    const { article, feed } = await createArticleFor(owner);
    const secondArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/second-favorite`,
      title: `${owner.username} second favorite`,
      publishedAt: new Date('2026-05-01T11:00:00Z')
    });

    const missingUpdateResponse = await request(app)
      .post('/api/articles/markasfavorite')
      .set('Authorization', authHeaderFor(owner))
      .send({ articleIds: [article.id] });
    const missingIdsResponse = await request(app)
      .post('/api/articles/markasfavorite')
      .set('Authorization', authHeaderFor(owner))
      .send({ update: 'mark' });
    const batchResponse = await request(app)
      .post('/api/articles/markasfavorite')
      .set('Authorization', authHeaderFor(owner))
      .send({ update: 'mark', articleIds: `${article.id},${secondArticle.id}` });
    const singleResponse = await request(app)
      .post(`/api/articles/markasfavorite/${article.id}`)
      .set('Authorization', authHeaderFor(owner))
      .send({ update: 'unmark' });

    await Promise.all([article.reload(), secondArticle.reload()]);

    expect(missingUpdateResponse.status).toBe(400);
    expect(missingIdsResponse.status).toBe(400);
    expect(batchResponse.status).toBe(200);
    expect(singleResponse.status).toBe(200);
    expect(article.favoriteInd).toBe(0);
    expect(secondArticle.favoriteInd).toBe(1);
  });

  // Verifies favorite updates distinguish missing batches and unavailable single articles.
  it('returns not found for unavailable favorite targets', async () => {
    const owner = await createUser(uniqueName('missing-favorite-owner'));

    const batchResponse = await request(app)
      .post('/api/articles/markasfavorite')
      .set('Authorization', authHeaderFor(owner))
      .send({ update: 'mark', articleIds: ['2147483647'] });
    const singleResponse = await request(app)
      .post('/api/articles/markasfavorite/2147483647')
      .set('Authorization', authHeaderFor(owner))
      .send({ update: 'mark' });

    expect(batchResponse.status).toBe(404);
    expect(batchResponse.body).toEqual({ message: 'Articles not found' });
    expect(singleResponse.status).toBe(404);
    expect(singleResponse.body).toEqual({ message: 'Article not found' });
  });

  // Verifies database failures are translated into stable mutation API errors.
  it('handles article mutation database failures', async () => {
    const owner = await createUser(uniqueName('mutation-error-owner'));
    const authorization = authHeaderFor(owner);

    vi.spyOn(Article, 'findOne').mockRejectedValueOnce(new Error('seen lookup failed'));
    const seenResponse = await request(app)
      .post('/api/articles/markasseen/1')
      .set('Authorization', authorization)
      .send({});

    vi.spyOn(Article, 'findOne').mockRejectedValueOnce(new Error('unread lookup failed'));
    const unreadResponse = await request(app)
      .post('/api/articles/marktounread/1')
      .set('Authorization', authorization);

    vi.spyOn(Article, 'findOne').mockRejectedValueOnce(new Error('favorite lookup failed'));
    const favoriteResponse = await request(app)
      .post('/api/articles/markasfavorite/1')
      .set('Authorization', authorization)
      .send({ update: 'mark' });

    expect(seenResponse.status).toBe(500);
    expect(seenResponse.body).toEqual({ error: 'Unable to mark article as read' });
    expect(unreadResponse.status).toBe(400);
    expect(unreadResponse.body).toEqual({ message: 'Error updating article' });
    expect(favoriteResponse.status).toBe(500);
    expect(favoriteResponse.body).toEqual({ error: 'Unable to update article favorite status' });
  });

  // Verifies synchronous request failures reach the remaining controller catch handler.
  it('handles malformed mutation request state', async () => {
    const requestWithBrokenUserData = {};
    Object.defineProperty(requestWithBrokenUserData, 'userData', {
      get: () => {
        throw new Error('invalid request state');
      }
    });
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    await articleController.articleMarkToUnread(requestWithBrokenUserData, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: 'Unable to mark article as unread' });
  });

  it('completes mark-all-read requests when persistence fails', async () => {
    const owner = await createUser(uniqueName('mark-all-failure-owner'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Article, 'update').mockRejectedValueOnce(new Error('update failed'));

    const response = await request(app)
      .post('/api/articles/markallasread')
      .set('Authorization', authHeaderFor(owner));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Unable to mark all articles as read'
    });
    expect(errorSpy).toHaveBeenCalledWith(
      'Error in articleMarkAllAsRead:',
      expect.any(Error)
    );
  });

  // Verifies mark-all-read remains user scoped and ignores filtered articles.
  it('marks all owned canonical articles as read', async () => {
    const owner = await createUser(uniqueName('mark-all-owner'));
    const foreignUser = await createUser(uniqueName('mark-all-foreign'));
    const { article, feed } = await createArticleFor(owner);
    const { article: foreignArticle } = await createArticleFor(foreignUser);
    const filteredArticle = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      filteredInd: true,
      url: `https://example.com/${owner.username}/filtered-mark-all`,
      title: `${owner.username} filtered mark all`,
      publishedAt: new Date('2026-05-01T11:00:00Z')
    });

    const response = await request(app)
      .post('/api/articles/markallasread')
      .set('Authorization', authHeaderFor(owner));

    await Promise.all([article.reload(), foreignArticle.reload(), filteredArticle.reload()]);

    expect(response.status).toBe(200);
    expect(response.body).toBe('marked all as read');
    expect(article.status).toBe('read');
    expect(article.readAt).toBeInstanceOf(Date);
    expect(foreignArticle.status).toBe('unread');
    expect(filteredArticle.status).toBe('unread');
  });

  // Verifies every mutating and detail controller rejects a valid token without tenant identity.
  it('rejects article operations when the token has no user identifier', async () => {
    const tokenWithoutUserId = jwt.sign(
      { username: uniqueName('missing-user-id') },
      getJwtSecret()
    );
    const authorization = `Bearer ${tokenWithoutUserId}`;
    const operations = [
      ['get', '/api/articles/briefing', undefined],
      ['get', '/api/articles/duplicates/1', undefined],
      ['get', '/api/articles/1', undefined],
      ['post', '/api/articles/markasread', {}],
      ['post', '/api/articles/markclicked', {}],
      ['post', '/api/articles/marknotinterested/1', {}],
      ['post', '/api/articles/markmorelikethis/1', {}],
      ['post', '/api/articles/details', { articleIds: '1' }],
      ['post', '/api/articles/markasseen/1', {}],
      ['post', '/api/articles/marktounread/1', {}],
      ['post', '/api/articles/markasfavorite/1', { update: 'mark' }],
      ['post', '/api/articles/markallasread', {}]
    ];

    for (const [method, path, body] of operations) {
      let operation = request(app)[method](path).set('Authorization', authorization);
      if (body !== undefined) operation = operation.send(body);
      const response = await operation;

      expect(response.status, `${method.toUpperCase()} ${path}`).toBe(401);
      expect(response.body, `${method.toUpperCase()} ${path}`).toEqual({
        error: 'Unauthorized: missing userId'
      });
    }
  });
});
