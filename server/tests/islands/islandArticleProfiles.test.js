import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn()
}));

vi.mock('../../models/index.js', async () => {
  const { Sequelize } = await import('sequelize');
  return { default: { Article: { findAll: mocks.findAll }, sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) } };
});

import {
  buildInterestIslandProfilesForUser,
  buildArticleIslandWeight,
  computeArticleSignals
} from '../../services/islands/islandArticleProfiles.js';
import { DEFAULT_ARTICLE_AFFINITY_THRESHOLD, ISLAND_DISCOVERY_PROFILE_LIMIT } from '../../services/islands/islandVectorUtils.js';
import { embeddingSimilarity } from '../../services/vectors/embeddingModel.js';

describe('behavioral article island profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-17T00:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('bounds discovery while retaining both strong older and latest behavioral evidence', async () => {
    const rows = Array.from({ length: ISLAND_DISCOVERY_PROFILE_LIMIT + 20 }, (_, index) => ({
      id: index + 2, title: 'Repeated recent interest', articleVector: [0, 1], embedding_model: 'test-model',
      attentionBucket: 3, lastMeaningfulReadAt: new Date(Date.now() - (index + 1) * 1000)
    }));
    const strong = { id: 1, title: 'Older favorite', articleVector: [1, 0], embedding_model: 'test-model',
      favoriteInd: 1, favoritedAt: new Date(Date.now() - 80 * 86400000) };
    mocks.findAll.mockResolvedValue([...rows.reverse(), strong]);
    const profiles = await buildInterestIslandProfilesForUser(12);
    expect(profiles.summary.discoveryProfileCount).toBe(ISLAND_DISCOVERY_PROFILE_LIMIT);
    expect(profiles.summary.candidateCommunityCount).toBe(2);
    const ids = profiles.flatMap(profile => profile.articles.map(article => article.articleId));
    expect(ids).toContain(strong.id);
    expect(ids).toContain(2);
    expect(ids).toHaveLength(ISLAND_DISCOVERY_PROFILE_LIMIT);
  });

  it('does not retain below-threshold members after the candidate centroid moves', async () => {
    const rows = [0, 40, 60, 70, 80, 90, 100].map((angle, index) => ({
      id: index + 1, title: `Angle ${angle}`, embedding_model: 'test-model',
      articleVector: [Math.cos(angle * Math.PI / 180), Math.sin(angle * Math.PI / 180)],
      clickedAmount: 1, lastClickedAt: new Date()
    }));
    mocks.findAll.mockResolvedValue(rows);
    const profiles = await buildInterestIslandProfilesForUser(12);
    for (const profile of profiles) for (const article of profile.articles) {
      expect(embeddingSimilarity(article.vector, profile.vector, article.embedding_model, profile.embedding_model))
        .toBeGreaterThanOrEqual(DEFAULT_ARTICLE_AFFINITY_THRESHOLD);
    }
    expect(profiles.summary.unassignedBehavioralProfiles).toBeGreaterThan(0);
  });

  it('does not let a fresh opposing click make expired negative evidence consume a formation slot', async () => {
    mocks.findAll.mockResolvedValue([
      { id: 1, title: 'Old dislike', articleVector: [1, 0], embedding_model: 'model-a', negativeInd: 1,
        negativeFeedbackAt: new Date(Date.now() - 100 * 86400000), clickedAmount: 2, lastClickedAt: new Date() },
      { id: 2, title: 'New interest', articleVector: [0, 1], embedding_model: 'model-a', clickedAmount: 1, lastClickedAt: new Date() }
    ]);
    const profiles = await buildInterestIslandProfilesForUser(12, { maxIslands: 1 });
    expect(profiles).toHaveLength(1);
    expect(profiles[0].articles.map(article => article.articleId)).toEqual([2]);
  });

  it.each(['model-a', null, 'model-b'])('derives profile model metadata from article evidence: %s', async model => {
    mocks.findAll.mockResolvedValue([
      { id: 1, title: 'Database', articleVector: [1, 0], embedding_model: 'model-a', positiveInd: 1, publishedAt: new Date() },
      { id: 2, title: 'Database update', articleVector: [1, 0], embedding_model: model, positiveInd: 1, publishedAt: new Date() }
    ]);
    const profiles = await buildInterestIslandProfilesForUser(12);
    expect(profiles).toHaveLength(model === 'model-b' ? 2 : 1);
    expect(profiles[0].embedding_model).toBe('model-a');
    expect(profiles[0].articles).toHaveLength(model === 'model-a' ? 2 : 1);
    expect(mocks.findAll.mock.calls[0][0].attributes).toContain('embedding_model');
  });

  it.each([[0, 0], [1, 1], [2, 2], [3, 2], [20, 2]])('scores %i clicks as %i points before decay', (clickedAmount, expected) => {
    const result = computeArticleSignals({ clickedAmount, lastClickedAt: new Date() });
    expect(result.positiveScore).toBe(expected);
    expect(result.positiveSignals.clicks).toBe(expected);
  });

  it('keeps unchanged favorite evidence on the existing Island normalization scale', () => {
    expect(buildArticleIslandWeight([{ score: 4 }])).toBe(0.6014);
  });

  it('keeps a fresh favorite, capped clicks and deep read below a fresh dislike', () => {
    const result = computeArticleSignals({ favoriteInd: 1, clickedAmount: 20, attentionBucket: 3,
      negativeInd: 1, publishedAt: new Date() });
    expect(result.positiveScore - result.negativeScore).toBe(-1);
  });

  it('caps clicks and combines positive and deep-read signals', () => {
    const result = computeArticleSignals({
      positiveInd: 1,
      favoriteInd: 1,
      clickedAmount: 8,
      attentionBucket: 3,
      negativeInd: 0,
      publishedAt: new Date()
    });

    expect(result).toEqual({
      positiveScore: 15,
      negativeScore: 0,
      engagementScore: 15,
      positiveSignals: { positives: 1, stars: 1, clicks: 2, deepReads: 1, negatives: 0 }
    });
  });

  it.each([
    [{ positiveInd: 1 }, 8, 0],
    [{ negativeInd: 1 }, 0, 8],
    [{ positiveInd: 1, negativeInd: 1 }, 0, 8],
    [{}, 0, 0]
  ])('scores explicit feedback and resolves legacy conflicts: %j', (flags, positiveScore, negativeScore) => {
    expect(computeArticleSignals({ ...flags, publishedAt: new Date() }))
      .toMatchObject({ positiveScore, negativeScore });
  });

  it('preserves independent engagement when resolving contradictory explicit feedback', () => {
    expect(computeArticleSignals({ positiveInd: 1, negativeInd: 1, favoriteInd: 1,
      clickedAmount: 8, attentionBucket: 3, publishedAt: new Date() }))
      .toEqual({ positiveScore: 7, negativeScore: 8, engagementScore: 7,
        positiveSignals: { positives: 0, stars: 1, clicks: 2, deepReads: 1, negatives: 1 } });
  });

  it('leaves below-threshold evidence unassigned when the community cap is reached', async () => {
    mocks.findAll.mockResolvedValue([
      { id: 1, title: 'Primary', embedding_model: 'test-model', articleVector: [1, 0], positiveInd: 1, publishedAt: new Date() },
      { id: 2, title: 'Related', embedding_model: 'test-model', articleVector: [0.99, 0.01], favoriteInd: 1, publishedAt: new Date() },
      { id: 3, title: 'Different', embedding_model: 'test-model', articleVector: [0, 1], clickedAmount: 1, publishedAt: new Date() },
      { id: 4, title: 'No vector', embedding_model: 'test-model', articleVector: null, positiveInd: 1 },
      { id: 5, title: 'No signal', embedding_model: 'test-model', articleVector: [1, 0] }
    ]);

    const profiles = await buildInterestIslandProfilesForUser(12, { maxIslands: 1 });

    expect(mocks.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 12 }) }));
    expect(profiles).toHaveLength(1);
    expect(profiles[0].articles.map(article => article.articleId)).toEqual([1, 2]);
    expect(profiles[0].label).toBe('Primary');
    expect(profiles.summary).toMatchObject({ eligibleBehavioralProfiles: 3, assignedBehavioralProfiles: 2, unassignedBehavioralProfiles: 1 });
    const uncapped = await buildInterestIslandProfilesForUser(12, { maxIslands: 2 });
    expect(uncapped.map(profile => profile.articles.map(article => article.articleId))).toEqual([[1, 2], [3]]);
    expect(uncapped.summary.unassignedBehavioralProfiles).toBe(0);
    expect(profiles[0].positiveSignals).toEqual({ positives: 1, stars: 1, clicks: 0, deepReads: 0, negatives: 0 });
  });
});
