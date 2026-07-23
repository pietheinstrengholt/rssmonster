import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const { Article, BriefingPreference, Category, Event, Feed, Setting, User, sequelize } = db;

let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createUser = username => User.create({
  username,
  password: 'hashed-password',
  hash: `${username}-hash`,
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
    expect(response.body[0]).not.toHaveProperty('contentText');
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
    expect(res.body.briefingPrioritizeHighTrust).toBe(false);
    expect(res.body.unreadCount).toBe(1);
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

    await BriefingPreference.update(
      { includeOnlyUnreadArticles: true },
      { where: { userId: owner.id } }
    );

    const unreadOnlyResponse = await request(app)
      .post('/api/manager/overview-counts')
      .set('Authorization', authHeaderFor(owner))
      .send({ grouping: 'none' });

    expect(unreadOnlyResponse.status).toBe(200);
    expect(unreadOnlyResponse.body.briefingIncludeOnlyUnreadArticles).toBe(true);
    expect(unreadOnlyResponse.body.briefingCount).toBe(0);

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
});
