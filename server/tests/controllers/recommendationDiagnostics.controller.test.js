import { articleRecords } from '../../services/articles/articleRecords.js';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

let app;
beforeAll(async () => { app = (await import('../../app.js')).default; });
async function fixture() {
  const user = await db.User.create({ username: `diagnostics-api-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Diagnostics' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Diagnostics', url: `https://${user.id}.example/rss` });
  const article = await articleRecords.create({ userId: user.id, feedId: feed.id, title: 'Neutral article', status: 'unread', publishedAt: new Date(), interestScoredAt: new Date(Date.now() - 60000) });
  const authorization = `Bearer ${jwt.sign({ userId: user.id, username: user.username }, getJwtSecret())}`;
  return { user, article, authorization };
}

describe('recommendation diagnostic API', () => {
  it('exposes opt-in list and single-article diagnostics, and recorded neutral score age', async () => {
    const { article, authorization } = await fixture();
    const response = await request(app).get('/api/articles').set('Authorization', authorization)
      .query({ sort: 'recommended', diagnostics: 'true', includeFirstPage: 'true', persistSettings: 'false' });
    expect(response.status).toBe(200);
    expect(response.body.diagnostics).toMatchObject({ view: 'articles', sort: 'recommended', delivery: { detailsReturned: 1, deferredToLaterPages: 0 } });
    expect(response.body.firstPage[0].recommendation.interestEvaluation).toMatchObject({ state: 'evaluated', ageMs: expect.any(Number) });
    expect(response.body.firstPage[0].recommendation.interestEvaluation.ageMs).toBeGreaterThanOrEqual(59000);
    const single = await request(app).get(`/api/articles/${article.id}`).set('Authorization', authorization).query({ diagnostics: 'true' });
    expect(single.status).toBe(200);
    expect(single.body.article.interestDiagnostics).toMatchObject({ storedScore: 0, score: 0, matchesStoredScore: true,
      diagnostics: { zeroReason: 'no_eligible_evidence' } });
    const ordinary = await request(app).get(`/api/articles/${article.id}`).set('Authorization', authorization);
    expect(ordinary.body.article.interestDiagnostics).toBeUndefined();
  });

  it('rejects unsupported cursor diagnostics and never explains a foreign article', async () => {
    const owner = await fixture(); const foreign = await fixture();
    expect((await request(app).get(`/api/articles/${foreign.article.id}`).set('Authorization', owner.authorization).query({ diagnostics: 'true' })).status).toBe(404);
    expect((await request(app).get('/api/articles').set('Authorization', owner.authorization).query({ diagnostics: 'true', pagination: 'cursor' })).status).toBe(400);
    // Missing sessions use the existing authentication middleware's 400 contract.
    expect((await request(app).get('/api/articles').query({ diagnostics: 'true' })).status).toBe(400);
  });
});
