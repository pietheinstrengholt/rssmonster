import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

// Provides the database models used by recommendation endpoint tests.
const { Article, Category, Feed, User, sequelize } = db;
let app;

// This function creates an isolated authenticated article graph for endpoint tests.
async function createUserGraph(label = 'recommendation-endpoint') {
  const suffix = randomUUID();
  const user = await User.create({
    username: `${label}-${suffix}`,
    password: 'hashed-password',
    feverCredentialHash: `${label}-${suffix}-hash`,
    role: 'user'
  });
  const category = await Category.create({
    userId: user.id,
    name: `${label} category`,
    categoryOrder: 1
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: `${label} feed`,
    url: `https://example.com/${suffix}/feed.xml`
  });

  return { suffix, user, feed };
}

// This function creates an article for recommendation endpoint tests.
async function createArticle(graph, slug, vector, overrides = {}) {
  return Article.create({
    userId: graph.user.id,
    feedId: graph.feed.id,
    status: 'unread',
    url: `https://example.com/${graph.suffix}/${slug}`,
    title: `Endpoint ${slug}`,
    description: `Endpoint description for ${slug}`,
    articleVector: vector,
    embedding_model: 'recommendation-endpoint-model',
    publishedAt: new Date('2026-08-01T12:00:00.000Z'),
    ...overrides
  });
}

// This function creates a bearer token for an authenticated test user.
function authHeaderFor(user) {
  return `Bearer ${jwt.sign({
    username: user.username,
    userId: user.id
  }, getJwtSecret())}`;
}

describe('GET /api/articles/:articleId/recommendations', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    const mod = await import('../../app.js');
    app = mod.default;
    await sequelize.authenticate();
  }, 50_000);

  it('returns the public recommendation projection without vectors or diagnostics', async () => {
    const graph = await createUserGraph();
    const source = await createArticle(graph, 'source', [1, 0]);
    const candidate = await createArticle(graph, 'candidate', [0.9, 0.1]);

    const response = await request(app)
      .get(`/api/articles/${source.id}/recommendations`)
      .set('Authorization', authHeaderFor(graph.user));

    expect(response.status).toBe(200);
    expect(response.body.sourceArticleId).toBe(source.id);
    expect(response.body.articles).toHaveLength(1);
    expect(response.body.articles[0]).toMatchObject({
      id: candidate.id,
      feedId: graph.feed.id,
      title: candidate.title,
      recommendationSimilarity: expect.any(Number),
      Feed: {
        id: graph.feed.id,
        feedName: graph.feed.feedName
      }
    });
    expect(response.body.articles[0]).not.toHaveProperty('articleVector');
    expect(response.body.articles[0]).not.toHaveProperty('embedding_model');
    expect(response.body).not.toHaveProperty('diagnostics');
  });

  it('returns 200 with an empty array for a valid source without recommendations', async () => {
    const graph = await createUserGraph('empty-recommendations');
    const source = await createArticle(graph, 'source', null, { embedding_model: null });

    const response = await request(app)
      .get(`/api/articles/${source.id}/recommendations`)
      .set('Authorization', authHeaderFor(graph.user));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      sourceArticleId: source.id,
      articles: []
    });
  });

  it('returns 400 for an invalid article id', async () => {
    const graph = await createUserGraph('invalid-id');

    const response = await request(app)
      .get('/api/articles/not-a-number/recommendations')
      .set('Authorization', authHeaderFor(graph.user));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid articleId' });
  });

  it('returns 404 for nonexistent and foreign-user source articles', async () => {
    const ownerGraph = await createUserGraph('endpoint-owner');
    const viewerGraph = await createUserGraph('endpoint-viewer');
    const source = await createArticle(ownerGraph, 'source', [1, 0]);

    const foreignResponse = await request(app)
      .get(`/api/articles/${source.id}/recommendations`)
      .set('Authorization', authHeaderFor(viewerGraph.user));
    const missingResponse = await request(app)
      .get('/api/articles/2147483647/recommendations')
      .set('Authorization', authHeaderFor(viewerGraph.user));

    expect(foreignResponse.status).toBe(404);
    expect(foreignResponse.body).toEqual({ error: 'Article not found' });
    expect(missingResponse.status).toBe(404);
    expect(missingResponse.body).toEqual({ error: 'Article not found' });
  });

  it('rejects a valid token that lacks an authenticated user id', async () => {
    const authorization = `Bearer ${jwt.sign({ username: 'missing-user-id' }, getJwtSecret())}`;
    const response = await request(app)
      .get('/api/articles/1/recommendations')
      .set('Authorization', authorization);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized: missing userId' });
  });
});
