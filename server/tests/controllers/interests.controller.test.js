import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { ISLAND_INACTIVITY_DAYS } from '../../services/islands/islandDeadline.js';

let app;
beforeAll(async () => { app = (await import('../../app.js')).default; });
async function fixture() {
  const user = await db.User.create({ username: `interests-${randomUUID()}` });
  const authorization = `Bearer ${jwt.sign({ userId: user.id, username: user.username }, getJwtSecret())}`;
  const get = path => request(app).get(`/api/interests${path}`).set('Authorization', authorization);
  const patch = (path, muted) => request(app).patch(`/api/interests${path}`).set('Authorization', authorization).send({ muted });
  const island = values => db.Island.create({ userId: user.id, label: 'Interest', weight: 0.5, lastBehaviorAt: new Date(), ...values });
  return { user, get, patch, island };
}

describe('My interests read API', () => {
  it('requires authentication and returns an empty owned collection', async () => {
    const owner = await fixture();
    expect((await request(app).get('/api/interests')).status).toBe(400);
    expect((await request(app).get('/api/interests/1')).status).toBe(400);
    expect((await request(app).patch('/api/interests/1').send({ muted: true })).status).toBe(400);
    const response = await owner.get('');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ interests: [], summary: { total: 0, positive: 0, negative: 0, neutral: 0, active: 0, archived: 0 } });
  });

  it('presents signed preference, signal snapshots, labels and activity without internal data', async () => {
    const owner = await fixture(); const foreign = await fixture();
    await foreign.island({ label: 'Private' });
    const lastBehaviorAt = new Date(Math.floor(Date.now() / 1000) * 1000 - 60000);
    const positive = await owner.island({ generatedLabel: 'Generated', lastBehaviorAt,
      positiveSignals: { stars: 2, clicks: 4, deepReads: 3, positives: 1 },
      islandVector: [1, 0], embedding_model: 'private-model', populationAudit: [{ private: true }] });
    const negative = await owner.island({ weight: -0.8, positiveSignals: { negatives: 2, stars: 1 } });
    const legacy = await owner.island({ weight: -0.2 });
    const neutral = await owner.island({ weight: 0, generatedLabel: '   ' });
    const response = await owner.get('');
    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({ total: 4, positive: 1, negative: 2, neutral: 1 });
    const byId = new Map(response.body.interests.map(row => [Number(row.id), row]));
    expect(byId.get(positive.id)).toEqual({ id: positive.id, name: 'Generated', polarity: 'positive', weight: 0.5,
      evidenceStrength: 50, lastActivityAt: lastBehaviorAt.toISOString(), lifecycle: 'active', muted: false,
      evidence: { favorites: 2, clicks: 4, deepReads: 3 } });
    expect(byId.get(negative.id)).toMatchObject({ name: 'Interest', polarity: 'negative', evidenceStrength: 80, evidence: { negativeFeedback: 2 } });
    expect(byId.get(legacy.id)).not.toHaveProperty('evidence');
    expect(byId.get(neutral.id)).toMatchObject({ name: 'Interest', polarity: 'neutral', evidenceStrength: 0 });
    expect(response.body.interests.map(row => Number(row.id))).toEqual([negative.id, positive.id, legacy.id, neutral.id]);
    const detail = await owner.get(`/${positive.id}`);
    expect(Object.keys(detail.body.interest).sort()).toEqual([...Object.keys(byId.get(positive.id)), 'representativeArticles'].sort());
  });

  it('uses the existing active deadline, including expiry before persisted archival', async () => {
    const owner = await fixture();
    await owner.island({ label: 'Active' });
    await owner.island({ archivedInd: true, archivedAt: new Date() });
    await owner.island({ lastBehaviorAt: new Date(Date.now() - ISLAND_INACTIVITY_DAYS * 86400000) });
    await owner.island({ lastBehaviorAt: null });
    await owner.island({ lastBehaviorAt: new Date(Date.now() + 86400000) });
    const response = await owner.get('');
    expect(response.body.summary).toMatchObject({ total: 5, active: 1, archived: 4 });
    expect((await owner.get('?lifecycle=active')).body.interests.map(row => row.name)).toEqual(['Active']);
    expect((await owner.get('?lifecycle=archived')).body.interests).toHaveLength(4);
  });

  it('sorts by recent with null last, sorts display names, searches both labels and filters polarity', async () => {
    const owner = await fixture();
    const old = await owner.island({ label: 'Zebra', generatedLabel: 'Apple', lastBehaviorAt: new Date(Date.now() - 86400000) });
    const recent = await owner.island({ label: 'Banana', weight: -0.3 });
    const undated = await owner.island({ label: 'Cherry', lastBehaviorAt: null });
    const ids = response => response.body.interests.map(row => Number(row.id));
    expect(ids(await owner.get('?sort=recent'))).toEqual([recent.id, old.id, undated.id]);
    expect(ids(await owner.get('?sort=name'))).toEqual([old.id, recent.id, undated.id]);
    expect(ids(await owner.get('?search=zEb'))).toEqual([old.id]);
    expect(ids(await owner.get('?search=APP'))).toEqual([old.id]);
    expect(ids(await owner.get('?polarity=negative'))).toEqual([recent.id]);
    const filtered = await owner.get('?polarity=positive&search=Cherry');
    expect(ids(filtered)).toEqual([undated.id]);
    expect(filtered.body.summary.total).toBe(3);
  });

  it.each(['polarity=neutral', 'lifecycle=dormant', 'lifecycle=reactivated', 'sort=invalid', 'search=a&search=b'])('rejects unsupported query %s', async query => {
    const owner = await fixture();
    expect((await owner.get(`?${query}`)).status).toBe(400);
  });

  it.each(['0', '-1', 'abc', '1.5', '18446744073709551616'])('rejects invalid ID %s', async id => {
    const owner = await fixture();
    expect((await owner.get(`/${id}`)).status).toBe(400);
  });

  it('does not disclose foreign or nonexistent interests and handles absent support', async () => {
    const owner = await fixture(); const foreign = await fixture();
    const privateIsland = await foreign.island({});
    expect((await owner.get(`/${privateIsland.id}`)).status).toBe(404);
    expect((await owner.get('/18446744073709551615')).status).toBe(404);
    for (const supportArticleIds of [null, []]) {
      const island = await owner.island({ supportArticleIds });
      const response = await owner.get(`/${island.id}`);
      expect(response.status).toBe(200);
      expect(response.body.interest.representativeArticles).toEqual([]);
    }
  });

  it('mutes and unmutes only the owned Island without rescoring existing Articles', async () => {
    const owner = await fixture(); const foreign = await fixture();
    const ownIsland = await owner.island({ islandVector: [1, 0], embedding_model: 'test-model' });
    const foreignIsland = await foreign.island({});
    const category = await db.Category.create({ userId: owner.user.id, name: 'Mute test' });
    const feed = await db.Feed.create({ userId: owner.user.id, categoryId: category.id,
      feedName: 'Mute test', url: `https://${randomUUID()}.example/rss` });
    const scoredAt = new Date('2026-09-20T12:00:00Z');
    const article = await db.Article.create({ userId: owner.user.id, feedId: feed.id,
      title: 'Already scored', publishedAt: scoredAt, interestScore: 0.4, interestScoredAt: scoredAt });
    const updateArticle = vi.spyOn(db.Article, 'update');
    try {
      const muted = await owner.patch(`/${ownIsland.id}`, true);
      expect(muted.status).toBe(200);
      expect(muted.body.interest).toMatchObject({ id: ownIsland.id, muted: true, lifecycle: 'active', weight: 0.5 });
      expect((await owner.get('')).body.interests[0].muted).toBe(true);
      expect((await owner.get(`/${ownIsland.id}`)).body.interest.muted).toBe(true);
      expect((await owner.patch(`/${foreignIsland.id}`, true)).status).toBe(404);
      expect((await foreignIsland.reload()).mutedInd).toBe(false);
      const unmuted = await owner.patch(`/${ownIsland.id}`, false);
      expect(unmuted.status).toBe(200);
      expect(unmuted.body.interest.muted).toBe(false);
      expect((await ownIsland.reload()).mutedInd).toBe(false);
      expect(updateArticle).not.toHaveBeenCalled();
      expect((await article.reload()).interestScore).toBeCloseTo(0.4);
      expect(article.interestScoredAt).toEqual(scoredAt);
    } finally { updateArticle.mockRestore(); }
  });

  it('rejects invalid mute requests and unknown Islands', async () => {
    const owner = await fixture();
    const island = await owner.island({});
    expect((await owner.patch(`/${island.id}`, 'true')).status).toBe(400);
    expect((await owner.patch(`/${island.id}`, null)).status).toBe(400);
    expect((await owner.patch('/invalid', true)).status).toBe(400);
    expect((await owner.patch('/18446744073709551615', true)).status).toBe(404);
    expect((await island.reload()).mutedInd).toBe(false);
  });

  it('revalidates support ownership and visibility before taking three in support order', async () => {
    const owner = await fixture(); const foreign = await fixture();
    const category = await db.Category.create({ userId: owner.user.id, name: 'Interests' });
    const feed = await db.Feed.create({ userId: owner.user.id, categoryId: category.id, feedName: 'Source', url: `https://${randomUUID()}.example/rss` });
    const createArticle = values => db.Article.create({ userId: owner.user.id, feedId: feed.id, title: 'Support', publishedAt: new Date(Math.floor(Date.now() / 1000) * 1000), ...values });
    const articles = [];
    for (let index = 0; index < 4; index++) articles.push(await createArticle({ title: `Support ${index}` }));
    const filtered = await createArticle({ filteredInd: true });
    const other = await createArticle({ userId: foreign.user.id });
    const duplicate = await createArticle({ duplicateOfArticleId: articles[0].id });
    const supportArticleIds = [other.id, filtered.id, duplicate.id, '18446744073709551615', articles[3].id, articles[1].id, articles[2].id, articles[0].id];
    const island = await owner.island({ supportArticleIds });
    const response = await owner.get(`/${island.id}`);
    expect(response.status).toBe(200);
    const representatives = response.body.interest.representativeArticles;
    expect(representatives.map(row => Number(row.id))).toEqual([articles[3].id, articles[1].id, articles[2].id]);
    expect(representatives[0]).toEqual({ id: articles[3].id, title: articles[3].title, imageUrl: null,
      publishedAt: articles[3].publishedAt.toISOString(), feed: { id: feed.id, feedName: 'Source' } });
    expect((await owner.get('')).body.interests[0]).not.toHaveProperty('representativeArticles');
  });
});
