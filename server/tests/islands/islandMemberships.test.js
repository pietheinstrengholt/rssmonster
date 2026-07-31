import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  bulkCreate: vi.fn(),
  destroy: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    IslandTopic: {
      findAll: mocks.findAll,
      bulkCreate: mocks.bulkCreate,
      destroy: mocks.destroy
    }
  }
}));

import { evolveIslandTopicMemberships } from '../../services/islands/islandMemberships.js';

describe('island topic membership evolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blends matches, adds new topics, decays survivors, and removes weak memberships', async () => {
    mocks.findAll.mockResolvedValue([
      { topicId: 1, similarity: 0.4, confidence: 0.4 },
      { topicId: 2, similarity: 0.5, confidence: 0.1 },
      { topicId: 3, similarity: 0.5, confidence: 0.01 }
    ]);

    const result = await evolveIslandTopicMemberships(8, [
      { topicId: 1, similarity: 1, confidence: 0.8 },
      { topicId: 4, similarity: 2, confidence: -1 },
      { topicId: 'invalid', similarity: 1, confidence: 1 }
    ], 'tx');

    expect(mocks.bulkCreate).toHaveBeenCalledWith([
      { islandId: 8, topicId: 1, similarity: 0.79, confidence: 0.66 },
      { islandId: 8, topicId: 4, similarity: 1, confidence: 0 },
      { islandId: 8, topicId: 2, similarity: 0.41, confidence: 0.082 }
    ], expect.objectContaining({ updateOnDuplicate: ['similarity', 'confidence'], transaction: 'tx' }));
    expect(mocks.destroy).toHaveBeenCalledWith(expect.objectContaining({ transaction: 'tx' }));
    expect(result).toEqual({ islandId: 8, totalMembershipCount: 3, newMembershipCount: 1, removedMembershipCount: 1 });
  });

  it('does not write when no valid current or existing memberships remain', async () => {
    mocks.findAll.mockResolvedValue([]);

    const result = await evolveIslandTopicMemberships(5, [{ topicId: 'nope' }], 'tx');

    expect(mocks.bulkCreate).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(result.totalMembershipCount).toBe(0);
  });
});
