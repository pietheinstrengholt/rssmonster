import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { evaluateArticleInterest, loadIslandEvidence } from '../../services/islands/islandInterestConfidence.js';
import { scoreArticlesFromIslandsForUser } from '../../services/score/scoreArticlesFromIslands.js';
import { refreshExpiredArticleInterests } from '../../services/recommendations/refreshExpiredArticleInterests.js';
import { createRequestPersonalization } from '../../services/recommendations/requestPersonalization.js';
import { runRecommendationScores } from '../../services/recommendations/runRecommendationScores.js';
import { computeRecommended } from '../../services/recommendations/recommendedScore.js';
import { markArticleAsDuplicate } from '../../services/duplicates/articleDuplicates.js';
import { resetSemanticStateForUser } from '../../scripts/resetSemanticState.js';
import { runIslandCalibrationForUser } from '../../services/islands/runIslandCalibration.js';
import { ISLAND_INACTIVITY_DAYS } from '../../services/islands/islandDeadline.js';

const now = new Date('2026-10-18T09:00:00Z');
const model = 'test-model';
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function fixture() {
  const user = await db.User.create({ username: `affinity-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Affinity' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Affinity', url: `https://${user.id}.example/rss` });
  const values = { userId: user.id, feedId: feed.id, title: 'Held-out Article', status: 'unread',
    articleVector: [1, 0, 0], embedding_model: model, publishedAt: now };
  const article = await db.Article.create(values);
  const islands = await db.Island.bulkCreate([
    { userId: user.id, label: 'First', weight: 1, islandVector: [0.5, Math.sqrt(0.75), 0], embedding_model: model, lastBehaviorAt: now },
    { userId: user.id, label: 'Second', weight: 1, islandVector: [0.4, 0, Math.sqrt(0.84)], embedding_model: model, lastBehaviorAt: now }
  ]);
  return { user, article, values, islands };
}

describe('semantic affinity persistence and lifecycle', () => {
  it('persists affinity-only changes and evaluated zero without changing interest', async () => {
    const { user, article, islands } = await fixture();
    await islands[1].destroy();
    const ranking = computeRecommended(article);
    await scoreArticlesFromIslandsForUser(user.id);
    expect((await article.reload()).semanticAffinityScore).toBeCloseTo(0.025, 4);
    const updatedAt = article.updatedAt;
    await islands[0].update({ weight: 0.5 });
    const summary = await scoreArticlesFromIslandsForUser(user.id);
    expect(summary).toMatchObject({ interestScoresChanged: 0, semanticAffinityScoresChanged: 1 });
    await article.reload();
    expect(article.semanticAffinityScore).toBeCloseTo(0.0125, 4);
    expect(article.interestScore).toBe(0);
    expect(article.updatedAt).toEqual(updatedAt);
    expect(computeRecommended(article) - ranking).toBeCloseTo(0.00125, 8);
    await islands[0].update({ weight: 0 });
    await scoreArticlesFromIslandsForUser(user.id);
    expect((await article.reload()).semanticAffinityScore).toBe(0);
  });

  it('populates historical nulls with unchanged interest and respects ownership', async () => {
    const { user, article, values, islands } = await fixture();
    await refreshExpiredArticleInterests(user.id, [article]);
    expect((await article.reload()).semanticAffinityScore).toBeNull();
    const foreign = await fixture();
    await db.Island.bulkCreate(['muted', 'archived', 'expired', 'incompatible', 'negative'].map(kind => ({
      userId: user.id, label: kind, weight: kind === 'negative' ? -1 : 1, islandVector: [1, 0, 0],
      embedding_model: kind === 'incompatible' ? 'other-model' : model, mutedInd: kind === 'muted', archivedInd: kind === 'archived',
      lastBehaviorAt: kind === 'expired' ? new Date(now.getTime() - ISLAND_INACTIVITY_DAYS * 86400000) : now
    })));
    const read = await db.Article.create({ ...values, status: 'read' });
    const current = evaluateArticleInterest(article, await loadIslandEvidence(user.id));
    expect(current.semanticAffinityScore).toBe(0.025);
    const before = computeRecommended(article);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected inference'));
    // The extra negative Island changes interest but must not add positive affinity.
    const summary = await scoreArticlesFromIslandsForUser(user.id);
    await article.reload();
    expect(summary).toMatchObject({ semanticAffinityScoresChanged: 1,
      semanticAffinityScores: { positive: 1, zero: 0, null: 0 }, storedSemanticAffinityScores: { null: 1 } });
    expect((await foreign.article.reload()).semanticAffinityScore).toBeNull();
    expect(article.semanticAffinityScore).toBeCloseTo(0.025, 4);
    expect((await read.reload()).semanticAffinityScore).toBeNull();
    await db.Island.destroy({ where: { userId: user.id, label: 'negative' } });
    await scoreArticlesFromIslandsForUser(user.id);
    await article.reload();
    expect(article.interestScore).toBe(0);
    expect(computeRecommended(article) - before).toBeCloseTo(0.0025, 8);
    const updatedAt = article.updatedAt;
    vi.setSystemTime(new Date(now.getTime() + 1000));
    await islands[0].update({ weight: 0 });
    const changed = await scoreArticlesFromIslandsForUser(user.id);
    await article.reload();
    expect(changed).toMatchObject({ interestScoresChanged: 0, semanticAffinityScoresChanged: 1, unchangedCount: 1 });
    expect(article.interestScoredAt.getTime()).toBe(now.getTime() + 1000);
    expect(article.updatedAt).toEqual(updatedAt);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([{ interestScore: 0.8, semanticAffinityScore: 0.8 }, { interestScore: 0, semanticAffinityScore: 0.9 }])(
    'does not overwrite newer completed evaluations or their clocks: %j', async scores => {
    const { user, article } = await fixture();
    const newerAt = new Date(now.getTime() + 1000);
    const result = await scoreArticlesFromIslandsForUser(user.id, { assertLease: async () => {
      await article.update({ ...scores, interestScoredAt: newerAt });
    } });
    expect(result.recordedEvaluationCount).toBe(0);
    await article.reload();
    expect(article.interestScore).toBeCloseTo(scores.interestScore);
    expect(article.semanticAffinityScore).toBeCloseTo(scores.semanticAffinityScore);
    expect(article.interestScoredAt).toEqual(newerAt);
  });

  it('refreshes score pairs on expiry without conflating equal interest scores', async () => {
    const { user, article, values } = await fixture();
    const zero = await db.Article.create({ ...values, articleVector: [0, 0, 0] });
    await db.Island.create({ userId: user.id, label: 'Expired', weight: 1, embedding_model: model,
      islandVector: [1, 0, 0], lastBehaviorAt: new Date(now.getTime() - ISLAND_INACTIVITY_DAYS * 86400000) });
    const personalization = createRequestPersonalization(user.id);
    await refreshExpiredArticleInterests(user.id, [article, zero], personalization.now, personalization);
    expect(article.interestScore).toBe(0);
    expect(zero.interestScore).toBe(0);
    await article.reload(); await zero.reload();
    expect(article.semanticAffinityScore).toBeCloseTo(0.025, 4);
    expect(zero.semanticAffinityScore).toBe(0);
    await db.Article.update({ semanticAffinityScore: 0.9 }, { where: { id: article.id } });
    await article.reload();
    await refreshExpiredArticleInterests(user.id, [article], personalization.now, personalization);
    expect(article.semanticAffinityScore).toBeCloseTo(0.025, 4);
    expect((await article.reload()).semanticAffinityScore).toBeCloseTo(0.9, 4);
  });

  it('evaluates without writes and explicitly recalculates read history using complete score pairs', async () => {
    const { user, article, values } = await fixture();
    await article.update({ status: 'read' });
    const zero = await db.Article.create({ ...values, status: 'read', articleVector: null });
    const newer = await db.Article.create({ ...values, status: 'read', articleVector: null, interestScoredAt: new Date(now.getTime() + 1000) });
    const rows = [];
    const evaluated = await runRecommendationScores({ userId: user.id, status: 'read' }, row => rows.push(row));
    expect(evaluated).toMatchObject({ persistedCount: 0, storedSemanticAffinityScores: { null: 3 }, semanticAffinityScores: { positive: 1, zero: 2, null: 0 } });
    expect(rows.find(row => row.id === article.id)).toMatchObject({ storedSemanticAffinityScore: null, semanticAffinityScore: 0.025 });
    const recalculated = await runRecommendationScores({ userId: user.id, status: 'read', mode: 'recalculate' });
    expect(recalculated).toMatchObject({ persistedCount: 2, skippedNewerCount: 1 });
    expect((await article.reload()).semanticAffinityScore).toBeCloseTo(0.025, 4);
    expect((await zero.reload()).semanticAffinityScore).toBe(0);
    expect((await newer.reload()).semanticAffinityScore).toBeNull();
    expect(article.interestScoredAt).toEqual(now);
    expect(zero.interestScoredAt).toEqual(now);
  });

  it('invalidates duplicates and resets only owned affinity when semantic state is removed', async () => {
    const { user, article, values } = await fixture();
    const foreign = await fixture();
    const duplicate = await db.Article.create({ ...values, semanticAffinityScore: 0.5 });
    await article.update({ semanticAffinityScore: 0.4 });
    await foreign.article.update({ semanticAffinityScore: 0.3 });
    await markArticleAsDuplicate(duplicate, article);
    expect((await duplicate.reload()).semanticAffinityScore).toBeNull();
    await resetSemanticStateForUser(user.id, { dryRun: true });
    expect((await article.reload()).semanticAffinityScore).toBeCloseTo(0.4);
    await resetSemanticStateForUser(user.id);
    expect((await article.reload()).semanticAffinityScore).toBeNull();
    expect((await foreign.article.reload()).semanticAffinityScore).toBeCloseTo(0.3);
    expect(await db.Island.count({ where: { userId: foreign.user.id } })).toBe(2);
  });

  it('updates both scores after Island calibration without regenerating embeddings', async () => {
    const { user, article } = await fixture();
    const vector = article.articleVector;
    await article.update({ semanticAffinityScore: 0.4 });
    await runIslandCalibrationForUser(user.id, { generateLabels: false });
    await article.reload();
    expect(Number.isFinite(article.semanticAffinityScore)).toBe(true);
    expect(article.articleVector).toEqual(vector);
    expect(article.interestScoredAt).toEqual(now);
  });
});
