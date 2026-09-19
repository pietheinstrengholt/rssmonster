import { beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { buildPopulationAuditEntry } from '../../services/islands/islandAudit.js';

const {
  Article,
  Category,
  Event,
  Feed,
  Island,
  User,
  sequelize
} = db;

let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// This function creates a signed authorization header for test requests.
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

// This function creates one user-owned article with a semantic vector.
const createArticleFixture = async user => {
  const category = await Category.create({
    userId: user.id,
    name: uniqueName('islands-category'),
    categoryOrder: 1
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: uniqueName('islands-feed'),
    url: `https://example.com/${uniqueName('feed')}.xml`
  });

  const article = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    favoriteInd: 1,
    clickedAmount: 2,
    url: `https://example.com/${uniqueName('article')}`,
    title: 'Island overview article',
    contentOriginal: '<p>Article body</p>',
    contentHtml: 'Article body',
    articleVector: [1, 0, 0],
    publishedAt: new Date('2026-05-01T10:00:00Z')
  });

  return { article,  };
};

// This function creates Event rows for the settings Event overview.
const createEventFixture = async user => {
  const category = await Category.create({
    userId: user.id,
    name: uniqueName('events-category'),
    categoryOrder: 1
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: uniqueName('events-feed'),
    url: `https://example.com/${uniqueName('events-feed')}.xml`
  });

  const firstArticle = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    favoriteInd: 1,
    clickedAmount: 1,
    url: `https://example.com/${uniqueName('event-article-1')}`,
    title: 'First event article',
    contentOriginal: '<p>Article body</p>',
    contentHtml: 'Article body',
    articleVector: [1, 0, 0],
    publishedAt: new Date('2026-05-01T10:00:00Z')
  });
  const secondArticle = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    favoriteInd: 0,
    clickedAmount: 0,
    url: `https://example.com/${uniqueName('event-article-2')}`,
    title: 'Second event article',
    contentOriginal: '<p>Article body</p>',
    contentHtml: 'Article body',
    articleVector: [0.9, 0.1, 0],
    publishedAt: new Date('2026-05-01T11:00:00Z')
  });
  const unclusteredArticle = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    url: `https://example.com/${uniqueName('unclustered-article')}`,
    title: 'Unclustered article',
    contentOriginal: '<p>Article body</p>',
    contentHtml: 'Article body',
    articleVector: [0, 1, 0],
    publishedAt: new Date('2026-05-02T10:00:00Z')
  });
  const event = await Event.create({
    userId: user.id,
    representativeArticleId: firstArticle.id,
    name: 'Readable event',
    generatedName: 'Generated readable event',
    articleCount: 2,
    sourceCount: 1,
    eventStrength: 0.7,
    status: 'active',
    eventWindowStartAt: new Date('2026-05-01T10:00:00Z'),
    eventWindowEndAt: new Date('2026-05-01T11:00:00Z')
  });

  await firstArticle.update({ eventId: event.id });
  await secondArticle.update({ eventId: event.id });

  return { event, firstArticle, secondArticle, unclusteredArticle };
};

