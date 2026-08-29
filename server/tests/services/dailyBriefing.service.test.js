import { Op } from 'sequelize';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  eventFindAll: vi.fn(),
  eventTopicFindAll: vi.fn(),
  islandFindAll: vi.fn(),
  islandTopicFindAll: vi.fn(),
  settingFindOne: vi.fn(),
  topicFindAll: vi.fn(),
  literal: vi.fn(sql => ({ sql }))
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: { findAll: mocked.articleFindAll, sequelize: { literal: mocked.literal } },
    Event: { findAll: mocked.eventFindAll },
    EventTopic: { findAll: mocked.eventTopicFindAll },
    Feed: {},
    Island: { findAll: mocked.islandFindAll },
    IslandTopic: { findAll: mocked.islandTopicFindAll },
    Setting: { findOne: mocked.settingFindOne },
    Tag: {},
    Topic: { findAll: mocked.topicFindAll }
  }
}));

import {
  DailyBriefingRequestError,
  buildBriefingArticleWhere,
  getDailyBriefing,
  resolveDailyBriefingFilters
} from '../../services/dailyBriefing/dailyBriefing.service.js';

describe('dailyBriefing.service', () => {
  // Restores neutral database responses before each briefing scenario.
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.settingFindOne.mockResolvedValue(null);
    mocked.articleFindAll.mockResolvedValue([]);
    mocked.eventFindAll.mockResolvedValue([]);
    mocked.eventTopicFindAll.mockResolvedValue([]);
    mocked.islandFindAll.mockResolvedValue([]);
    mocked.islandTopicFindAll.mockResolvedValue([]);
    mocked.topicFindAll.mockResolvedValue([]);
  });

  // Normalizes defaults and supported aliases against one stable generation time.
  it.each([
    [undefined, undefined, '7d', 'all'],
    ['TODAY', 'UNREAD', 'today', 'unread'],
    ['24H', 'all', '24h', 'all']
  ])('normalizes period %s and status %s', (period, status, expectedPeriod, expectedStatus) => {
    const generatedAt = new Date('2026-07-31T12:00:00Z');
    const result = resolveDailyBriefingFilters({ period, status, generatedAt });

    expect(result.period).toBe(expectedPeriod);
    expect(result.status).toBe(expectedStatus);
    expect(result.generatedAt).not.toBe(generatedAt);
    expect(result.dateFrom).toBeInstanceOf(Date);
    expect(result.dateTo).toBeInstanceOf(Date);
  });

  // Rejects unsupported request vocabulary with the public request error type.
  it.each([
    [{ period: 'month' }, 'period must be one of'],
    [{ status: 'read' }, 'status must be one of']
  ])('rejects invalid briefing filters %#', (filters, message) => {
    expect(() => resolveDailyBriefingFilters(filters))
      .toThrow(expect.objectContaining({ constructor: DailyBriefingRequestError, message: expect.stringContaining(message) }));
  });

  // Builds a user-owned canonical scope with stored score thresholds and unread state.
  it('builds the configured briefing article predicate', async () => {
    mocked.settingFindOne.mockResolvedValue({
      minAdvertisementScore: 40,
      minSentimentScore: 50,
      minQualityScore: 60
    });
    const dateFrom = new Date('2026-07-24T00:00:00Z');
    const dateTo = new Date('2026-07-31T23:59:59Z');

    const where = await buildBriefingArticleWhere({
      userId: 7,
      status: 'unread',
      dateFrom,
      dateTo,
      minDistinctSources: 3,
      showOnlyInterestMatchedArticles: true,
      showOnlyDevelopingEventArticles: false
    });

    expect(where).toMatchObject({
      userId: 7,
      duplicateOfArticleId: { [Op.is]: null },
      filteredInd: false,
      publishedAt: { [Op.between]: [dateFrom, dateTo] },
      status: 'unread'
    });
    expect(where[Op.and][0][Op.and]).toHaveLength(3);
    expect(where[Op.and][0][Op.and][0][Op.or][0]).toEqual({
      advertisementScore: { [Op.gte]: 40 }
    });
    expect(where[Op.and][0][Op.and][2][Op.or][0]).toEqual({
      qualityScore: { [Op.gte]: 60 }
    });
    expect(where[Op.and][1].sql).toContain('articles.interestScore <> 0');
    expect(where[Op.and][1].sql).toContain('>= 3');
  });

  // Returns an empty but fully structured briefing when no candidates are eligible.
  it('returns empty briefing context without issuing graph lookups', async () => {
    const result = await getDailyBriefing({
      userId: 9,
      generatedAt: new Date('2026-07-31T12:00:00Z')
    });

    expect(result.context).toEqual({
      articleCount: 0,
      eventCount: 0,
      newEventCount: 0,
      topicCount: 0,
      islandCount: 0,
      sourceCount: 0
    });
    expect(result.morningSummary.items).toEqual([]);
    expect(mocked.eventFindAll).not.toHaveBeenCalled();
    expect(mocked.topicFindAll).not.toHaveBeenCalled();
    expect(mocked.islandFindAll).not.toHaveBeenCalled();
  });

  // Builds deterministic summary items from the owned event, topic, and island graph.
  it('ranks, deduplicates, and enriches morning summary events', async () => {
    const generatedAt = new Date('2026-07-31T12:00:00Z');
    const candidates = [
      { id: 1, eventId: 1, feedId: 10, topicId: 11 },
      { id: 2, eventId: 2, feedId: 10, topicId: 12 },
      { id: 3, eventId: 3, feedId: 20, topicId: null },
      { id: 4, eventId: 4, feedId: 30, topicId: 13 },
      { id: 5, eventId: 5, feedId: null, topicId: 999 },
      { id: 6, eventId: null, feedId: 30, topicId: null }
    ];
    const events = [
      { id: 1, name: '', representativeArticleId: 101, eventStrength: 10, topicId: 11, createdAt: generatedAt },
      { id: 2, name: 'Second event', generatedName: 'Generated second event', representativeArticleId: 102, eventStrength: 10, topicId: 12, createdAt: '2026-07-20T00:00:00Z' },
      { id: 3, name: 'Third event', representativeArticleId: 103, eventStrength: 9, topicId: 13, createdAt: generatedAt },
      { id: 4, name: 'Fourth event', representativeArticleId: 104, eventStrength: 8, topicId: null, createdAt: generatedAt },
      { id: 5, name: 'Duplicate representative', representativeArticleId: 104, eventStrength: 7, topicId: null, createdAt: generatedAt },
      { id: 6, name: 'Missing representative', representativeArticleId: 999, eventStrength: 100, topicId: null, createdAt: generatedAt }
    ];
    const representatives = [
      { id: 101, title: 'First title', contentText: 'First title. This is a substantial first briefing sentence with useful detail for readers.', publishedAt: '2026-07-31T08:00:00Z' },
      { id: 102, title: 'Second title', contentText: 'This is a substantial second briefing sentence with useful detail for readers.', publishedAt: '2026-07-31T09:00:00Z' },
      { id: 103, title: 'Third title', contentText: 'This is a substantial third briefing sentence with useful detail for readers.', publishedAt: null },
      { id: 104, title: 'Fourth title', contentText: 'This is a substantial fourth briefing sentence with useful detail for readers.', publishedAt: null }
    ];
    mocked.articleFindAll
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce(representatives);
    mocked.eventFindAll.mockResolvedValue(events);
    mocked.eventTopicFindAll.mockResolvedValue([
      { eventId: 1, topicId: 12 },
      { eventId: 1, topicId: 12 },
      { eventId: 1, topicId: 13 },
      { eventId: 2, topicId: 999 }
    ]);
    mocked.topicFindAll.mockResolvedValue([{ id: 11 }, { id: 12 }, { id: 13 }]);
    mocked.islandTopicFindAll.mockResolvedValue([
      { topicId: 11, islandId: 1, confidence: 0.8, similarity: 0.9 },
      { topicId: 12, islandId: 2, confidence: 0.9, similarity: 0.1 },
      { topicId: 13, islandId: 3, confidence: 0.9, similarity: 0.8 },
      { topicId: 13, islandId: 404, confidence: 1, similarity: 1 }
    ]);
    mocked.islandFindAll.mockResolvedValue([
      { id: 1, label: 'One', weight: 10 },
      { id: 2, label: 'Two', generatedLabel: 'Generated Two', weight: 20 },
      { id: 3, label: 'Three', weight: 5 }
    ]);

    const result = await getDailyBriefing({
      userId: 9,
      period: '7d',
      status: 'all',
      minDistinctSources: 0,
      generatedAt
    });

    expect(result.context).toEqual({
      articleCount: 6,
      eventCount: 6,
      newEventCount: 5,
      topicCount: 3,
      islandCount: 3,
      sourceCount: 3
    });
    expect(result.filters.minDistinctSources).toBe(1);
    expect(result.morningSummary.items).toHaveLength(4);
    expect(result.morningSummary.items.map(item => item.eventId)).toEqual([2, 1, 3, 4]);
    expect(result.morningSummary.items[0]).toMatchObject({
      headline: 'Generated second event',
      island: {
        id: 2,
        name: 'Two',
        label: 'Two',
        generatedLabel: 'Generated Two'
      }
    });
    expect(result.morningSummary.items[1]).toMatchObject({
      headline: 'First title',
      island: { id: 3, name: 'Three', label: 'Three', generatedLabel: null }
    });
  });

  // Promotes trusted representative sources in the summary only when the Briefing preference is active.
  it('applies high-trust recommendation ranking to morning summary events', async () => {
    const generatedAt = new Date('2026-07-31T12:00:00Z');
    mocked.articleFindAll
      .mockResolvedValueOnce([
        { id: 1, eventId: 1, feedId: 10, topicId: null },
        { id: 2, eventId: 2, feedId: 20, topicId: null }
      ])
      .mockResolvedValueOnce([
        {
          id: 101,
          title: 'Strong low-trust event',
          contentText: 'This low-trust event has enough useful detail for the morning summary.',
          publishedAt: generatedAt,
          freshness: 0.5,
          interestScore: 0,
          quality: 0.7,
          Feed: { feedTrust: 0.1 },
          Tags: []
        },
        {
          id: 102,
          title: 'Trusted event',
          contentText: 'This trusted event has enough useful detail for the morning summary.',
          publishedAt: generatedAt,
          freshness: 0.5,
          interestScore: 0,
          quality: 0.7,
          Feed: { feedTrust: 0.9 },
          Tags: []
        }
      ]);
    mocked.eventFindAll.mockResolvedValue([
      {
        id: 1,
        representativeArticleId: 101,
        eventStrength: 20,
        articleCount: 1,
        sourceCount: 1,
        sourceDiversityScore: 0,
        createdAt: generatedAt
      },
      {
        id: 2,
        representativeArticleId: 102,
        eventStrength: 1,
        articleCount: 1,
        sourceCount: 1,
        sourceDiversityScore: 0,
        createdAt: generatedAt
      }
    ]);

    const result = await getDailyBriefing({
      userId: 9,
      generatedAt,
      prioritizeHighTrust: true
    });

    expect(result.filters.prioritizeHighTrust).toBe(true);
    expect(result.morningSummary.items.map(item => item.eventId)).toEqual([2, 1]);
  });

  // Preserves the canonical article-quality components when summary events use Recommended ordering.
  it('uses canonical article quality when recommendation-ranking morning summary events', async () => {
    const generatedAt = new Date('2026-07-31T12:00:00Z');
    mocked.articleFindAll
      .mockResolvedValueOnce([
        { id: 1, eventId: 1, feedId: 10, topicId: null },
        { id: 2, eventId: 2, feedId: 20, topicId: null }
      ])
      .mockResolvedValueOnce([
        {
          id: 101,
          title: 'Low-quality strong event',
          contentText: 'This lower-quality event has enough useful detail for the morning summary.',
          publishedAt: generatedAt,
          freshness: 0.5,
          interestScore: 0,
          qualityScore: 0,
          sentimentScore: 0,
          advertisementScore: 0,
          Feed: { feedTrust: 0.5 },
          Tags: []
        },
        {
          id: 102,
          title: 'High-quality event',
          contentText: 'This higher-quality event has enough useful detail for the morning summary.',
          publishedAt: generatedAt,
          freshness: 0.5,
          interestScore: 0,
          qualityScore: 100,
          sentimentScore: 100,
          advertisementScore: 100,
          Feed: { feedTrust: 0.5 },
          Tags: []
        }
      ]);
    mocked.eventFindAll.mockResolvedValue([
      {
        id: 1,
        representativeArticleId: 101,
        eventStrength: 20,
        articleCount: 1,
        sourceCount: 1,
        sourceDiversityScore: 0,
        createdAt: generatedAt
      },
      {
        id: 2,
        representativeArticleId: 102,
        eventStrength: 1,
        articleCount: 1,
        sourceCount: 1,
        sourceDiversityScore: 0,
        createdAt: generatedAt
      }
    ]);

    const result = await getDailyBriefing({
      userId: 9,
      generatedAt,
      prioritizeHighTrust: true
    });

    expect(result.morningSummary.items.map(item => item.eventId)).toEqual([2, 1]);
  });

  // Selects the independently configured developing article for morning-summary content.
  it('uses developing event articles in the morning summary when enabled', async () => {
    const generatedAt = new Date('2026-07-31T12:00:00Z');
    mocked.articleFindAll
      .mockResolvedValueOnce([
        { id: 1, eventId: 1, feedId: 10, topicId: null }
      ])
      .mockResolvedValueOnce([
        {
          id: 201,
          title: 'Developing coverage',
          contentText: 'Developing coverage adds substantial new detail for briefing readers.',
          publishedAt: generatedAt,
          Feed: { feedTrust: 0.5 },
          Tags: []
        }
      ]);
    mocked.eventFindAll.mockResolvedValue([{
      id: 1,
      name: '',
      representativeArticleId: 101,
      developingArticleId: 201,
      eventStrength: 10,
      articleCount: 2,
      sourceCount: 1,
      sourceDiversityScore: 0,
      createdAt: generatedAt
    }]);

    const result = await getDailyBriefing({
      userId: 9,
      generatedAt,
      includeDevelopingEvents: true
    });

    expect(mocked.articleFindAll.mock.calls[1][0].where.id[Op.in]).toEqual([201]);
    expect(result.filters.includeDevelopingEvents).toBe(true);
    expect(result.morningSummary.items[0]).toMatchObject({
      representativeArticleId: 201,
      headline: 'Developing coverage'
    });
  });

  // Rejects unauthenticated service access before querying user-owned data.
  it('requires a user id', async () => {
    await expect(getDailyBriefing({ userId: null })).rejects.toThrow('userId is required');
    expect(mocked.settingFindOne).not.toHaveBeenCalled();
  });
});
