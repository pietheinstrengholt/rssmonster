import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import db from '../../models/index.js';
import { deriveIslandConfidence, islandCohesion, prepareIslandEvidence, evaluateArticleInterest } from '../../services/islands/islandInterestConfidence.js';
import { buildInterestIslandProfilesForUser } from '../../services/islands/islandArticleProfiles.js';
import { persistIslandProfilesForUser } from '../../services/islands/runIslandCalibration.js';
import { scoreArticlesFromIslandsForUser, explainArticleInterests } from '../../services/score/scoreArticlesFromIslands.js';
import { computeRecommended } from '../../services/recommendations/recommendedScore.js';

const now = Date.parse('2026-09-13T12:00:00Z');
const seed = (id, overrides = {}) => ({ id, feedId: id, publishedAt: new Date(now - id * 86400000), articleVector: [1, 0, 0], favoriteInd: 1, ...overrides });
const island = { id: 1, islandVector: [1, 0, 0], weight: 0.8 };
const held = { id: 99, articleVector: [0.95, Math.sqrt(1 - 0.95 ** 2), 0] };
const context = evidence => ({ ...prepareIslandEvidence([island], evidence), now });

describe('confidence-aware held-out personalization', () => {
  it('resolves legacy contradictory explicit feedback as negative in confidence and fallback', () => {
    const conflict = seed(1, { favoriteInd: 0, positiveInd: 1, negativeInd: 1 });
    const diagnostics = islandCohesion([conflict], island.islandVector);
    expect(diagnostics).toMatchObject({ positiveEvidenceCount: 0, negativeEvidenceCount: 1 });
    expect(deriveIslandConfidence(diagnostics)).toBeCloseTo(0.35);
    const ctx = { ...prepareIslandEvidence([], [conflict]), now };
    const result = evaluateArticleInterest(held, ctx);
    expect(result.score).toBeLessThan(0);
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]).toMatchObject({ explicitType: 'negative', seedSelf: false });
  });

  it('gives coherent independent support more authority than a singleton or noisy evidence', () => {
    const singleton = context([seed(1)]);
    const durable = context([1, 2, 3, 4, 5].map(id => seed(id)));
    const singleResult = evaluateArticleInterest(held, singleton);
    const durableResult = evaluateArticleInterest(held, durable);
    expect(singleResult.score).toBeGreaterThan(0);
    expect(singleton.islands[0].islandConfidence).toBeCloseTo(0.35);
    expect(durableResult.score).toBeGreaterThan(singleResult.score);
    const noisy = islandCohesion([seed(1), seed(2, { articleVector: [0, 1, 0] })], [1, 0, 0]);
    expect(deriveIslandConfidence(noisy)).toBeLessThan(singleton.islands[0].islandConfidence);
    expect(evaluateArticleInterest(seed(1), singleton)).toMatchObject({ seedSelf: true, paths: [expect.objectContaining({ seedSelf: true })] });
    expect(durableResult.seedSelf).toBe(false);
    console.table([{ case: 'held-out singleton', score: singleResult.score, confidence: singleton.islands[0].islandConfidence },
      { case: 'held-out durable', score: durableResult.score, confidence: durable.islands[0].islandConfidence }]);
  });

  it('uses both Topic confidences and similarity; weak links cannot transmit full strength', () => {
    const ctx = context([1, 2, 3, 4, 5].map(id => seed(id)));
    const score = (ac, ic, sim = 1) => evaluateArticleInterest({ id: 99 }, ctx,
      [{ topicId: 1, confidence: ac }], [{ islandId: 1, topicId: 1, confidence: ic, similarity: sim }]).score;
    expect(score(1, 1)).toBeCloseTo(0.8);
    expect(score(1, 0.2)).toBeCloseTo(0.16);
    expect(score(0.2, 1)).toBeCloseTo(0.16);
    expect(score(0.2, 0.2)).toBeCloseTo(0.032);
    expect(score(1, 0.38, 0.38)).toBeLessThan(0.12);
    expect(score(0, 1)).toBe(0);
  });

  it('normalizes the trusted direct range and does not double-count paths or repeated evidence', () => {
    const ctx = context([seed(1)]);
    const atThreshold = { id: 99, articleVector: [0.62, Math.sqrt(1 - 0.62 ** 2), 0] };
    expect(evaluateArticleInterest(atThreshold, ctx).score).toBe(0);
    expect(evaluateArticleInterest({ id: 99, articleVector: [0, 1, 0] }, ctx).score).toBe(0);
    const direct = evaluateArticleInterest(held, ctx);
    const combined = evaluateArticleInterest(held, ctx, [{ topicId: 1, confidence: 0.1 }],
      [{ islandId: 1, topicId: 1, confidence: 0.1, similarity: 1 }]);
    expect(combined.score).toBe(direct.score);
    expect(combined.paths).toHaveLength(1);
    const duplicated = { ...ctx, islands: [...ctx.islands, { ...ctx.islands[0], id: 2 }] };
    expect(evaluateArticleInterest(held, duplicated).score).toBe(direct.score);
    const negative = { ...seed(12), negativeInd: 1, favoriteInd: 0 };
    const conflict = { ...ctx, fallbackEvidence: [negative, negative] };
    expect(evaluateArticleInterest(held, conflict).score).toBeLessThan(direct.score);
    expect(evaluateArticleInterest(held, conflict).paths).toHaveLength(2);
    const old = { ...negative, publishedAt: new Date(now - 91 * 86400000) };
    expect(evaluateArticleInterest(held, { ...ctx, fallbackEvidence: [old] }).score).toBe(direct.score);
  });

  it('retains capped explicit preferences for held-out articles without contaminating Islands, including replay', async () => {
    const user = await db.User.create({ username: `phase-b-${randomUUID()}` });
    const category = await db.Category.create({ userId: user.id, name: 'Confidence' });
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Confidence', url: `https://confidence.test/${user.id}` });
    const rows = [
      { title: 'Local model inference', articleVector: [1, 0, 0, 0], favoriteInd: 1, clickedAmount: 3 },
      { title: 'Local model server', articleVector: [1, 0, 0, 0], favoriteInd: 1, clickedAmount: 3 },
      { title: 'Unwanted gadget promotions', articleVector: [0, 1, 0, 0], negativeInd: 1 },
      { title: 'Bird photography', articleVector: [0, 0, 1, 0], favoriteInd: 1 },
      { title: 'Held-out model inference', articleVector: [0.99, 0, 0, 0.1] },
      { title: 'Held-out gadget promotion', articleVector: [0, 0.99, 0, 0.1] },
      { title: 'Held-out bird photography', articleVector: [0, 0, 0.99, 0.1] },
      { title: 'Held-out council proceedings', articleVector: [0, 0, 0, 1] }
    ];
    const articles = await db.Article.bulkCreate(rows.map((a, n) => ({ ...a, userId: user.id, feedId: feed.id,
      publishedAt: new Date(), status: n < 4 ? 'read' : 'unread', url: `https://confidence.test/${user.id}/${n}` })));
    const profiles = await buildInterestIslandProfilesForUser(user.id, { maxIslands: 1 });
    expect(profiles).toHaveLength(1);
    expect(profiles[0].articles.map(a => a.articleId)).toEqual(articles.slice(0, 2).map(a => a.id));
    expect(profiles.summary.unassignedBehavioralProfiles).toBe(2);
    await persistIslandProfilesForUser(user.id, profiles);
    await scoreArticlesFromIslandsForUser(user.id);
    const heldRows = await db.Article.findAll({ where: { userId: user.id, status: 'unread' }, order: [['id', 'ASC']] });
    const scores = heldRows.map(a => a.interestScore);
    expect(scores[0]).toBeGreaterThan(0);
    expect(scores[1]).toBeLessThan(0);
    expect(scores[1]).toBeGreaterThanOrEqual(-0.25);
    expect(scores[2]).toBeGreaterThan(0);
    expect(scores[3]).toBe(0);
    const { results } = await explainArticleInterests(user.id, heldRows);
    expect(results.get(String(heldRows[1].id)).paths[0]).toMatchObject({ matchType: 'behavioral-fallback', explicitType: 'negative', seedSelf: false });
    expect(results.get(String(heldRows[2].id)).paths[0]).toMatchObject({ matchType: 'behavioral-fallback', explicitType: 'positive', seedSelf: false });
    await persistIslandProfilesForUser(user.id, profiles);
    await scoreArticlesFromIslandsForUser(user.id);
    for (const [n, article] of heldRows.entries()) {
      await article.reload();
      expect(article.interestScore).toBe(scores[n]);
      expect(Number.isFinite(computeRecommended(article))).toBe(true);
    }
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(1);
    console.table(heldRows.map(a => ({ article: a.title, interest: a.interestScore, recommended: computeRecommended(a), evidence: 'held-out' })));
  }, 60000);

  it('grows a real singleton from independent training evidence while keeping its recommendation held out', async () => {
    const user = await db.User.create({ username: `singleton-${randomUUID()}` });
    const category = await db.Category.create({ userId: user.id, name: 'Singleton' });
    const feeds = await db.Feed.bulkCreate([1, 2, 3].map(n => ({ userId: user.id, categoryId: category.id,
      feedName: `Source ${n}`, url: `https://singleton.test/${user.id}/${n}` })));
    const make = (n, behavior, feedId = feeds[0].id) => ({ userId: user.id, feedId,
      title: `Home inference ${n}`, url: `https://singleton.test/${user.id}/article/${n}`,
      articleVector: [1, 0, 0], favoriteInd: behavior ? 1 : 0, status: behavior ? 'read' : 'unread',
      publishedAt: new Date(Date.now() - n * 86400000) });
    const training = await db.Article.create(make(1, true));
    const recommendation = await db.Article.create(make(0, false));
    const profiles = await buildInterestIslandProfilesForUser(user.id, { maxIslands: 1 });
    expect(profiles[0].articles.map(a => a.articleId)).toEqual([training.id]);
    await persistIslandProfilesForUser(user.id, profiles);
    await scoreArticlesFromIslandsForUser(user.id);
    await recommendation.reload();
    const singletonScore = recommendation.interestScore;
    const before = await explainArticleInterests(user.id, [training, recommendation]);
    expect(singletonScore).toBeGreaterThan(0);
    expect(before.context.islands[0].islandConfidence).toBeCloseTo(0.35);
    expect(before.results.get(String(training.id)).seedSelf).toBe(true);
    expect(before.results.get(String(recommendation.id)).seedSelf).toBe(false);
    await db.Article.bulkCreate([make(2, true, feeds[1].id), make(3, true, feeds[2].id), make(4, true)]);
    const supported = await buildInterestIslandProfilesForUser(user.id, { maxIslands: 1 });
    expect(supported[0].articles.some(a => a.articleId === recommendation.id)).toBe(false);
    await persistIslandProfilesForUser(user.id, supported);
    await scoreArticlesFromIslandsForUser(user.id);
    await recommendation.reload();
    const after = await explainArticleInterests(user.id, [recommendation]);
    expect(after.context.islands[0].islandConfidence).toBeGreaterThan(before.context.islands[0].islandConfidence);
    expect(recommendation.interestScore).toBeGreaterThan(singletonScore);
  }, 60000);

});
