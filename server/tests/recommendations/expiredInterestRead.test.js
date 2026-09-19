import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { refreshExpiredArticleInterests } from '../../services/recommendations/refreshExpiredArticleInterests.js';
import { searchArticles } from '../../services/articleSearch/articleSearch.service.js';
import { ISLAND_INACTIVITY_DAYS } from '../../services/islands/islandDeadline.js';
import { createRequestPersonalization } from '../../services/recommendations/requestPersonalization.js';
import { loadInterestIslandAttributions } from '../../services/recommendations/recommendationAttribution.js';

const now = new Date('2026-09-17T12:00:00Z');
const ago = days => new Date(now.getTime() - days * 86400000);
let app;
async function fixture(score = 0.8, islandValues = {}) {
  const user = await db.User.create({ username: `expiry-read-${randomUUID()}`, role: 'user' });
  const category = await db.Category.create({ userId: user.id, name: 'Expiry' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Expiry', url: `https://${user.id}.example/rss` });
  const values = { userId: user.id, feedId: feed.id, title: 'Kubernetes deployment',
    articleVector: [1, 0], embedding_model: 'test-model', publishedAt: ago(3), status: 'unread',
    advertisementScore: 80, sentimentScore: 80, qualityScore: 80 };
  const candidate = await db.Article.create({ ...values, interestScore: score, interestScoredAt: ago(1) });
  const island = await db.Island.create({ userId: user.id, label: 'Kubernetes', islandVector: [1, 0],
    embedding_model: 'test-model', weight: Math.sign(score), archivedInd: false,
    lastBehaviorAt: ago(ISLAND_INACTIVITY_DAYS), ...islandValues });
  return { user, candidate, island, values };
}

describe('expired cached interest at read time', () => {
  beforeAll(async () => { app = (await import('../../app.js')).default; });
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it.each([0.8, -0.8])('removes cached %s influence at the exact deadline without persisting archival or scores', async score => {
    const { user, candidate, island } = await fixture(score);
    await refreshExpiredArticleInterests(user.id, [candidate]);
    expect(candidate.interestScore).toBe(0);
    expect(candidate.interestScoredAt).toEqual(now);
    await candidate.reload(); await island.reload();
    expect(Number(candidate.interestScore)).toBeCloseTo(score);
    expect(candidate.interestScoredAt).toEqual(ago(1));
    expect(island.archivedInd).toBe(false);
  });

  it.each([
    { archivedInd: true, archivedAt: ago(0.5), lastBehaviorAt: ago(2) },
    { lastBehaviorAt: null },
    { lastBehaviorAt: new Date(now.getTime() + 86400000) }
  ])('rejects inactive cached influence for %j', async state => {
    const { user, candidate } = await fixture(0.8, state);
    await refreshExpiredArticleInterests(user.id, [candidate]);
    expect(candidate.interestScore).toBe(0);
  });

  it('preserves valid active evidence and never takes evidence from another user', async () => {
    const expired = await fixture();
    const other = await fixture(0.8, { lastBehaviorAt: ago(1) });
    await refreshExpiredArticleInterests(expired.user.id, [expired.candidate, other.candidate]);
    expect(expired.candidate.interestScore).toBe(0);
    expect(Number(other.candidate.interestScore)).toBeCloseTo(0.8);
    await db.Island.create({ userId: expired.user.id, label: 'Current preference', islandVector: [1, 0],
      embedding_model: 'test-model', weight: 1, lastBehaviorAt: ago(1) });
    // Reload cached metadata so this request crosses the old boundary again.
    await expired.candidate.reload();
    await refreshExpiredArticleInterests(expired.user.id, [expired.candidate]);
    expect(expired.candidate.interestScore).toBeGreaterThan(0);
  });

  it.each([0.8, -0.8])('corrects %s Recommended ordering before limiting results', async score => {
    const { user, candidate, values } = await fixture(score);
    const neutral = await db.Article.create({ ...values, title: 'Neutral article', publishedAt: score > 0 ? now : ago(6), interestScore: 0 });
    const search = () => searchArticles({ userId: user.id, sort: 'recommended', status: 'unread', grouping: 'none',
      search: 'limit:1', persistSettings: false });
    vi.setSystemTime(new Date(now.getTime() - 1));
    expect((await search()).itemIds).toEqual([score > 0 ? candidate.id : neutral.id]);
    vi.setSystemTime(now);
    expect((await search()).itemIds).toEqual([score > 0 ? neutral.id : candidate.id]);
    expect(Number((await candidate.reload()).interestScore)).toBeCloseTo(score);
  });

  it('serializes current interest in detail APIs while keeping stored diagnostics identifiable', async () => {
    const { user, candidate } = await fixture();
    const authorization = `Bearer ${jwt.sign({ userId: user.id, username: user.username }, getJwtSecret())}`;
    const detail = await request(app).post('/api/articles/details').set('Authorization', authorization)
      .send({ articleIds: String(candidate.id) });
    expect(detail.status).toBe(200);
    expect(detail.body[0].interestScore).toBe(0);
    expect(detail.body[0].recommendation.reasons.some(reason => reason.code === 'interest_match')).toBe(false);
    const single = await request(app).get(`/api/articles/${candidate.id}?diagnostics=true`).set('Authorization', authorization);
    expect(single.status).toBe(200);
    expect(single.body.article.interestScore).toBe(0);
    expect(single.body.article.interestDiagnostics.storedScore).toBeCloseTo(0.8);
  });

  it.each([1, -1])('keeps ranking and reloaded details on the same request evidence for sign %s', async sign => {
    const { user, candidate } = await fixture();
    const active = await db.Island.create({ userId: user.id, label: 'Current preference', islandVector: [1, 0],
      embedding_model: 'test-model', weight: sign, lastBehaviorAt: ago(1) });
    const personalization = createRequestPersonalization(user.id);
    const search = await searchArticles({ userId: user.id, sort: 'recommended', personalization });
    expect(search.itemIds).toContain(candidate.id);
    await refreshExpiredArticleInterests(user.id, [candidate], personalization.now, personalization);
    const score = candidate.interestScore;
    expect(score * sign).toBeGreaterThan(0);

    // A later stage reuses the request's evaluation even if evidence changes in the meantime.
    await active.update({ archivedInd: true, archivedAt: now });
    await candidate.reload();
    await refreshExpiredArticleInterests(user.id, [candidate], personalization.now, personalization);
    expect(candidate.interestScore).toBe(score);
    expect(candidate.interestScoredAt).toEqual(now);

    // A separate request must observe the new evidence, without modifying persisted scores.
    await candidate.reload();
    await refreshExpiredArticleInterests(user.id, [candidate]);
    expect(candidate.interestScore).toBe(0);
    expect(Number((await candidate.reload()).interestScore)).toBeCloseTo(0.8);
  });

  it('reuses evaluations for attribution while retaining the stored-score match requirement', async () => {
    const { user, candidate } = await fixture();
    const active = await db.Island.create({ userId: user.id, label: 'Current preference', islandVector: [1, 0],
      embedding_model: 'test-model', weight: 1, lastBehaviorAt: ago(1) });
    const personalization = createRequestPersonalization(user.id);
    await refreshExpiredArticleInterests(user.id, [candidate], personalization.now, personalization);
    expect(candidate.interestScore).toBeGreaterThan(0);
    const score = candidate.interestScore;
    expect((await loadInterestIslandAttributions(user.id, [candidate], personalization)).size).toBe(0);
    await db.Article.update({ interestScore: score }, { where: { id: candidate.id } });
    const shared = await loadInterestIslandAttributions(user.id, [candidate], personalization);
    const independent = await loadInterestIslandAttributions(user.id, [candidate]);
    expect(shared).toEqual(independent);
    expect(shared.get(String(candidate.id))).toMatchObject({ id: active.id, label: 'Current preference' });
  });

  it('rejects sharing personalization across users', async () => {
    const first = await fixture();
    const second = await fixture();
    const personalization = createRequestPersonalization(first.user.id);
    await expect(refreshExpiredArticleInterests(second.user.id, [second.candidate], personalization.now, personalization))
      .rejects.toThrow('another user');
    await expect(loadInterestIslandAttributions(second.user.id, [second.candidate], personalization))
      .rejects.toThrow('another user');
  });

  it.each(['recommended', 'desc'])('preserves %s first-page scores and explanations across collection and detail APIs', async sort => {
    const { user, candidate } = await fixture();
    await db.Island.create({ userId: user.id, label: 'Current preference', islandVector: [1, 0],
      embedding_model: 'test-model', weight: 1, lastBehaviorAt: ago(1) });
    const authorization = `Bearer ${jwt.sign({ userId: user.id, username: user.username }, getJwtSecret())}`;
    const collection = await request(app).get('/api/articles').set('Authorization', authorization)
      .query({ sort, status: 'unread', persistSettings: false, includeFirstPage: true,
        ...(sort === 'desc' ? { pagination: 'cursor', pageSize: 20 } : {}) });
    const details = await request(app).post('/api/articles/details').set('Authorization', authorization)
      .send({ articleIds: String(candidate.id) });
    expect(collection.status).toBe(200);
    expect(details.status).toBe(200);
    const delivered = sort === 'desc' ? collection.body.page.articles : collection.body.firstPage;
    expect(delivered).toHaveLength(1);
    expect(delivered[0].interestScore).toBeGreaterThan(0);
    expect(delivered[0].interestScore).toBe(details.body[0].interestScore);
    expect(delivered[0].recommendation).toEqual(details.body[0].recommendation);
    expect(collection.body).not.toHaveProperty('personalization');
  });
});
