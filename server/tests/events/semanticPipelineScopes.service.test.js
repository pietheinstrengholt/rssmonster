import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Op } from 'sequelize';

const mocked = vi.hoisted(() => ({
  Article: {
    destroy: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn()
  },
  Event: {
    destroy: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn()
  },
  Feed: {},
  Topic: {
    findAll: vi.fn()
  },
  ArticleTopic: {
    destroy: vi.fn(),
    findAll: vi.fn()
  },
  EventTopic: {
    destroy: vi.fn(),
    findAll: vi.fn()
  },
  articleCandidateCache: {
    removeExpired: vi.fn(),
    update: vi.fn()
  },
  assignArticleToEvent: vi.fn(),
  assignTopicsForEvents: vi.fn(),
  canonicalArticleWhere: vi.fn(),
  computeEventStrength: vi.fn(),
  embedArticle: vi.fn(),
  eventCacheForArticle: vi.fn(),
  eventCacheForUser: vi.fn(),
  logEventProcessingSummary: vi.fn(),
  recomputeTopicStatsForUser: vi.fn(),
  reconcileTouchedEvents: vi.fn(),
  recordProcessingFailure: vi.fn(),
  enqueueSemanticLabels: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: mocked.Article,
    Event: mocked.Event,
    Feed: mocked.Feed,
    Topic: mocked.Topic,
    ArticleTopic: mocked.ArticleTopic,
    EventTopic: mocked.EventTopic,
    Sequelize: {
      literal: vi.fn(value => value)
    },
    sequelize: {
      escape: vi.fn(value => `'${value}'`),
      fn: vi.fn((name, value) => [name, value])
    }
  }
}));

vi.mock('../../services/events/ArticleEventCandidateCache.js', () => ({
  default: {
    forUser: vi.fn(() => mocked.articleCandidateCache)
  }
}));

vi.mock('../../services/events/assignArticleToEvent.js', () => ({
  assignArticleToEvent: mocked.assignArticleToEvent,
  EventCache: {
    forArticle: mocked.eventCacheForArticle,
    forUser: mocked.eventCacheForUser
  }
}));

vi.mock('../../services/articles/embedArticle.js', () => ({
  default: mocked.embedArticle
}));

vi.mock('../../services/duplicates/articleDuplicates.js', () => ({
  canonicalArticleWhere: mocked.canonicalArticleWhere
}));

vi.mock('../../services/events/eventPipelineDebug.js', () => ({
  logEventProcessingSummary: mocked.logEventProcessingSummary
}));

vi.mock('../../services/events/eventReconciliation.js', () => ({
  computeEventStrength: mocked.computeEventStrength,
  reconcileTouchedEvents: mocked.reconcileTouchedEvents
}));

vi.mock('../../services/topics/event/eventTopicAssignment.js', () => ({
  assignTopicsForEvents: mocked.assignTopicsForEvents,
  EVENT_TOPIC_TYPES: ['event', 'hybrid']
}));

vi.mock('../../services/topics/shared/topicStats.service.js', () => ({
  recomputeTopicStatsForUser: mocked.recomputeTopicStatsForUser
}));

vi.mock('../../services/observability/processingFailures.js', () => ({
  recordProcessingFailure: mocked.recordProcessingFailure
}));

vi.mock('../../services/semanticLabels/semanticLabelJobs.js', () => ({
  tryEnqueueGeneratedSemanticLabelJobsForUser: mocked.enqueueSemanticLabels
}));

import {
  backfillHistoricalEventsForUser,
  repairRecentEventsForUser,
  runIncrementalEventsForUser
} from '../../services/reconcile/semanticPipelineScopes.js';

