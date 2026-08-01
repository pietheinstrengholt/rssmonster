import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  blendTopicVector: vi.fn(),
  blendTopicVectorWithAlpha: vi.fn(),
  shouldDriftTopicVector: vi.fn(),
  upsertTopicInCache: vi.fn()
}));

vi.mock('../../services/topics/shared/topicHelpers.js', () => ({
  TOPIC_VECTOR_DRIFT_ALPHA: 0.03,
  blendTopicVector: mocks.blendTopicVector,
  blendTopicVectorWithAlpha: mocks.blendTopicVectorWithAlpha,
  shouldDriftTopicVector: mocks.shouldDriftTopicVector,
  upsertTopicInCache: mocks.upsertTopicInCache
}));

import {
  updateIdentityTopic,
  updateMatchedTopics,
  updateTopicByKey
} from '../../services/topics/event/updateTopic.js';

// Builds a topic double whose update returns its new persisted shape.
function topic(id, topicVector = [1, 0]) {
  const instance = { id, topicVector };
  instance.update = vi.fn(async values => ({ ...instance, ...values }));
  return instance;
}

describe('topic update behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.blendTopicVector.mockReturnValue([0.9, 0.1]);
    mocks.blendTopicVectorWithAlpha.mockReturnValue([0.99, 0.01]);
  });

  it('drifts only the eligible primary match and refreshes every cached topic', async () => {
    const primary = topic(1);
    const secondary = topic(2, [0, 1]);
    const topicsCache = [primary, secondary];
    mocks.shouldDriftTopicVector.mockReturnValueOnce(true).mockReturnValueOnce(false);

    await updateMatchedTopics({
      rankedCandidates: [
        { topic: primary, sim: 0.8 },
        { topic: secondary, sim: 0.7 }
      ],
      primaryCandidate: { topic: primary, sim: 0.8 },
      semanticVector: [0.8, 0.2],
      semanticUnit: { id: 10 },
      assignmentContext: 'incremental',
      now: 'now',
      topicsCache
    });

    expect(primary.update).toHaveBeenCalledWith({ topicVector: [0.99, 0.01], lastActivityAt: 'now' });
    expect(secondary.update).toHaveBeenCalledWith({ lastActivityAt: 'now' });
    expect(mocks.upsertTopicInCache).toHaveBeenCalledTimes(2);
  });

  it('updates identity matches with and without vector drift', async () => {
    const drifting = topic(3);
    const stable = topic(4);
    mocks.shouldDriftTopicVector.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const driftedAssignment = await updateIdentityTopic({
      bestTopic: drifting,
      bestTopicSim: 0.6,
      semanticVector: [0.8, 0.2],
      semanticUnit: { id: 11 },
      assignmentContext: 'incremental',
      now: 'first',
      topicsCache: []
    });
    const stableAssignment = await updateIdentityTopic({
      bestTopic: stable,
      bestTopicSim: 0.95,
      semanticVector: [0.8, 0.2],
      assignmentContext: 'recent-repair',
      now: 'second',
      topicsCache: []
    });

    expect(drifting.update).toHaveBeenCalledWith({ topicVector: [0.99, 0.01], lastActivityAt: 'first' });
    expect(stable.update).toHaveBeenCalledWith({ lastActivityAt: 'second' });
    expect(driftedAssignment).toMatchObject({ topicId: 3, confidence: 0.6, primaryInd: true });
    expect(stableAssignment).toMatchObject({ topicId: 4, confidence: 0.95, primaryInd: true });
  });

  it('refreshes a key-matched topic and returns a primary assignment', async () => {
    const matchedTopic = topic(5);

    const result = await updateTopicByKey({ topic: matchedTopic, now: 'now', topicsCache: [] });

    expect(matchedTopic.update).toHaveBeenCalledWith({ lastActivityAt: 'now' });
    expect(result).toEqual({ topicId: 5, confidence: 1, rank: 1, primaryInd: true });
  });
});
