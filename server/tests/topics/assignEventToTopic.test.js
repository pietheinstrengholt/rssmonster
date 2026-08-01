import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  topicFindAll: vi.fn(),
  topicFindOne: vi.fn(),
  cosineSimilarity: vi.fn(),
  generateTopicKey: vi.fn(),
  updateMatchedTopics: vi.fn(),
  updateIdentityTopic: vi.fn(),
  updateTopicByKey: vi.fn(),
  createTopic: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Topic: { findAll: mocks.topicFindAll, findOne: mocks.topicFindOne },
    Sequelize: { Op: { in: Symbol('in') } }
  }
}));

vi.mock('../../services/topics/shared/topicHelpers.js', () => ({
  cosineSimilarity: mocks.cosineSimilarity,
  generateTopicKey: mocks.generateTopicKey
}));

vi.mock('../../services/topics/event/updateTopic.js', () => ({
  updateMatchedTopics: mocks.updateMatchedTopics,
  updateIdentityTopic: mocks.updateIdentityTopic,
  updateTopicByKey: mocks.updateTopicByKey
}));

vi.mock('../../services/topics/event/createTopics.js', () => ({
  createTopic: mocks.createTopic
}));

import {
  assignEventToTopic,
  assignSemanticUnitToTopic
} from '../../services/topics/event/assignEventToTopic.js';

describe('event topic assignment matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.topicFindAll.mockResolvedValue([]);
    mocks.topicFindOne.mockResolvedValue(null);
    mocks.generateTopicKey.mockReturnValue('topic-key');
    mocks.createTopic.mockResolvedValue([]);
  });

  it('returns no assignments when the semantic vector is missing', async () => {
    await expect(assignSemanticUnitToTopic({ semanticUnit: { id: 1 } })).resolves.toEqual([]);
    expect(mocks.topicFindAll).not.toHaveBeenCalled();
  });

  it('ranks cache matches, excludes behavioral topics, and records one primary topic', async () => {
    const first = { id: 8, topicType: 'event', topicVector: [1, 0] };
    const second = { id: 4, topicType: 'hybrid', topicVector: [0, 1] };
    const topicsCache = [
      { id: 1, topicType: 'behavioral', topicVector: [1, 0] },
      { id: 2, topicType: 'event', topicVector: null },
      first,
      second
    ];
    mocks.cosineSimilarity.mockReturnValueOnce(0.8).mockReturnValueOnce(0.8);

    const result = await assignSemanticUnitToTopic({
      semanticUnit: { id: 12, userId: 3, publishedAt: new Date('2026-08-01T10:00:00Z') },
      semanticVector: [1, 0],
      topicsCache,
      assignmentContext: 'recent-repair'
    });

    expect(result).toEqual([
      { topicId: 4, confidence: 0.8, rank: 1, primaryInd: true },
      { topicId: 8, confidence: 0.8, rank: 2, primaryInd: false }
    ]);
    expect(mocks.updateMatchedTopics).toHaveBeenCalledWith(expect.objectContaining({
      primaryCandidate: expect.objectContaining({ topic: second }),
      assignmentContext: 'recent-repair'
    }));
    expect(mocks.topicFindAll).not.toHaveBeenCalled();
  });

  it('uses an identity match when similarity is below assignment thresholds', async () => {
    const bestTopic = { id: 5, topicVector: [1, 0] };
    mocks.topicFindAll.mockResolvedValue([bestTopic]);
    mocks.cosineSimilarity.mockReturnValue(0.55);
    mocks.updateIdentityTopic.mockResolvedValue({
      topicId: 5,
      confidence: 0.55,
      rank: 1,
      primaryInd: true
    });

    await expect(assignSemanticUnitToTopic({
      semanticUnit: { id: 13, userId: 3 },
      semanticVector: [1, 0]
    })).resolves.toEqual([{ topicId: 5, confidence: 0.55, rank: 1, primaryInd: true }]);

    expect(mocks.updateIdentityTopic).toHaveBeenCalledWith(expect.objectContaining({ bestTopic }));
  });

  it('refreshes a cached stable-key match before querying persistence', async () => {
    const topic = { id: 6, topicType: 'event', topicKey: 'topic-key', topicVector: null };
    mocks.updateTopicByKey.mockResolvedValue({ topicId: 6, confidence: 1, rank: 1, primaryInd: true });

    const result = await assignSemanticUnitToTopic({
      semanticUnit: { id: 14, userId: 3 },
      semanticVector: [1, 0],
      topicsCache: [topic]
    });

    expect(result[0].topicId).toBe(6);
    expect(mocks.updateTopicByKey).toHaveBeenCalledWith(expect.objectContaining({ topic }));
    expect(mocks.topicFindOne).not.toHaveBeenCalled();
  });

  it('refreshes a persisted stable-key match when the cache misses', async () => {
    const topic = { id: 7 };
    mocks.topicFindOne.mockResolvedValue(topic);
    mocks.updateTopicByKey.mockResolvedValue({ topicId: 7, confidence: 1, rank: 1, primaryInd: true });

    const result = await assignSemanticUnitToTopic({
      semanticUnit: { id: 15, userId: 3 },
      semanticVector: [1, 0]
    });

    expect(result[0].topicId).toBe(7);
    expect(mocks.topicFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 3, topicKey: 'topic-key' })
    }));
  });

  it('delegates creation and preserves the article-style adapter contract', async () => {
    mocks.generateTopicKey.mockReturnValue(null);
    mocks.createTopic.mockResolvedValue([{ topicId: 9, confidence: 1, rank: 1, primaryInd: true }]);

    const result = await assignEventToTopic({
      article: { id: 16, userId: 3 },
      articleTopicVector: [1, 0],
      assignmentContext: 'historical-rebuild'
    });

    expect(result).toEqual([{ topicId: 9, confidence: 1, rank: 1, primaryInd: true }]);
    expect(mocks.createTopic).toHaveBeenCalledWith(expect.objectContaining({
      currentEventId: 16,
      topicKey: null
    }));
  });

  it('returns no assignment when stable-key lookup and creation both miss', async () => {
    await expect(assignSemanticUnitToTopic({
      semanticUnit: { id: 17, userId: 3 },
      semanticVector: [1, 0]
    })).resolves.toEqual([]);

    expect(mocks.createTopic).toHaveBeenCalled();
  });
});
