import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  topicCreate: vi.fn(),
  collectTopicSeedEvents: vi.fn(),
  collectEventArticleTitles: vi.fn(),
  averageVector: vi.fn(),
  evaluateTopicCreationGate: vi.fn(),
  debugTopicGate: vi.fn(),
  upsertTopicInCache: vi.fn(),
  generateTopicName: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: { Topic: { create: mocks.topicCreate } }
}));

vi.mock('../../services/topics/shared/topicHelpers.js', () => ({
  MIN_ARTICLES_FOR_TOPIC_CREATION: 3,
  MIN_EVENTS_FOR_TOPIC_CREATION: 2,
  collectTopicSeedEvents: mocks.collectTopicSeedEvents,
  collectEventArticleTitles: mocks.collectEventArticleTitles,
  averageVector: mocks.averageVector,
  evaluateTopicCreationGate: mocks.evaluateTopicCreationGate,
  debugTopicGate: mocks.debugTopicGate,
  upsertTopicInCache: mocks.upsertTopicInCache
}));

vi.mock('../../services/topics/shared/topicName.service.js', () => ({
  generateTopicName: mocks.generateTopicName
}));

import { createTopic } from '../../services/topics/event/createTopics.js';

describe('event topic creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.generateTopicName.mockReturnValue('OpenAI Models');
    mocks.collectEventArticleTitles.mockResolvedValue([]);
  });

  it('returns no assignment and logs gate evidence when creation is blocked', async () => {
    mocks.collectTopicSeedEvents.mockResolvedValue([{
      event: { id: 4, articleCount: 2, sourceCount: 1, eventStrength: 0.2, status: 'emerging' },
      similarity: Infinity
    }]);
    mocks.evaluateTopicCreationGate.mockReturnValue({ passed: false, reason: null });

    const result = await createTopic({
      semanticUnit: { id: 4, userId: 2, articleCount: 1 },
      semanticVector: [1, 0],
      topicKey: 'key',
      now: new Date('2026-08-01T10:00:00Z'),
      currentEventId: 4,
      topicsCache: []
    });

    expect(result).toEqual([]);
    expect(mocks.collectEventArticleTitles).toHaveBeenCalledWith(2, 4);
    expect(mocks.topicCreate).not.toHaveBeenCalled();
    expect(mocks.debugTopicGate).toHaveBeenCalledTimes(2);
  });

  it('creates a topic with vector and key fallbacks after the gate passes', async () => {
    const seedEvents = [
      { event: { id: 8, eventVector: [1, 0], articleCount: 2 }, similarity: 0.91 },
      { event: { id: 9, eventVector: [0.9, 0.1], articleCount: 2 }, similarity: 0.89 }
    ];
    const createdTopic = { id: 21 };
    const topicsCache = [];
    mocks.collectTopicSeedEvents.mockResolvedValue(seedEvents);
    mocks.evaluateTopicCreationGate.mockReturnValue({ passed: true, reason: 'seed-evidence' });
    mocks.averageVector.mockReturnValue(null);
    mocks.topicCreate.mockResolvedValue(createdTopic);

    const result = await createTopic({
      semanticUnit: { id: 8, userId: 2, articleCount: 2 },
      semanticVector: [1, 0],
      topicKey: null,
      now: new Date('2026-08-01T10:00:00Z'),
      currentEventId: 8,
      topicsCache
    });

    expect(mocks.topicCreate).toHaveBeenCalledWith(expect.objectContaining({
      topicKey: 'topic-2-8',
      topicVector: [1, 0],
      topicType: 'event'
    }));
    expect(mocks.upsertTopicInCache).toHaveBeenCalledWith(topicsCache, createdTopic);
    expect(result).toEqual([{ topicId: 21, confidence: 0.91, rank: 1, primaryInd: true }]);
  });
});
