import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { buildInterestIslandProfilesForUser } from '../../services/islands/islandArticleProfiles.js';
import { persistInterestIslandProfiles } from '../../services/islands/islandPersistence.js';
import { EVIDENCE_LIMIT, evaluateArticleInterest, loadIslandEvidence } from '../../services/islands/islandInterestConfidence.js';
import { ISLAND_SUPPORT_LIMIT, islandSupportArticleIds } from '../../services/islands/islandSupport.js';

const now = Date.parse('2026-09-19T12:00:00Z');
const day = 86400000;
const candidate = { id: 'held-out', userId: 1, title: 'Technical database guide', articleVector: [0.8, 0.6], embedding_model: 'test-model' };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

async function graph() {
  const user = await db.User.create({ username: `island-support-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Support' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Support', url: `https://${user.id}.example/rss` });
  const values = { userId: user.id, feedId: feed.id, title: candidate.title, status: 'read',
    articleVector: [1, 0], embedding_model: 'test-model', favoriteInd: 1, favoritedAt: new Date(now - 30 * day),
    publishedAt: new Date(now - 30 * day) };
  return { user, values };
}

const calibrate = async userId => db.sequelize.transaction(async transaction =>
  persistInterestIslandProfiles(userId, await buildInterestIslandProfilesForUser(userId, { transaction }), transaction));
const distract = values => db.Article.bulkCreate(Array.from({ length: EVIDENCE_LIMIT + 1 }, () => ({
  ...values, favoriteInd: 0, favoritedAt: null, attentionBucket: 3,
  lastMeaningfulReadAt: new Date(now), articleVector: [0, 1]
})));

describe('retained Island support', () => {
  it('keeps older calibrated support and held-out confidence when unrelated recent behavior fills the sample', async () => {
    const { user, values } = await graph();
    const sources = await db.Article.bulkCreate(Array.from({ length: 6 }, (_, index) => ({
      ...values, favoritedAt: new Date(now - (30 + index) * day)
    })));
    const [island] = await calibrate(user.id);
    expect(island.supportArticleIds).toEqual(sources.map(article => String(article.id)));
    const before = await loadIslandEvidence(user.id, { now });
    const original = evaluateArticleInterest(candidate, before);
    expect(original.score).toBeGreaterThan(0);
    expect(before.islands[0].diagnostics.distinctBehavioralArticles).toBe(6);
    await distract(values);
    const after = await loadIslandEvidence(user.id, { now });
    expect(after.islands[0].diagnostics.distinctBehavioralArticles).toBe(6);
    expect(after.islands[0].islandConfidence).toBe(before.islands[0].islandConfidence);
    expect(evaluateArticleInterest(candidate, after)).toMatchObject({ score: original.score, paths: original.paths });
    expect(evaluateArticleInterest({ ...candidate, articleVector: [-1, 0] }, after).score).toBe(0);

    // Audit history is not used as a substitute for the retained support field.
    await island.update({ supportArticleIds: null });
    const legacy = await loadIslandEvidence(user.id, { now });
    expect(legacy.islands[0].diagnostics.distinctBehavioralArticles).toBe(0);
    expect(evaluateArticleInterest(candidate, legacy).score).toBeLessThan(original.score);
  });

  it('revalidates ownership, visibility, behavior and vector compatibility without trusting stale IDs', async () => {
    const { user, values } = await graph();
    const foreign = await graph();
    const sources = await db.Article.bulkCreate(Array.from({ length: 9 }, () => values));
    const [island] = await calibrate(user.id);
    await distract(values);
    await sources[0].destroy();
    await sources[1].update({ userId: foreign.user.id });
    await sources[2].update({ filteredInd: true });
    await sources[3].update({ duplicateOfArticleId: sources[8].id });
    await sources[4].update({ favoriteInd: 0 });
    await sources[5].update({ embedding_model: 'other-model' });
    await sources[6].update({ articleVector: [0, 1] });
    await sources[7].update({ articleVector: null });
    const context = await loadIslandEvidence(user.id, { now });
    expect(context.islands[0].seedArticleIds.map(String)).toEqual([String(sources[8].id)]);
    expect(context.islands[0].diagnostics).toMatchObject({ distinctBehavioralArticles: 1, singleton: true });
    expect(evaluateArticleInterest(candidate, context).score).toBeGreaterThan(0);
    // Loading confidence neither repairs IDs nor changes the persisted Island.
    expect((await island.reload()).supportArticleIds).toHaveLength(9);
    await island.update({ archivedInd: true, archivedAt: new Date(now) });
    expect((await loadIslandEvidence(user.id, { now })).islands).toHaveLength(0);
  });

  it('bounds, replaces and rolls back support snapshots along with calibration', async () => {
    const { user, values } = await graph();
    const sources = await db.Article.bulkCreate(Array.from({ length: ISLAND_SUPPORT_LIMIT + 2 }, () => values));
    const [island] = await calibrate(user.id);
    const initialIds = sources.slice(0, ISLAND_SUPPORT_LIMIT).map(article => String(article.id));
    expect(island.supportArticleIds).toEqual(initialIds);
    await calibrate(user.id);
    expect((await island.reload()).supportArticleIds).toEqual(initialIds);
    await sources[0].update({ favoriteInd: 0 });
    await sources[1].update({ filteredInd: true });
    await expect(db.sequelize.transaction(async transaction => {
      const profiles = await buildInterestIslandProfilesForUser(user.id, { transaction });
      await persistInterestIslandProfiles(user.id, profiles, transaction);
      throw new Error('rollback support snapshot');
    })).rejects.toThrow('rollback support snapshot');
    expect((await island.reload()).supportArticleIds).toEqual(initialIds);
    await calibrate(user.id);
    expect((await island.reload()).supportArticleIds).toEqual(sources.slice(2).map(article => String(article.id)));
  });

  it('refreshes unmatched active Island support and preserves negative interest', async () => {
    const { user, values } = await graph();
    const source = await db.Article.create({ ...values, favoriteInd: 0, favoritedAt: null,
      negativeInd: 1, negativeFeedbackAt: new Date(now - 30 * day) });
    const island = await db.Island.create({ userId: user.id, label: 'Existing negative preference',
      weight: -0.8, islandVector: [1, 0], embedding_model: 'test-model', lastBehaviorAt: new Date(now - 30 * day) });
    await db.sequelize.transaction(transaction => persistInterestIslandProfiles(user.id, [], transaction));
    expect((await island.reload()).supportArticleIds).toEqual([String(source.id)]);
    await distract(values);
    const context = await loadIslandEvidence(user.id, { now });
    expect(context.islands[0].diagnostics.negativeEvidenceCount).toBe(1);
    expect(evaluateArticleInterest(candidate, context).score).toBeLessThan(0);
  });

  it('bounds and deduplicates stored IDs without losing large integer identifiers', () => {
    expect(islandSupportArticleIds([1, '1', '18446744073709551615', null, {}, -1, 1.5, 'bad', '01']))
      .toEqual(['1', '18446744073709551615']);
    expect(islandSupportArticleIds(null)).toEqual([]);
    expect(islandSupportArticleIds(Array.from({ length: 100 }, (_, index) => index + 1))).toHaveLength(ISLAND_SUPPORT_LIMIT);
  });
});
