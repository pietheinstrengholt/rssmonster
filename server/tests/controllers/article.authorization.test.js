import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const { Article, Category, Event, Feed, User, sequelize } = db;

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
    published: new Date('2026-05-01T10:00:00Z')
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
      published: new Date('2026-05-01T11:00:00Z')
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
      published: new Date('2026-05-01T12:00:00Z')
    });

    const ownerResponse = await request(app)
      .get(`/api/articles/duplicates/${article.id}`)
      .set('Authorization', authHeaderFor(owner));
    const foreignResponse = await request(app)
      .get(`/api/articles/duplicates/${article.id}`)
      .set('Authorization', authHeaderFor(foreignUser));

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.articles.map(item => item.id)).toEqual([duplicate.id]);
    expect(foreignResponse.status).toBe(404);
    expect(foreignResponse.body).toEqual({ error: 'Article not found' });
  });

  it('manager overview counts only unfiltered articles', async () => {
    const owner = await createUser(uniqueName('manager-filtered-owner'));
    const { feed, article } = await createArticleFor(owner);
    await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      filteredInd: true,
      url: `https://example.com/${owner.username}/filtered-article`,
      title: `${owner.username} filtered article`,
      contentOriginal: '<p>Filtered article body</p>',
      contentHtml: 'Filtered article body',
      published: new Date('2026-05-01T12:00:00Z')
    });

    const res = await request(app)
      .post('/api/manager/overview-counts')
      .set('Authorization', authHeaderFor(owner))
      .send({ grouping: 'none' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.unreadCount).toBe(1);
    expect(res.body.categories[0].feeds[0].unreadCount).toBe(1);
    expect(article.filteredInd).toBe(false);
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
      published: new Date('2026-05-01T11:00:00Z')
    });
    const event = await Event.create({
      userId: owner.id,
      representativeArticleId: article.id,
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

    expect(res.status).toBe(200);
    expect(article.status).toBe('read');
    expect(relatedArticle.status).toBe('read');
    expect(res.body.readArticleIds.sort()).toEqual([article.id, relatedArticle.id].sort());
  });
});