describe('settings islands overview', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('retains owned positive and reading history, clocks, rules and lifecycle explanations in the API', async () => {
    const user = await User.create({ username: uniqueName('audit-owner') });
    const foreign = await User.create({ username: uniqueName('audit-foreign') });
    const { article } = await createArticleFixture(user);
    const { article: foreignArticle } = await createArticleFixture(foreign);
    const time = new Date('2026-05-02T10:00:00Z');
    await article.update({ positiveInd: 1, positiveFeedbackAt: time, attentionBucket: 4, lastMeaningfulReadAt: time });
    const tag = await db.Tag.create({ userId: user.id, articleId: article.id, tagType: 'rule', name: 'rule-origin' });
    await db.Tag.create({ userId: foreign.id, articleId: article.id, tagType: 'rule', name: 'foreign-rule' });
    const entry = await buildPopulationAuditEntry({ userId: user.id, articleIds: [article.id, foreignArticle.id] });
    entry.lifecycle = [{ reason: 'renewed', qualifyingBehaviorAt: time.toISOString() }];
    expect(entry.articleIds).toEqual([article.id]);
    await Island.create({ userId: user.id, label: 'Audited', weight: 0.5, lastBehaviorAt: new Date(), populationAudit: [entry] });
    await article.update({ positiveInd: 0, attentionBucket: 0 });
    await tag.destroy();
    const response = await request(app).get('/api/setting/islands').set('Authorization', authHeaderFor(user));
    expect(response.status).toBe(200);
    const result = response.body.islands[0];
    expect(result.populationAudit[0].lifecycle).toEqual(entry.lifecycle);
    expect(result.populationAudit[0].sourceArticles.articles[0]).toMatchObject({
      positiveInd: 1, attentionBucket: 4, positiveFeedbackAt: time.toISOString(), lastMeaningfulReadAt: time.toISOString(),
      ruleProvenance: { tags: [{ id: tag.id, name: 'rule-origin' }] }
    });
    expect(result.sourceArticles[0].evidence.map(signal => signal.type)).toEqual(expect.arrayContaining(['positive', 'deepRead']));
  });

  it('returns learned islands and their behavioral sources without coverage fields', async () => {
    const user = await User.create({
      username: uniqueName('islands-user'),
      password: 'hashed-password',
      feverCredentialHash: uniqueName('islands-hash'),
      role: 'user'
    });
    const { article,  } = await createArticleFixture(user);
    const island = await Island.create({ lastBehaviorAt: new Date(),
      userId: user.id,
      label: 'Readable island',
      generatedLabel: 'Generated readable island',
      weight: 0.75,
      islandVector: [1, 0, 0],
      populationAudit: [{
        sourceArticles: {
          starredArticleIds: [article.id]
        }
      }]
    });

    const res = await request(app)
      .get('/api/setting/islands')
      .set('Authorization', authHeaderFor(user));

    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ islandCount: 1 });
    expect(res.body.islands[0]).not.toHaveProperty('relatedArticles');
    expect(res.body.islands[0]).not.toHaveProperty('relatedArticleCount');
    expect(res.body.islands).toHaveLength(1);
    expect(res.body.islands[0]).toMatchObject({
      id: island.id,
      label: 'Readable island',
      generatedLabel: 'Generated readable island',
      sourceArticleCount: 1,
      evidenceSignalCount: 2,
    });
    expect(res.body.islands[0].sourceArticles).toHaveLength(1);
    expect(res.body.islands[0].sourceArticles[0]).toMatchObject({
      id: article.id,
      title: 'Island overview article',
      evidence: [
        { type: 'favorite', label: 'Favorite' },
        { type: 'click', label: '2 clicks' }
      ]
    });
  });

  it('explains an article-seeded island from its behavioral source', async () => {
    const user = await User.create({
      username: uniqueName('source-island-user'),
      password: 'hashed-password',
      feverCredentialHash: uniqueName('source-island-hash'),
      role: 'user'
    });
    const { article } = await createArticleFixture(user);
    await article.update({ favoriteInd: 0, clickedAmount: 0, attentionBucket: 3 });
    const island = await Island.create({ lastBehaviorAt: new Date(),
      userId: user.id,
      label: 'PC Gaming',
      weight: 0.39,
      islandVector: [1, 0, 0],
      populationAudit: [{
        articleIds: [article.id],
        sourceArticles: { articles: [{ id: article.id }] }
      }]
    });

    const res = await request(app)
      .get('/api/setting/islands')
      .set('Authorization', authHeaderFor(user));

    expect(res.status).toBe(200);
    expect(res.body.islands[0]).toMatchObject({
      id: island.id,
      sourceArticleCount: 1,
      evidenceSignalCount: 1
    });
    expect(res.body.islands[0].sourceArticles[0]).toMatchObject({
      id: article.id,
      evidence: [{ type: 'deepRead', label: 'Deep read' }]
    });
  });

  it('does not scan article vectors for Settings coverage', async () => {
    const user = await User.create({
      username: uniqueName('batched-islands-user'),
      password: 'hashed-password',
      feverCredentialHash: uniqueName('batched-islands-hash'),
      role: 'user'
    });
    await Island.bulkCreate([
      { userId: user.id, label: 'First island', weight: 0.8, islandVector: [1, 0, 0] },
      { userId: user.id, label: 'Second island', weight: 0.7, islandVector: [0, 1, 0] }
    ]);
    const querySpy = vi.spyOn(sequelize, 'query');

    try {
      const res = await request(app)
        .get('/api/setting/islands')
        .set('Authorization', authHeaderFor(user));

      expect(res.status).toBe(200);
      expect(res.body.islands).toHaveLength(2);
      const executedSql = querySpy.mock.calls.map(([sql]) => String(sql));
      expect(executedSql.filter(sql => sql.includes('`articleVector`'))).toHaveLength(0);
      expect(executedSql.length).toBeLessThan(12);
    } finally {
      querySpy.mockRestore();
    }
  });

  it('returns large audit histories in island order without including another user', async () => {
    const user = await User.create({ username: uniqueName('large-audit-owner') });
    const foreign = await User.create({ username: uniqueName('large-audit-foreign') });
    const populationAudit = [{ reason: 'x'.repeat(1024 * 1024), articleIds: [] }];
    const createIsland = (label, weight, archivedInd = false) => Island.create({
      userId: user.id, label, weight, archivedInd, lastBehaviorAt: new Date(), populationAudit
    });
    const archived = await createIsland('Archived', 1, true);
    const weak = await createIsland('Weak', 0.2);
    const strong = await createIsland('Strong', 0.8);
    const newerStrong = await createIsland('Newer strong', 0.8);
    await Island.create({ userId: foreign.id, label: 'Foreign', weight: 1, populationAudit });

    const res = await request(app).get('/api/setting/islands').set('Authorization', authHeaderFor(user));

    expect(res.status).toBe(200);
    expect(res.body.islands.map(island => island.id)).toEqual([newerStrong.id, strong.id, weak.id, archived.id]);
    expect(res.body.totals.islandCount).toBe(3);
    for (const island of res.body.islands) {
      expect(island.userId).toBe(user.id);
      expect(island.populationAudit).toEqual(populationAudit);
    }
  });

  it('presents expired history as inactive before archival is persisted', async () => {
    const user = await User.create({ username: uniqueName('expired-islands'), role: 'user' });
    const expired = await Island.create({ userId: user.id, label: 'Expired strong preference', weight: 1,
      islandVector: [1, 0, 0], lastBehaviorAt: new Date(Math.floor(Date.now() / 1000) * 1000 - 91 * 86400000) });
    const res = await request(app).get('/api/setting/islands').set('Authorization', authHeaderFor(user));
    expect(res.status).toBe(200);
    expect(res.body.totals.islandCount).toBe(0);
    expect(res.body.islands).toHaveLength(1);
    expect(res.body.islands[0]).toMatchObject({ id: expired.id, archivedInd: true, effectiveWeight: 0,
      expiresAt: new Date(expired.lastBehaviorAt.getTime() + 90 * 86400000).toISOString() });
    await expired.reload();
    expect(expired.archivedInd).toBe(false);
  });
});

describe('settings events overview', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('returns Event counts without duplicate semantic matches', async () => {
    const user = await User.create({
      username: uniqueName('events-user'),
      password: 'hashed-password',
      feverCredentialHash: uniqueName('events-hash'),
      role: 'user'
    });
    const { event,  } = await createEventFixture(user);

    const res = await request(app)
      .get('/api/setting/events')
      .set('Authorization', authHeaderFor(user));

    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({
      totalArticles: 3,
      unclusteredArticles: 1,
      eventLinkedArticles: 2,
      unassignedArticles: 1,
      eventCount: 1,
      activeEventCount: 1,
      eventReuseRatio: 66.7,
      newEventRatio: 33.3,
      averageArticlesPerEvent: 2,
      largestEventSize: 2,

    });
    expect(res.body.eventSizeBuckets).toContainEqual({ bucket: '2', count: 1 });
    expect(res.body.events[0]).toMatchObject({
      id: event.id,
      name: 'Readable event',
      generatedName: 'Generated readable event',
      articleCount: 2,
      actualArticleCount: 2
    });

  });
});
