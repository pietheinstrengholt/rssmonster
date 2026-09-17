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
  articleCandidateCache: {
    removeExpired: vi.fn(),
    update: vi.fn()
  },
  assignArticleToEvent: vi.fn(),
  canonicalArticleWhere: vi.fn(),
  computeEventStrength: vi.fn(),
  embedArticle: vi.fn(),
  eventCacheForArticle: vi.fn(),
  eventCacheForUser: vi.fn(),
  logEventProcessingSummary: vi.fn(),
  reconcileTouchedEvents: vi.fn(),
  recordProcessingFailure: vi.fn(),
  enqueueSemanticLabels: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: mocked.Article,
    Event: mocked.Event,
    Feed: mocked.Feed,
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

    mocked.assignArticleToEvent.mockReset();

    mocked.computeEventStrength.mockReset();
    mocked.embedArticle.mockReset();
    mocked.eventCacheForArticle.mockReset();
    mocked.eventCacheForUser.mockReset();

    mocked.reconcileTouchedEvents.mockReset();
    mocked.recordProcessingFailure.mockReset().mockResolvedValue(undefined);
    mocked.enqueueSemanticLabels.mockReset().mockResolvedValue(undefined);

    mocked.Article.update.mockResolvedValue([0]);
    mocked.canonicalArticleWhere.mockReturnValue({ duplicateOfArticleId: null });
    mocked.eventCacheForUser.mockResolvedValue({ type: 'user-cache' });
    mocked.eventCacheForArticle.mockResolvedValue({ type: 'article-cache' });

    mocked.logEventProcessingSummary.mockResolvedValue(undefined);

  });

  it('handles reused, disabled, missing, and generated embeddings before reconciling Events', async () => {
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
      embedding_model: 'test-model', articleVector: null,
      eventId: null,
      Feed: { generateEmbeddings: false },
      publishedAt: new Date('2026-07-20T10:01:00.000Z')
    };
    const missingVectorArticle = {
      id: 3,
      userId: 7,
      embedding_model: 'test-model', articleVector: null,
      eventId: null,
      Feed: { generateEmbeddings: true },
      publishedAt: new Date('2026-07-20T10:02:00.000Z')
    };
    const generatedArticle = {
      id: 4,
      userId: 7,
      embedding_model: 'test-model', articleVector: null,
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
      .mockResolvedValueOnce({ embedding_model: 'test-model', eventVector: null })
      .mockResolvedValueOnce({ eventVector: [0, 1], embedding_model: 'generated-model' });
    // This assignment stub records both result counters used by the public summary.
    mocked.assignArticleToEvent.mockImplementation(async (article, cache, vectors, context) => {
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

    const result = await runIncrementalEventsForUser(7);

    expect(mocked.embedArticle).toHaveBeenCalledTimes(2);
    expect(mocked.embedArticle).toHaveBeenNthCalledWith(1, missingVectorArticle, { persist: true });
    expect(mocked.assignArticleToEvent).toHaveBeenCalledTimes(2);
    expect(mocked.reconcileTouchedEvents).toHaveBeenCalledWith(7, [10, 20]);

    expect(mocked.articleCandidateCache.update).toHaveBeenCalledTimes(2);
    expect(mocked.articleCandidateCache.removeExpired).toHaveBeenCalledOnce();
    expect(mocked.enqueueSemanticLabels).toHaveBeenCalledWith(7, {
      eventIds: [20]
    });
    expect(result).toMatchObject({
      articleCount: 4,
      touchedEventIds: [10, 20],
      createdEventIds: [20],
      newEventsCreatedCount: 1,
      linkedToExistingEventCount: 1,
      unassignedCount: 2
    });
  });

  it('returns the Event summary when every candidate lacks an event vector', async () => {
    const article = {
      id: 8,
      userId: 9,
      embedding_model: 'test-model', articleVector: null,
      eventId: null,
      Feed: { generateEmbeddings: false }
    };
    mocked.Article.findAll.mockResolvedValueOnce([article]);

    const result = await runIncrementalEventsForUser(9, {  });

    expect(mocked.assignArticleToEvent).not.toHaveBeenCalled();
    expect(mocked.reconcileTouchedEvents).not.toHaveBeenCalled();
    expect(mocked.logEventProcessingSummary).toHaveBeenCalledOnce();
    expect(mocked.enqueueSemanticLabels).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      articleCount: 1,
      touchedEventIds: [],
      unassignedCount: 1
    });
  });

  it('clears foreign references and prunes an empty owned event during recent repair', async () => {
    const article = {
      id: 31,
      userId: 12,
      embedding_model: 'test-model', articleVector: [1, 0],
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

    mocked.Event.destroy.mockResolvedValue(1);
    mocked.assignArticleToEvent.mockImplementation(async (assignedArticle, cache, vectors, context) => {
      context.newEventIds ??= new Set();
      context.newEventIds.add(60);
      return 60;
    });
    mocked.reconcileTouchedEvents.mockResolvedValue({ articlesByEventId: { 60: [article] } });

    const result = await repairRecentEventsForUser(12, {  });

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
      createdEventIds: [60]
    });
    expect(mocked.enqueueSemanticLabels).toHaveBeenCalledWith(12, {
      eventIds: [60]
    });
  });

  it('aggregates historical batches and preserves Event accounting', async () => {
    const firstArticle = {
      id: 101,
      userId: 21,
      embedding_model: 'test-model', articleVector: [1, 0],
      eventId: null,
      publishedAt: new Date('2025-01-01T10:00:00.000Z')
    };
    const secondArticle = {
      id: 102,
      userId: 21,
      embedding_model: 'test-model', articleVector: [0, 1],
      eventId: null,
      publishedAt: new Date('2025-01-02T10:00:00.000Z')
    };
    mocked.Article.findAll
      .mockResolvedValueOnce([firstArticle])
      .mockResolvedValueOnce([secondArticle])
      .mockResolvedValueOnce([]);
    mocked.assignArticleToEvent.mockImplementation(async (assignedArticle, cache, vectors, context) => {
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
    const result = await backfillHistoricalEventsForUser(21, { batchSize: 1 });

    expect(mocked.eventCacheForArticle).toHaveBeenCalledTimes(2);
    expect(mocked.eventCacheForUser).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      articleCount: 2,
      touchedEventIds: [201, 202],
      createdEventIds: [201, 202],

    });
    expect(mocked.enqueueSemanticLabels).toHaveBeenCalledWith(21, {
      eventIds: [201, 202]
    });
  });
});

vi.mock('../../services/articles/articleRecords.js', async () => {
  const { default: models } = await import('../../models/index.js');
  return { articleRecords: models.Article };
});
