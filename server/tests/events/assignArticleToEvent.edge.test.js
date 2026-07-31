import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import assignArticleToEvent, {
  EventCache
} from '../../services/events/assignArticleToEvent.js';

describe('assignArticleToEvent edge behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('caps newly added cached events and patches only matching entries', () => {
    const events = Array.from({ length: 300 }, (_, index) => ({
      id: index + 1,
      dataValues: {}
    }));
    const cache = new EventCache(events);

    cache.add({ id: 301, dataValues: {} });
    cache.updateInMemory(301, { articleCount: 2 });
    cache.updateInMemory(999, { articleCount: 9 });

    expect(cache.events).toHaveLength(300);
    expect(cache.events[0]).toMatchObject({
      id: 301,
      articleCount: 2,
      dataValues: { articleCount: 2 }
    });
    expect(cache.events.map(event => event.id)).not.toContain(300);
  });

  it('rejects nearby candidates without vectors and records a standalone result', async () => {
    vi.spyOn(db.ArticleTopic, 'destroy').mockResolvedValue(0);
    const article = {
      id: 10,
      userId: 4,
      feedId: 2,
      title: 'Acme merger receives approval',
      description: 'Brussels regulators approved the Acme transaction.',
      publishedAt: new Date('2026-07-22T10:00:00.000Z'),
      createdAt: new Date('2026-07-22T10:05:00.000Z'),
      status: 'unread',
      duplicateOfArticleId: null,
      filteredInd: false,
      articleVector: [1, 0, 0],
      topicId: null,
      update: vi.fn().mockResolvedValue(undefined)
    };
    const articleCandidateCache = {
      findNearby: vi.fn().mockReturnValue([{
        id: 9,
        userId: 4,
        feedId: 3,
        title: 'Acme merger receives approval',
        publishedAt: new Date('2026-07-22T09:00:00.000Z'),
        eventId: null
      }]),
      updateEventId: vi.fn()
    };
    const runContext = { records: [], stats: {} };

    const eventId = await assignArticleToEvent(
      article,
      new EventCache([]),
      null,
      [],
      runContext,
      {
        skipTopicAssignment: true,
        articleCandidateCache
      }
    );

    expect(eventId).toBeNull();
    expect(article.update).toHaveBeenCalledWith({
      eventId: null,
      topicId: null
    });
    expect(runContext.stats.topicOnlyInsufficientCandidatesCount).toBe(1);
    expect(runContext.records).toContainEqual(expect.objectContaining({
      id: article.id,
      eventId: null,
      eventVector: article.articleVector
    }));
    expect(articleCandidateCache.updateEventId).toHaveBeenCalledWith([article.id], null);
  });
});
