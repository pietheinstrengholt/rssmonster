import { articleRecords } from '../../services/articles/articleRecords.js';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { evaluateArticleInterest, prepareIslandEvidence } from '../../services/islands/islandInterestConfidence.js';
import { scoreArticlesFromIslandsForUser } from '../../services/score/scoreArticlesFromIslands.js';
import { disambiguateDuplicateIslandNamesForUser } from '../../services/islands/islandNameDisambiguation.js';

const now = new Date('2026-09-15T12:00:00Z');
const article = { id: 99, title: 'Database technical guide', embedding_model: 'test-model', articleVector: [1, 0] };
const island = { id: 1, weight: 0.7, embedding_model: 'test-model', islandVector: [1, 0] };
const context = (islands = [], evidence = []) => ({ ...prepareIslandEvidence(islands, evidence), now: now.getTime() });
afterEach(() => vi.useRealTimers());

describe('interest funnel diagnostics', () => {
  it('distinguishes absent evidence, incompatible vectors, similarity rejection and zero preference', () => {
    expect(evaluateArticleInterest(article, context()).diagnostics.zeroReason).toBe('no_eligible_evidence');
    expect(evaluateArticleInterest({ ...article, embedding_model: null }, context([island])).diagnostics.zeroReason).toBe('no_compatible_vector');
    expect(evaluateArticleInterest({ ...article, articleVector: [0, 1] }, context([island])).diagnostics.zeroReason).toBe('below_similarity_threshold');
    expect(evaluateArticleInterest(article, context([{ ...island, weight: 0 }])).diagnostics.zeroReason).toBe('zero_preference_or_confidence');
  });

  it('counts all qualifying Islands before selecting the strongest path of each sign', () => {
    const result = evaluateArticleInterest(article, context([island, { ...island, id: 2, weight: 0.4 }]));
    expect(result.paths).toHaveLength(1);
    expect(result.diagnostics).toMatchObject({ qualifyingIslands: 2, zeroReason: null });
  });

  it('distinguishes signed cancellation from rounding away weak evidence', () => {
    const evidence = context([island, { ...island, id: 2, weight: -0.7 }]);
    evidence.islands[1].negativeIntent = 'technical';
    expect(evaluateArticleInterest(article, evidence).diagnostics.zeroReason).toBe('signed_cancellation');
    expect(evaluateArticleInterest(article, context([{ ...island, weight: 0.00001 }])).diagnostics.zeroReason).toBe('rounded_to_zero');
  });

  it('reproduces target-specific fallback loss when the source is represented but the target misses its centroid', () => {
    // Characterization of a known limitation; this diagnostics change does not repair it.
    const source = { ...article, id: 1, positiveInd: 1, positiveFeedbackAt: now };
    const target = { ...article, articleVector: [0.94, -0.342] };
    const withoutIsland = evaluateArticleInterest(target, context([], [source]));
    const withIsland = evaluateArticleInterest(target, context([{ ...island, islandVector: [0.7, Math.sqrt(0.51)] }], [source]));
    expect(withoutIsland.score).toBeGreaterThan(0);
    expect(withIsland.score).toBe(0);
    expect(withIsland.diagnostics).toMatchObject({ suppressedExplicitEvidenceCount: 1, zeroReason: 'below_similarity_threshold' });
  });

  it('records neutral unchanged evaluations across batches without touching excluded articles', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    const user = await db.User.create({ username: `diagnostic-${randomUUID()}` });
    const category = await db.Category.create({ userId: user.id, name: 'Diagnostics' });
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Diagnostics', url: `https://${user.id}.example/rss` });
    const values = { userId: user.id, feedId: feed.id, title: 'Untouched article', status: 'unread' };
    const eligible = await articleRecords.bulkCreate(Array.from({ length: 201 }, () => values));
    const read = await articleRecords.create({ ...values, status: 'read' });
    const filtered = await articleRecords.create({ ...values, filteredInd: true });
    const duplicate = await articleRecords.create({ ...values, duplicateOfArticleId: eligible[0].id });
    const foreign = await db.User.create({ username: `diagnostic-other-${randomUUID()}` });
    const foreignArticle = await articleRecords.create({ ...values, userId: foreign.id });
    const result = await scoreArticlesFromIslandsForUser(user.id);
    expect(result).toMatchObject({ scannedCount: 201, candidatesRescored: 201, neutralCount: 201,
      unchangedCount: 201, interestScoresChanged: 0, recordedEvaluationCount: 201, updatedCount: 0,
      eligibility: { eligible: 201, filtered: 1, duplicate: 1, not_unread: 1 },
      zeroReasons: { no_eligible_evidence: 201 }, islandMatches: { zero: 201, one: 0, multiple: 0 } });
    await eligible[0].reload(); await eligible.at(-1).reload();
    expect(eligible[0].interestScoredAt).toEqual(now);
    expect(eligible.at(-1).interestScoredAt).toEqual(now);
    for (const row of [read, filtered, duplicate, foreignArticle]) {
      await row.reload(); expect(row.interestScoredAt).toBeNull();
    }
    vi.setSystemTime(new Date(now.getTime() + 60000));
    await scoreArticlesFromIslandsForUser(user.id);
    await eligible[0].reload();
    expect(eligible[0].interestScoredAt.getTime()).toBe(now.getTime() + 60000);
    expect(Number(eligible[0].interestScore)).toBe(0);
    const scoped = await scoreArticlesFromIslandsForUser(user.id, { relatedToArticle: article });
    expect(scoped).toMatchObject({ scannedCount: 201, scopeSkippedCount: 201, candidatesRescored: 0, recordedEvaluationCount: 0 });
  });

  it.each([0.8, -0.8])('preserves same-name signed evidence and held-out scores for weight %s', async weight => {
    const user = await db.User.create({ username: `signed-name-${randomUUID()}` });
    const foreign = await db.User.create({ username: `signed-other-${randomUUID()}` });
    const values = { ...island, id: undefined, userId: user.id, label: 'Databases',
      positiveSignals: { stars: 2, negatives: 1 },
      populationAudit: [{ metrics: { relatedArticleCount: 3 } }] };
    const positive = await db.Island.create({ ...values, weight: 0.9 });
    const other = await db.Island.create({ ...values, label: ' databases! ', weight });
    const archived = await db.Island.create({ ...values, archivedInd: true, archivedAt: now });
    const foreignIsland = await db.Island.create({ ...values, userId: foreign.id });
    for (const row of [positive, other, archived, foreignIsland]) await row.reload();
    const untouched = [archived.toJSON(), foreignIsland.toJSON()];
    const semanticState = row => Object.fromEntries(Object.entries(row.toJSON())
      .filter(([key]) => !['label', 'updatedAt'].includes(key)));
    const before = [positive, other].map(semanticState);
    const activeIslands = () => db.Island.findAll({ where: { userId: user.id, archivedInd: false }, order: [['id', 'ASC']], raw: true });
    // These candidates supplied no formation evidence. Compare complete signed paths,
    // confidence and zero reasons, including a candidate below the relationship gate.
    const heldOut = [[1, 0], [0.8, 0.6], [0, 1]].map(articleVector => ({ ...article, articleVector }));
    const evidence = [
      { ...article, id: 1, positiveInd: 1, positiveFeedbackAt: now },
      { ...article, id: 2, negativeInd: 1, negativeFeedbackAt: now }
    ];
    const score = islands => heldOut.map(candidate => evaluateArticleInterest(candidate, context(islands, evidence)));
    const scoresBefore = score(await activeIslands());
    expect(scoresBefore[0].paths.some(path => path.contribution > 0)).toBe(true);
    if (weight < 0) expect(scoresBefore[0].paths.some(path => path.contribution < 0)).toBe(true);

    const result = await disambiguateDuplicateIslandNamesForUser(user.id);
    await positive.reload(); await other.reload();
    expect(result.archived).toEqual([]);
    expect(result.renamed).toHaveLength(1);
    expect(positive.label).toBe('Databases');
    expect(other.label).toBe('Databases: Variant');
    expect([positive, other].map(semanticState)).toEqual(before);
    expect(score(await activeIslands())).toEqual(scoresBefore);
    await expect(disambiguateDuplicateIslandNamesForUser(user.id)).resolves.toEqual({ renamed: [], archived: [] });
    await archived.reload(); await foreignIsland.reload();
    expect([archived.toJSON(), foreignIsland.toJSON()]).toEqual(untouched);
  });
});
