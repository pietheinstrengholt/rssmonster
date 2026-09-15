import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('behavioral article island profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const result = computeArticleSignals({ clickedAmount, lastClickedAt: new Date(Date.now() + 60000) });
    expect(result.positiveScore).toBe(expected);
    expect(result.positiveSignals.clicks).toBe(expected);
  });

  it('keeps unchanged favorite evidence on the existing Island normalization scale', () => {
    expect(buildArticleIslandWeight([{ score: 4 }])).toBe(0.6014);
  });

  it('keeps a fresh favorite, capped clicks and deep read below a fresh dislike', () => {
    const result = computeArticleSignals({ favoriteInd: 1, clickedAmount: 20, attentionBucket: 3,
      negativeInd: 1, publishedAt: new Date(Date.now() + 60000) });
    expect(result.positiveScore - result.negativeScore).toBe(-1);
  });

  it('caps clicks and combines positive and deep-read signals', () => {
    const result = computeArticleSignals({
      positiveInd: 1,
      favoriteInd: 1,
      clickedAmount: 8,
      attentionBucket: 3,
      negativeInd: 0,
      publishedAt: new Date(Date.now() + 60_000)
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
    expect(computeArticleSignals({ ...flags, publishedAt: new Date(Date.now() + 60_000) }))
      .toMatchObject({ positiveScore, negativeScore });
  });

  it('preserves independent engagement when resolving contradictory explicit feedback', () => {
    expect(computeArticleSignals({ positiveInd: 1, negativeInd: 1, favoriteInd: 1,
      clickedAmount: 8, attentionBucket: 3, publishedAt: new Date(Date.now() + 60_000) }))
      .toEqual({ positiveScore: 7, negativeScore: 8, engagementScore: 7,
        positiveSignals: { positives: 0, stars: 1, clicks: 2, deepReads: 1, negatives: 1 } });
  });

  it('leaves below-threshold evidence unassigned when the community cap is reached', async () => {
    mocks.findAll.mockResolvedValue([
      { id: 1, title: 'Primary', embedding_model: 'test-model', articleVector: [1, 0], positiveInd: 1, publishedAt: new Date(Date.now() + 60_000) },
      { id: 2, title: 'Related', embedding_model: 'test-model', articleVector: [0.99, 0.01], favoriteInd: 1, publishedAt: new Date(Date.now() + 60_000) },
      { id: 3, title: 'Different', embedding_model: 'test-model', articleVector: [0, 1], clickedAmount: 1, publishedAt: new Date(Date.now() + 60_000) },
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
