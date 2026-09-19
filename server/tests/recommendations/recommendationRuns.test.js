import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { runRecommendationScores, resolveRecommendationRunOptions } from '../../services/recommendations/runRecommendationScores.js';
import { computeRecommendedBreakdown } from '../../services/recommendations/recommendedScore.js';

const now = Date.parse('2026-09-19T12:00:00Z');
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

async function fixture() {
  const user = await db.User.create({ username: `recommendation-run-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Evaluation' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id,
    feedName: 'Evaluation', url: `https://${user.id}.example/rss`, feedTrust: 0.8 });
  const values = { userId: user.id, feedId: feed.id, title: 'Orchestral concert review', status: 'unread',
    publishedAt: new Date(now - 3600000), embedding_model: 'test-model', articleVector: [1, 0],
    interestScore: 0.7, qualityScore: 80, sentimentScore: 80, advertisementScore: 80 };
  return { user, values };
}
async function run(userId, options = {}) {
  const rows = [];
  const summary = await runRecommendationScores({ userId, ...options }, row => rows.push(row));
  return { summary, rows };
}

describe('recommendation evaluation and recalculation', () => {
  it('selects the latest 1000 by publication date, breaks ties by ID and performs no database writes', async () => {
    const { user, values } = await fixture();
    const articles = await db.Article.bulkCreate(Array.from({ length: 1002 }, (_, index) => ({
      ...values, articleVector: null, publishedAt: new Date(now - index * 1000), status: index % 2 ? 'read' : 'unread'
    })));
    const before = await db.Article.findAll({ where: { userId: user.id }, raw: true });
    const { rows, summary } = await run(user.id);
    expect(rows.map(row => row.id)).toEqual(articles.slice(0, 1000).map(article => article.id));
    expect(summary).toMatchObject({ processedCount: 1000, persistedCount: 0, neutralCount: 1000, limit: 1000 });
    expect(rows.every(row => Number.isFinite(row.recommended))).toBe(true);
    expect(await db.Article.findAll({ where: { userId: user.id }, raw: true })).toEqual(before);
    await articles[1].update({ publishedAt: articles[0].publishedAt });
    expect((await run(user.id, { limit: 2 })).rows.map(row => row.id)).toEqual([articles[1].id, articles[0].id]);
  });

  it('recalculates all unread across batches, excludes ineligible/foreign rows and honors an explicit limit', async () => {
    const { user, values } = await fixture();
    const other = await fixture();
    const unread = await db.Article.bulkCreate(Array.from({ length: 1005 }, () => ({ ...values, articleVector: null })));
    const excluded = await db.Article.bulkCreate([
      { ...values, status: 'read' }, { ...values, filteredInd: true },
      { ...values, duplicateOfArticleId: unread[0].id }, { ...values, status: 'duplicate' }, other.values
    ]);
    const before = await Promise.all(excluded.map(async row => (await row.reload()).get({ plain: true })));
    const limited = await run(user.id, { mode: 'recalculate', status: 'unread', limit: 2 });
    expect(limited.rows.map(row => row.id)).toEqual(unread.slice(-2).reverse().map(row => row.id));
    expect(await db.Article.count({ where: { userId: user.id, interestScoredAt: { [db.Sequelize.Op.ne]: null } } })).toBe(2);
    const { summary, rows } = await run(user.id, { mode: 'recalculate', status: 'unread' });
    expect(summary).toMatchObject({ limit: null, processedCount: 1005, persistedCount: 1005, neutralCount: 1005 });
    expect(new Set(rows.map(row => row.id)).size).toBe(1005);
    const refreshed = await db.Article.findAll({ where: { userId: user.id, id: unread.map(row => row.id) },
      attributes: ['id', 'interestScore', 'interestScoredAt'] });
    for (const article of refreshed) {
      expect(Number(article.interestScore)).toBe(0);
      expect(article.interestScoredAt.getTime()).toBe(now);
    }
    for (const [index, article] of excluded.entries()) expect((await article.reload()).get({ plain: true })).toEqual(before[index]);
  });

  it('uses current Island and runtime ranking evidence, keeps Islands unchanged, and persists scores for read articles', async () => {
    const { user, values } = await fixture();
    const source = await db.Article.create({ ...values, status: 'read', favoriteInd: 1, favoritedAt: new Date(now) });
    const island = await db.Island.create({ userId: user.id, label: 'Concerts', weight: 0.8,
      islandVector: [1, 0], embedding_model: 'test-model', lastBehaviorAt: new Date(now), supportArticleIds: [String(source.id)] });
    const held = await db.Article.create({ ...values, status: 'read', interestScore: -0.4, publishedAt: new Date(now),
      url: `https://${user.id}.example/held-out` });
    const event = await db.Event.create({ userId: user.id, representativeArticleId: held.id, articleCount: 8, sourceCount: 4 });
    await held.update({ eventId: event.id });
    await db.Tag.create({ userId: user.id, articleId: held.id, name: 'Rule', tagType: 'rule' });
    const snapshot = (await island.reload()).get({ plain: true });
    const evaluated = await run(user.id, { limit: 1 });
    const row = evaluated.rows[0];
    expect(row.interestScore).toBeGreaterThan(0);
    expect(row.islandOnlyInterest).toBe(row.interestScore);
    expect(row.supportingIslandIds).toEqual([]);
    expect(row.interestDiagnostics.seedSelf).toBe(false);
    expect(row.breakdown.ruleBoost).toBe(0.08);
    expect(row.breakdown.corroboration).toBeGreaterThan(0);
    const loaded = await db.Article.findByPk(held.id, { include: [db.Feed, db.Tag, { model: db.Event, as: 'event' }] });
    const expected = computeRecommendedBreakdown({ ...loaded.get({ plain: true }), interestScore: row.interestScore });
    expect(row.recommended).toBe(expected.recommended);
    expect(Number((await held.reload()).interestScore)).toBeCloseTo(-0.4);
    const beforeWrite = await db.Article.findByPk(held.id, { raw: true });
    const recalculated = await run(user.id, { mode: 'recalculate', limit: 1 });
    expect(recalculated.rows[0].interestScore).toBe(row.interestScore);
    expect(Number((await held.reload()).interestScore)).toBeCloseTo(row.interestScore);
    const afterWrite = await db.Article.findByPk(held.id, { raw: true });
    for (const field of ['interestScore', 'interestScoredAt']) { delete beforeWrite[field]; delete afterWrite[field]; }
    expect(afterWrite).toEqual(beforeWrite);
    expect((await island.reload()).get({ plain: true })).toEqual(snapshot);
    expect((await run(user.id, { limit: 2 })).rows.find(row => row.id === source.id).supportingIslandIds).toEqual([island.id]);
  });

  it('does not use another user’s Event or rule tags through indirect associations', async () => {
    const { user, values } = await fixture();
    const other = await fixture();
    const article = await db.Article.create(values);
    const foreign = await db.Event.create({ userId: other.user.id, representativeArticleId: article.id, articleCount: 64, sourceCount: 8 });
    await article.update({ eventId: foreign.id, feedId: other.values.feedId });
    await db.Tag.create({ userId: other.user.id, articleId: article.id, name: 'Foreign rule', tagType: 'rule' });
    const { rows } = await run(user.id);
    expect(rows[0].breakdown).toMatchObject({ corroboration: 0, ruleBoost: 0 });
    expect(rows[0].breakdown.quality).toBeCloseTo(0.8 * 0.7 + 0.5 * 0.3);
  });

  it('preserves newer evaluations and returns an empty report for a user with no articles', async () => {
    const { user, values } = await fixture();
    expect((await run(user.id)).summary.processedCount).toBe(0);
    const article = await db.Article.create({ ...values, interestScoredAt: new Date(now + 1000) });
    const { summary } = await run(user.id, { mode: 'recalculate' });
    expect(summary).toMatchObject({ processedCount: 1, persistedCount: 0, skippedNewerCount: 1 });
    expect(Number((await article.reload()).interestScore)).toBeCloseTo(0.7);
  });

  it('validates scope without silently expanding to every user or every article', async () => {
    expect(resolveRecommendationRunOptions({ userId: 1, status: 'unread' })).toMatchObject({ limit: null });
    for (const options of [{}, { userId: -1 }, { userId: 1, status: 'invalid' }, { userId: 1, limit: 0 }, { userId: 1, mode: 'write' }]) {
      await expect(runRecommendationScores(options)).rejects.toThrow();
    }
    await expect(runRecommendationScores({ userId: 2147483647 })).rejects.toThrow('does not exist');
  });
});
