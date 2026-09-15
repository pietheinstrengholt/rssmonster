import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { evaluateArticleInterest, prepareIslandEvidence, loadIslandEvidence, IMPLICIT_EVIDENCE_LIMIT } from '../../services/islands/islandInterestConfidence.js';
import { buildInterestIslandProfilesForUser } from '../../services/islands/islandArticleProfiles.js';
import { scoreArticlesFromIslandsForUser } from '../../services/score/scoreArticlesFromIslands.js';

const now = Date.parse('2026-09-15T12:00:00Z');
const day = 86400000;
const target = { id: 99999, title: 'Database technical guide', embedding_model: 'test-model', articleVector: [1, 0] };
const source = overrides => ({ ...target, id: 1, clickedAmount: 1, lastClickedAt: new Date(now), ...overrides });
const evaluate = (sources, candidate = target, islands = []) => evaluateArticleInterest(candidate, { ...prepareIslandEvidence(islands, sources), now });
afterEach(() => vi.useRealTimers());

describe('recent implicit evidence', () => {
  it('gives held-out candidates weaker click/read authority than explicit feedback without an Island', () => {
    const click = evaluate([source()]);
    const read = evaluate([source({ attentionBucket: 3, lastMeaningfulReadAt: new Date(now) })]);
    const explicit = evaluate([source({ positiveInd: 1, positiveFeedbackAt: new Date(now) })]);
    expect(click.score).toBe(0.05);
    expect(read.score).toBe(0.10);
    expect(explicit.score).toBe(0.25);
    expect(read.paths).toHaveLength(1);
    expect(read.paths[0]).toMatchObject({ matchType: 'implicit-behavior', implicitType: 'deep-read', seedSelf: false });
    expect(read.seedSelf).toBe(false);
    expect(evaluate([source({ clickedAmount: 1000 })]).score).toBe(click.score);
    expect(evaluate(Array.from({ length: 100 }, (_, id) => source({ id }))).score).toBe(click.score);
    expect(evaluate([source(), source()])).toEqual(click);
  });

  it('decays rapidly using independent observed clocks and rejects unknown, future and expired interactions', () => {
    expect(evaluate([source({ lastClickedAt: new Date(now - 3 * day) })]).score).toBe(0.025);
    expect(evaluate([source({ lastClickedAt: new Date(now - 7 * day) })]).score).toBeGreaterThan(0);
    for (const lastClickedAt of [null, undefined, 'invalid', new Date(now + 1), new Date(now - 7 * day - 1)]) {
      const result = evaluate([source({ lastClickedAt, publishedAt: new Date(now) })]);
      expect(result).toMatchObject({ score: 0, paths: [], diagnostics: { zeroReason: 'no_recent_fallback_signal' } });
    }
    const mixed = evaluate([source({ lastClickedAt: new Date(now + day), attentionBucket: 3, lastMeaningfulReadAt: new Date(now - 3 * day) })]);
    expect(mixed.score).toBe(0.05);
    expect(mixed.paths[0].implicitType).toBe('deep-read');
    expect(evaluate([source({ clickedAmount: 0, attentionBucket: 2 })]).score).toBe(0);
  });

  it('retains model and similarity gates and never infers negative or amplifies explicit evidence', () => {
    for (const embedding_model of [null, '', 'other-model']) {
      expect(evaluate([source({ embedding_model })]).score).toBe(0);
    }
    expect(evaluate([source({ articleVector: [1, 0, 0] })]).score).toBe(0);
    expect(evaluate([source()], { ...target, articleVector: [0, 1] }).score).toBe(0);
    expect(evaluateArticleInterest(target, { ...prepareIslandEvidence([], [source()]), now }, 1).score).toBe(0);
    const negative = evaluate([source({ negativeInd: 1, negativeFeedbackAt: new Date(now) })]);
    expect(negative.score).toBe(-0.25);
    expect(negative.paths.every(path => path.matchType !== 'implicit-behavior')).toBe(true);
    expect(evaluate([source({ negativeInd: 1, negativeFeedbackAt: new Date(now - 100 * day) })]).score).toBe(0);
    const island = { id: 2, weight: 1, embedding_model: 'test-model', islandVector: [1, 0] };
    expect(evaluate([source()], target, [island]).paths).toHaveLength(1);
  });

  it('retains intent on implicit paths and keeps mixed explicit preferences independent of the averaged Island', () => {
    const review = { ...target, title: 'Gaming laptop review and benchmarks' };
    const promotion = { ...target, title: 'Save €500 on this gaming laptop deal' };
    const read = source({ title: review.title, attentionBucket: 3, lastMeaningfulReadAt: new Date(now) });
    expect(evaluate([read], review).score).toBeGreaterThan(evaluate([read], promotion).score * 10);
    const support = [source({ title: review.title, positiveInd: 1, positiveFeedbackAt: new Date(now) }),
      source({ id: 2, title: promotion.title, negativeInd: 1, negativeFeedbackAt: new Date(now) })];
    for (const weight of [0, 0.1, -0.1]) {
      const islands = [{ id: 4, weight, embedding_model: 'test-model', islandVector: [1, 0] }];
      const context = { ...prepareIslandEvidence(islands, support), now };
      expect(context.fallbackEvidence).toHaveLength(2);
      expect(evaluateArticleInterest(review, context).score).toBeGreaterThan(0);
      expect(evaluateArticleInterest(promotion, context).score).toBeLessThan(0);
      expect(evaluateArticleInterest(review, context).paths).toHaveLength(2);
      expect(evaluateArticleInterest(review, context)).toEqual(evaluateArticleInterest(review, { ...prepareIslandEvidence(islands, [...support].reverse()), now }));
    }
  });

  it('provides interest after formation capacity rejects a recent click and records its own scoring counter', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    const user = await db.User.create({ username: `implicit-capacity-${randomUUID()}` });
    const category = await db.Category.create({ userId: user.id, name: 'Implicit' });
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Implicit', url: `https://${user.id}.example/rss` });
    const values = { userId: user.id, feedId: feed.id, title: target.title, embedding_model: 'test-model', articleVector: [1, 0] };
    await db.Article.create({ ...values, articleVector: [0, 1], positiveInd: 1, positiveFeedbackAt: new Date(now) });
    const clicked = await db.Article.create({ ...values, clickedAmount: 1, lastClickedAt: new Date(now), status: 'read' });
    const candidate = await db.Article.create({ ...values, status: 'unread' });
    const profiles = await buildInterestIslandProfilesForUser(user.id, { maxIslands: 1 });
    expect(profiles.summary.unassignedBehavioralProfiles).toBe(1);
    expect(profiles.flatMap(profile => profile.articles.map(a => a.articleId))).not.toContain(clicked.id);
    const result = await scoreArticlesFromIslandsForUser(user.id, { now });
    await candidate.reload();
    expect(Number(candidate.interestScore)).toBeCloseTo(0.05);
    expect(result.implicitScoredCount).toBe(1);
    expect(candidate.interestScoredAt).toEqual(new Date(now));
  });

  it('bounds recent sources independently of old evidence and excludes foreign, filtered, duplicate and explicit rows', async () => {
    const user = await db.User.create({ username: `implicit-sql-${randomUUID()}` });
    const foreign = await db.User.create({ username: `implicit-foreign-${randomUUID()}` });
    const category = await db.Category.create({ userId: user.id, name: 'Implicit' });
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Implicit', url: `https://${user.id}.example/rss` });
    const values = { userId: user.id, feedId: feed.id, title: target.title, embedding_model: 'test-model', articleVector: [1, 0],
      clickedAmount: 1, lastClickedAt: new Date(now - day), publishedAt: new Date(now) };
    const older = await db.Article.bulkCreate(Array.from({ length: IMPLICIT_EVIDENCE_LIMIT + 1 }, () => values));
    const fresh = await db.Article.create({ ...values, attentionBucket: 3, lastMeaningfulReadAt: new Date(now), publishedAt: new Date('2020-01-01') });
    const excluded = await db.Article.bulkCreate([
      { ...values, userId: foreign.id }, { ...values, filteredInd: true }, { ...values, duplicateOfArticleId: fresh.id },
      { ...values, negativeInd: 1 }, { ...values, favoriteInd: 1 }, { ...values, positiveInd: 1 },
      { ...values, lastClickedAt: null }, { ...values, lastClickedAt: new Date(now + day) },
      { ...values, lastClickedAt: new Date(now - 8 * day) }
    ]);
    const context = await loadIslandEvidence(user.id, { now });
    const ids = context.implicitEvidence.map(a => a.id);
    expect(ids).toHaveLength(IMPLICIT_EVIDENCE_LIMIT);
    expect(ids).toEqual([fresh.id, ...older.slice(0, IMPLICIT_EVIDENCE_LIMIT - 1).map(a => a.id)]);
    expect(ids.filter(id => excluded.some(a => a.id === id))).toEqual([]);
  });
});
