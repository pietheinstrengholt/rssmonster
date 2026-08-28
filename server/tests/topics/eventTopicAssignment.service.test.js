import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  topicFindAll: vi.fn(),
  eventTopicDestroy: vi.fn(),
  eventTopicBulkCreate: vi.fn(),
  assignSemanticUnitToTopic: vi.fn(),
  syncEventTopicsToArticles: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Topic: { findAll: mocks.topicFindAll },
    EventTopic: {
      destroy: mocks.eventTopicDestroy,
      bulkCreate: mocks.eventTopicBulkCreate
    }
  }
}));

vi.mock('../../services/topics/event/assignEventToTopic.js', () => ({
  assignSemanticUnitToTopic: mocks.assignSemanticUnitToTopic
}));

vi.mock('../../services/events/eventArticleTopicSync.js', () => ({
  syncEventTopicsToArticles: mocks.syncEventTopicsToArticles
}));

import {
  assignTopicsForEvents,
  normalizeTopicAssignments,
  persistEventTopicAssignments,
  primaryTopicId
} from '../../services/topics/event/eventTopicAssignment.js';

// Builds an event double that captures its denormalized primary topic update.
function event(overrides = {}) {
  return {
    id: 1,
    userId: 4,
    name: 'OpenAI model release',
    eventVector: [1, 0],
    update: vi.fn(),
    ...overrides
  };
}

describe('event topic assignment persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.topicFindAll.mockResolvedValue([]);
    mocks.eventTopicDestroy.mockResolvedValue(0);
    mocks.eventTopicBulkCreate.mockResolvedValue([]);
    mocks.syncEventTopicsToArticles.mockResolvedValue(undefined);
  });

  it('normalizes duplicates, invalid values, thresholds, and explicit primaries', () => {
    const normalized = normalizeTopicAssignments([
      { topicId: 'bad', confidence: 1 },
      { topicId: -1, confidence: 1 },
      { topicId: 1, confidence: Number.NaN },
      { topicId: 1, confidence: 0.63 },
      { topicId: 1, confidence: 0.8, primaryInd: true },
      { topicId: 2, confidence: 0.7 },
      { topicId: 3, confidence: 0.2 }
    ]);

    expect(normalized).toEqual([
      { topicId: 1, confidence: 0.8, rank: 1, primaryInd: true },
      { topicId: 2, confidence: 0.7, rank: 2, primaryInd: false }
    ]);
    expect(primaryTopicId(normalized)).toBe(1);
    expect(primaryTopicId([])).toBeNull();
  });

  it('keeps the best below-threshold assignment without marking it primary', () => {
    expect(normalizeTopicAssignments([
      { topicId: 2, confidence: 0.4, primaryInd: true },
      { topicId: 3, confidence: 0.3 }
    ])).toEqual([{ topicId: 2, confidence: 0.4, rank: 1, primaryInd: false }]);
  });

  it('replaces persisted relationships and updates the primary topic id', async () => {
    const target = event();

    const result = await persistEventTopicAssignments(target, [
      { topicId: 5, confidence: 0.82, primaryInd: true }
    ]);

    expect(mocks.eventTopicBulkCreate).toHaveBeenCalledWith([expect.objectContaining({
      eventId: 1,
      topicId: 5,
      primaryInd: true
    })]);
    expect(target.update).toHaveBeenCalledWith({ topicId: 5 });
    expect(result[0].topicId).toBe(5);
  });

  it('returns empty stats without loading topics when there are no events', async () => {
    await expect(assignTopicsForEvents(4, [])).resolves.toEqual({
      eventCount: 0,
      touchedTopicIds: [],
      createdTopicIds: [],
      stats: { eventsSkipped: 0, eventsMatched: 0, eventsUnmatched: 0, newTopicsCreated: 0 }
    });
    expect(mocks.topicFindAll).not.toHaveBeenCalled();
  });

  it('clears vectorless events and reports matched and unmatched assignments', async () => {
    const skipped = event({ id: 1, eventVector: null });
    const matched = event({ id: 2 });
    const unmatched = event({ id: 3, name: null });
    mocks.assignSemanticUnitToTopic
      .mockResolvedValueOnce([{ topicId: 7, confidence: 0.8, primaryInd: true }])
      .mockResolvedValueOnce([]);

    const result = await assignTopicsForEvents(4, [skipped, matched, unmatched]);

    expect(skipped.update).toHaveBeenCalledWith({ topicId: null });
    expect(mocks.syncEventTopicsToArticles).toHaveBeenCalledWith(1, []);
    expect(mocks.assignSemanticUnitToTopic).toHaveBeenNthCalledWith(2, expect.objectContaining({
      semanticUnit: expect.objectContaining({ title: 'Event 3' })
    }));
    expect(result).toEqual({
      eventCount: 3,
      touchedTopicIds: [7],
      createdTopicIds: [],
      stats: { eventsSkipped: 1, eventsMatched: 1, eventsUnmatched: 1, newTopicsCreated: 0 }
    });
  });

  it('reports only topics added to the cache during the assignment run as created', async () => {
    const existingTopic = { id: 7 };
    mocks.topicFindAll.mockResolvedValue([existingTopic]);
    mocks.assignSemanticUnitToTopic.mockImplementation(async ({ topicsCache }) => {
      topicsCache.push({ id: 8 });
      return [{ topicId: 8, confidence: 0.9, primaryInd: true }];
    });

    const result = await assignTopicsForEvents(4, [event()]);

    expect(result.createdTopicIds).toEqual([8]);
    expect(result.touchedTopicIds).toEqual([8]);
    expect(result.stats.newTopicsCreated).toBe(1);
  });
});
