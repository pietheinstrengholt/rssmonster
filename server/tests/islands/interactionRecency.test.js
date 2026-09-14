import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import db from '../../models/index.js';
import { computeArticleSignals, buildInterestIslandProfilesForUser } from '../../services/islands/islandArticleProfiles.js';
import { behaviorRecencyWeight } from '../../services/islands/islandVectorUtils.js';
import { evaluateArticleInterest, prepareIslandEvidence, loadIslandEvidence, islandCohesion } from '../../services/islands/islandInterestConfidence.js';

const now = Date.parse('2026-09-14T12:00:00Z');
const today = new Date(now);
const old = new Date('2022-01-01T00:00:00Z');
const candidate = { id: 9999, title: 'Database release', articleVector: [1, 0] };
const source = overrides => ({ id: 1, title: 'Database release', publishedAt: old, articleVector: [1, 0], ...overrides });
const evaluate = article => evaluateArticleInterest(candidate, { ...prepareIslandEvidence([], [article]), now });

describe('interaction-based Island recency', () => {
  beforeAll(async () => { if (db.sequelize.getDialect() === 'sqlite') await db.sequelize.sync(); });
  afterEach(() => vi.restoreAllMocks());

  it('treats a favorite made today on a 2022 article as fresh and decays old interaction on a new article', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(computeArticleSignals(source({ favoriteInd: 1, favoritedAt: today })).positiveScore).toBe(4);
    expect(computeArticleSignals(source({ publishedAt: today, favoriteInd: 1, favoritedAt: old })).positiveScore)
      .toBeCloseTo(4 * behaviorRecencyWeight(old));
    expect(computeArticleSignals(source({ favoriteInd: 1, favoritedAt: today })).positiveScore)
      .toBeGreaterThan(computeArticleSignals(source({ publishedAt: today, favoriteInd: 1, favoritedAt: old })).positiveScore);
  });

  it('decays each positive signal independently, preserving all weights and the click cap', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const article = source({ positiveInd: 1, positiveFeedbackAt: old, favoriteInd: 1, favoritedAt: today,
      clickedAmount: 8, lastClickedAt: old, attentionBucket: 3, lastMeaningfulReadAt: today });
    expect(computeArticleSignals(article).positiveScore).toBeCloseTo(8 * behaviorRecencyWeight(old) + 4 + 6 * behaviorRecencyWeight(old) + 1);
    expect(computeArticleSignals({ ...article, favoritedAt: old }).positiveScore).toBeLessThan(computeArticleSignals(article).positiveScore);
  });

  it('keeps publication as the null-clock legacy fallback, without overriding known clocks', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(computeArticleSignals(source({ favoriteInd: 1, favoritedAt: null })).positiveScore).toBeCloseTo(4 * behaviorRecencyWeight(old));
    expect(evaluate(source({ positiveInd: 1, publishedAt: today, positiveFeedbackAt: old })).score).toBe(0);
    expect(evaluate(source({ positiveInd: 1, publishedAt: today, positiveFeedbackAt: null })).score).toBeGreaterThan(0);
  });

  it('uses the sign-specific clock and lets recent favorites survive old positive feedback', () => {
    expect(evaluate(source({ positiveInd: 1, positiveFeedbackAt: today })).score).toBeGreaterThan(0);
    expect(evaluate(source({ negativeInd: 1, negativeFeedbackAt: today, positiveFeedbackAt: old })).score).toBeLessThan(0);
    expect(evaluate(source({ negativeInd: 1, negativeFeedbackAt: old, positiveFeedbackAt: today, publishedAt: today })).score).toBe(0);
    const both = evaluate(source({ positiveInd: 1, positiveFeedbackAt: old, favoriteInd: 1, favoritedAt: today }));
    expect(both.score).toBe(evaluate(source({ favoriteInd: 1, favoritedAt: today })).score);
    const monthAgo = new Date(now - 30 * 86400000);
    expect(evaluate(source({ negativeInd: 1, negativeFeedbackAt: monthAgo })).score)
      .toBeCloseTo(evaluate(source({ negativeInd: 1, negativeFeedbackAt: today })).score / 2, 3);
  });

  it('uses interaction days for current support breadth', () => {
    const rows = [source({ id: 1, favoriteInd: 1, favoritedAt: today }), source({ id: 2, favoriteInd: 1, favoritedAt: new Date(now - 86400000) })];
    expect(islandCohesion(rows, [1, 0]).distinctInteractionDays).toBe(2);
  });

  it('selects recent interaction on an old article before bounded evidence limits and honors signed windows in SQL', async () => {
    const user = await db.User.create({ username: `recency-${randomUUID()}` });
    const category = await db.Category.create({ userId: user.id, name: 'Recency' });
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Recency', url: `https://${user.id}.example/rss` });
    const values = { userId: user.id, feedId: feed.id, title: 'Database release', articleVector: [1, 0] };
    await db.Article.bulkCreate(Array.from({ length: 501 }, () => ({ ...values, publishedAt: today, clickedAmount: 1, lastClickedAt: old })));
    const fresh = await db.Article.create({ ...values, publishedAt: old, favoriteInd: 1, favoritedAt: today });
    const negative = await db.Article.create({ ...values, publishedAt: old, negativeInd: 1, negativeFeedbackAt: today });
    const stale = await db.Article.create({ ...values, publishedAt: today, positiveInd: 1, positiveFeedbackAt: old });
    const evidence = await loadIslandEvidence(user.id, { now });
    expect(evidence.fallbackEvidence.map(a => a.id)).toEqual(expect.arrayContaining([fresh.id, negative.id]));
    expect(evidence.fallbackEvidence.map(a => a.id)).not.toContain(stale.id);
    const island = await db.Island.create({ userId: user.id, label: 'Database', weight: 0.5, islandVector: [1, 0] });
    const supported = await loadIslandEvidence(user.id, { now });
    expect(supported.islands.find(i => i.id === island.id).seedArticleIds).toContain(fresh.id);
    expect(supported.islands[0].diagnostics.distinctBehavioralArticles).toBe(500);
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const profiles = await buildInterestIslandProfilesForUser(user.id);
    expect(profiles.flatMap(profile => profile.articles).find(a => a.articleId === fresh.id).score).toBe(4);
  });
});