// This suite isolates orchestration branches from the database-heavy semantic regression tests.
describe('semantic pipeline scopes orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.Article.findAll.mockReset();
    mocked.Article.update.mockReset();
    mocked.Event.destroy.mockReset();
    mocked.Event.findAll.mockReset();
    mocked.Topic.findAll.mockReset();
    mocked.ArticleTopic.destroy.mockReset();
    mocked.ArticleTopic.findAll.mockReset();
    mocked.EventTopic.destroy.mockReset();
    mocked.EventTopic.findAll.mockReset();
    mocked.assignArticleToEvent.mockReset();
    mocked.assignTopicsForEvents.mockReset();
    mocked.computeEventStrength.mockReset();
    mocked.embedArticle.mockReset();
    mocked.eventCacheForArticle.mockReset();
    mocked.eventCacheForUser.mockReset();
    mocked.recomputeTopicStatsForUser.mockReset();
    mocked.reconcileTouchedEvents.mockReset();
    mocked.recordProcessingFailure.mockReset().mockResolvedValue(undefined);
    mocked.enqueueSemanticLabels.mockReset().mockResolvedValue(undefined);

    mocked.Article.update.mockResolvedValue([0]);
    mocked.canonicalArticleWhere.mockReturnValue({ duplicateOfArticleId: null });
    mocked.eventCacheForUser.mockResolvedValue({ type: 'user-cache' });
    mocked.eventCacheForArticle.mockResolvedValue({ type: 'article-cache' });
    mocked.Topic.findAll.mockResolvedValue([]);
    mocked.logEventProcessingSummary.mockResolvedValue(undefined);
    mocked.recomputeTopicStatsForUser.mockResolvedValue(undefined);
  });

  it('handles reused, disabled, missing, and generated embeddings before reconciling topics', async () => {
    const storedArticle = {
      id: 1,
      userId: 7,
      articleVector: [1, 0],
      embedding_model: 'stored-model',
      eventId: null,
      publishedAt: new Date('2026-07-20T10:00:00.000Z')
    };
    const disabledArticle = {
      id: 2,
      userId: 7,
      articleVector: null,
      eventId: null,
      Feed: { generateEmbeddings: false },
      publishedAt: new Date('2026-07-20T10:01:00.000Z')
    };
    const missingVectorArticle = {
      id: 3,
      userId: 7,
      articleVector: null,
      eventId: null,
      Feed: { generateEmbeddings: true },
      publishedAt: new Date('2026-07-20T10:02:00.000Z')
    };
    const generatedArticle = {
      id: 4,
      userId: 7,
      articleVector: null,
      eventId: null,
      Feed: { generateEmbeddings: true },
      publishedAt: new Date('2026-07-20T10:03:00.000Z')
    };
    const firstEvent = { id: 10, articleCount: 9, update: vi.fn() };
    const secondEvent = { id: 20, articleCount: 3, update: vi.fn() };

    mocked.Article.findAll.mockResolvedValueOnce([
      storedArticle,
      disabledArticle,
      missingVectorArticle,
      generatedArticle
    ]);
    mocked.embedArticle
      .mockResolvedValueOnce({ eventVector: null })
      .mockResolvedValueOnce({ eventVector: [0, 1], embedding_model: 'generated-model' });
    // This assignment stub records both result counters used by the public summary.
    mocked.assignArticleToEvent.mockImplementation(async (article, cache, vectors, topics, context) => {
      if (article.id === 1) {
        context.stats.linkedToExistingEventCount++;
        return 10;
      }

      context.stats.newEventsCreatedCount++;
      context.newEventIds ??= new Set();
      context.newEventIds.add(20);
      return 20;
    });
    mocked.reconcileTouchedEvents.mockResolvedValue({
      articlesByEventId: {
        10: [storedArticle]
      }
    });
    mocked.Event.findAll.mockResolvedValue([firstEvent, secondEvent]);
    mocked.assignTopicsForEvents.mockResolvedValue({
      eventCount: 2,
      touchedTopicIds: [400, 100],
      createdTopicIds: [400],
      stats: {
        eventsSkipped: 0,
        eventsMatched: 1,
        eventsUnmatched: 1,
        newTopicsCreated: 1
      }
    });
    mocked.EventTopic.findAll
      .mockResolvedValueOnce([
        { eventId: 10, topicId: 100 }
      ])
      .mockResolvedValueOnce([
        { topicId: 100, eventCount: 2 }
      ])
      .mockResolvedValueOnce([
        { topicId: 100 },
        { topicId: 200 },
        { topicId: null }
      ]);
    mocked.ArticleTopic.findAll.mockResolvedValue([
      { topicId: 300 },
      { topicId: null }
    ]);
    mocked.computeEventStrength
      .mockReturnValueOnce(0.81)
      .mockReturnValueOnce(0.42);

    const result = await runIncrementalEventsForUser(7);

    expect(mocked.embedArticle).toHaveBeenCalledTimes(2);
    expect(mocked.embedArticle).toHaveBeenNthCalledWith(1, missingVectorArticle, { persist: true });
    expect(mocked.assignArticleToEvent).toHaveBeenCalledTimes(2);
    expect(mocked.reconcileTouchedEvents).toHaveBeenCalledWith(7, [10, 20]);
    expect(mocked.assignTopicsForEvents).toHaveBeenCalledWith(7, [firstEvent, secondEvent], {
      assignmentContext: 'incremental'
    });
    expect(mocked.computeEventStrength).toHaveBeenNthCalledWith(1, {
      articleCount: 1,
      topicEventCount: 2
    });
    expect(mocked.computeEventStrength).toHaveBeenNthCalledWith(2, {
      articleCount: 3,
      topicEventCount: 1
    });
    expect(firstEvent.update).toHaveBeenCalledWith({ topicId: 100, eventStrength: 0.81 });
    expect(secondEvent.update).toHaveBeenCalledWith({ topicId: null, eventStrength: 0.42 });
    expect(mocked.recomputeTopicStatsForUser).toHaveBeenCalledWith(7, [100, 200, 300, 400]);
    expect(mocked.articleCandidateCache.update).toHaveBeenCalledTimes(2);
    expect(mocked.articleCandidateCache.removeExpired).toHaveBeenCalledOnce();
    expect(mocked.enqueueSemanticLabels).toHaveBeenCalledWith(7, {
      eventIds: [20],
      topicIds: [400]
    });
    expect(result).toMatchObject({
      articleCount: 4,
      touchedEventIds: [10, 20],
      touchedTopicIds: [100, 200, 300, 400],
      createdEventIds: [20],
      createdTopicIds: [400],
      newEventsCreatedCount: 1,
      linkedToExistingEventCount: 1,
      unassignedCount: 2,
      topicAssignment: { skipped: false, eventCount: 2 }
    });
  });

  it('returns the skipped-topic summary when every candidate lacks an event vector', async () => {
    const article = {
      id: 8,
      userId: 9,
      articleVector: null,
      eventId: null,
      Feed: { generateEmbeddings: false }
    };
    mocked.Article.findAll.mockResolvedValueOnce([article]);

    const result = await runIncrementalEventsForUser(9, { skipTopicAssignment: true });

    expect(mocked.assignArticleToEvent).not.toHaveBeenCalled();
    expect(mocked.reconcileTouchedEvents).not.toHaveBeenCalled();
    expect(mocked.logEventProcessingSummary).toHaveBeenCalledOnce();
    expect(mocked.enqueueSemanticLabels).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      articleCount: 1,
      touchedEventIds: [],
      unassignedCount: 1,
      topicAssignment: { skipped: true }
    });
  });

  it('clears foreign references and prunes an empty owned event during recent repair', async () => {
    const article = {
      id: 31,
      userId: 12,
      articleVector: [1, 0],
      eventId: 50,
      publishedAt: new Date('2026-07-25T10:00:00.000Z')
    };
    mocked.Article.update
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([1]);
    mocked.Article.findAll
      .mockResolvedValueOnce([article])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ eventId: 60 }]);
    mocked.Event.findAll.mockResolvedValueOnce([{ id: 50 }]);
    mocked.ArticleTopic.findAll.mockResolvedValue([{ topicId: 70 }]);
    mocked.EventTopic.findAll.mockResolvedValue([{ topicId: 80 }]);
    mocked.Event.destroy.mockResolvedValue(1);
    mocked.assignArticleToEvent.mockImplementation(async (assignedArticle, cache, vectors, topics, context) => {
      context.newEventIds ??= new Set();
      context.newEventIds.add(60);
      return 60;
    });
    mocked.reconcileTouchedEvents.mockResolvedValue({ articlesByEventId: { 60: [article] } });

    const result = await repairRecentEventsForUser(12, { skipTopicAssignment: true });

    expect(mocked.EventTopic.destroy).toHaveBeenCalledOnce();
    expect(mocked.Article.findAll).toHaveBeenNthCalledWith(2, expect.objectContaining({
      attributes: ['eventId'],
      group: ['eventId'],
      raw: true
    }));
    expect(mocked.Event.destroy).toHaveBeenCalledWith({
      where: { id: { [Op.in]: [50] }, userId: 12 }
    });
    expect(mocked.reconcileTouchedEvents).toHaveBeenCalledWith(12, [60]);
    expect(mocked.Article.findAll).toHaveBeenLastCalledWith(expect.objectContaining({
      attributes: ['eventId'],
      raw: true
    }));
    expect(result).toMatchObject({
      mode: 'recent-repair',
      articleCount: 1,
      touchedEventIds: [60],
      createdEventIds: [60],
      topicAssignment: { skipped: true }
    });
    expect(mocked.enqueueSemanticLabels).toHaveBeenCalledWith(12, {
      eventIds: [60],
      topicIds: []
    });
  });

  it('aggregates historical batches and performs the final topic stats refresh', async () => {
    const firstArticle = {
      id: 101,
      userId: 21,
      articleVector: [1, 0],
      eventId: null,
      publishedAt: new Date('2025-01-01T10:00:00.000Z')
    };
    const secondArticle = {
      id: 102,
      userId: 21,
      articleVector: [0, 1],
      eventId: null,
      publishedAt: new Date('2025-01-02T10:00:00.000Z')
    };
    mocked.Article.findAll
      .mockResolvedValueOnce([firstArticle])
      .mockResolvedValueOnce([secondArticle])
      .mockResolvedValueOnce([]);
    mocked.assignArticleToEvent.mockImplementation(async (assignedArticle, cache, vectors, topics, context) => {
      const eventId = assignedArticle.id === 101 ? 201 : 202;
      context.newEventIds ??= new Set();
      context.newEventIds.add(eventId);
      return eventId;
    });
    mocked.reconcileTouchedEvents
      .mockResolvedValueOnce({ articlesByEventId: { 201: [firstArticle] } })
      .mockResolvedValueOnce({ articlesByEventId: { 202: [secondArticle] } });
    mocked.Event.findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocked.assignTopicsForEvents
      .mockResolvedValueOnce({ eventCount: 0, touchedTopicIds: [301], createdTopicIds: [301], stats: {} })
      .mockResolvedValueOnce({ eventCount: 0, touchedTopicIds: [302, 301], createdTopicIds: [302], stats: {} });
    mocked.EventTopic.findAll.mockResolvedValue([]);
    mocked.ArticleTopic.findAll.mockResolvedValue([]);

    const result = await backfillHistoricalEventsForUser(21, { batchSize: 1 });

    expect(mocked.eventCacheForArticle).toHaveBeenCalledTimes(2);
    expect(mocked.eventCacheForUser).not.toHaveBeenCalled();
    expect(mocked.recomputeTopicStatsForUser).toHaveBeenLastCalledWith(21, [301, 302]);
    expect(result).toMatchObject({
      articleCount: 2,
      touchedEventIds: [201, 202],
      touchedTopicIds: [301, 302],
      createdEventIds: [201, 202],
      createdTopicIds: [301, 302],
      topicAssignment: {
        skipped: false,
        eventCount: 2,
        touchedTopicIds: [301, 302]
      }
    });
    expect(mocked.enqueueSemanticLabels).toHaveBeenCalledWith(21, {
      eventIds: [201, 202],
      topicIds: [301, 302]
    });
  });
});
