import { Op } from 'sequelize';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleCount: vi.fn(),
  articleFindAll: vi.fn(),
  getDialect: vi.fn(),
  literal: vi.fn(sql => ({ sql })),
  sequelizeWhere: vi.fn((left, right) => ({ left, right }))
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: {
      count: mocked.articleCount,
      findAll: mocked.articleFindAll,
      sequelize: {
        getDialect: mocked.getDialect,
        literal: mocked.literal,
        where: mocked.sequelizeWhere
      }
    },
    Event: { name: 'Event' },
    Feed: { name: 'Feed' },
    Tag: { name: 'Tag' }
  }
}));

import {
  buildArticleSearchQuery,
  executeSearch,
  executeSearchBoundedCount,
  executeSearchCount,
  executeSearchSourceCount
} from '../../services/articleSearch/articleSearchExecutor.service.js';

// Builds a neutral search descriptor so each test highlights one retrieval concern.
const buildQuery = overrides => buildArticleSearchQuery({
  baseWhere: { feedId: [4] },
  smartFolderSearch: false,
  sortRecommended: false,
  sortTopStories: false,
  sortQuality: false,
  sortAttention: false,
  prioritizeHighTrust: false,
  workingSort: 'desc',
  qualityFilter: null,
  freshnessFilter: null,
  starFilter: null,
  unreadFilter: null,
  readFilter: null,
  clickedFilter: null,
  seenFilter: null,
  hotFilter: null,
  status: '%',
  hasSearchIntent: false,
  event: null,
  islandFilter: null,
  developingFilter: null,
  briefingFilter: null,
  grouping: 'none',
  eventCountFilter: null,
  firstSeenAgeFilter: null,
  authorFilter: null,
  languageFilter: null,
  ...overrides
});

describe('articleSearchExecutor.service', () => {
  // Resets database and SQL-expression observations between query scenarios.
  beforeEach(() => {
    mocked.articleCount.mockReset();
    mocked.articleFindAll.mockReset();
    mocked.getDialect.mockReset().mockReturnValue('mysql');
    mocked.literal.mockClear();
    mocked.sequelizeWhere.mockClear();
  });

  // Loads attention inputs only when runtime attention ordering needs them.
  it('selects attention attributes without database ordering', () => {
    const query = buildQuery({ sortAttention: true });

    expect(query.attributes).toEqual(expect.arrayContaining(['attentionBucket', 'clickedAmount']));
    expect(query).not.toHaveProperty('order');
  });

  it('loads shared event and Quality inputs for Top Stories without Interest Islands or rule tags', () => {
    const query = buildQuery({ sortTopStories: true });

    expect(query.attributes).toEqual(expect.arrayContaining([
      'publishedAt',
      'qualityScore',
      'sentimentScore',
      'advertisementScore'
    ]));
    expect(query.attributes).not.toContain('interestScore');
    expect(query.include).toEqual(expect.arrayContaining([
      expect.objectContaining({ as: 'event' }),
      expect.objectContaining({ model: expect.objectContaining({ name: 'Feed' }) })
    ]));
    expect(query.include).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ model: expect.objectContaining({ name: 'Tag' }) })
    ]));
    expect(query).not.toHaveProperty('order');
  });

  it('selects quality action provenance for runtime quality filters', () => {
    const query = buildQuery({ qualityFilter: { operator: '>=', value: 0.8 } });

    expect(query.attributes).toEqual(expect.arrayContaining([
      'qualityScore',
      'qualityScoreActionOverrideInd'
    ]));
  });

  it('counts a limited search from only the bounded matching IDs', async () => {
    mocked.articleFindAll.mockResolvedValue([{ id: 2 }, { id: 4 }]);

    await expect(executeSearchBoundedCount({ where: { userId: 7 }, limit: 2 }))
      .resolves.toBe(2);
    expect(mocked.articleFindAll).toHaveBeenCalledWith({
      where: { userId: 7 },
      attributes: ['id'],
      limit: 2,
      raw: true
    });
    expect(mocked.articleCount).not.toHaveBeenCalled();
  });

  // Loads freshness and feed trust when Unread chronological ordering needs the runtime boost.
  it('selects high-trust inputs for chronological sorting', () => {
    const query = buildQuery({ prioritizeHighTrust: true, workingSort: 'desc' });

    expect(query.attributes).toContain('publishedAt');
    expect(query.include).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: expect.objectContaining({ name: 'Feed' }) })
    ]));
  });

  // Applies age, author, and language predicates without dropping the base feed scope.
  it.each([
    ['mysql', 'h', 'NOW() - INTERVAL 6 HOUR'],
    ['mysql', 'd', 'NOW() - INTERVAL 6 DAY'],
    ['sqlite', 'h', "datetime('now', '-6 hours')"],
    ['sqlite', 'd', "datetime('now', '-6 days')"]
  ])('applies %s first-seen age in %s units', (dialect, unit, expectedLiteral) => {
    mocked.getDialect.mockReturnValue(dialect);
    const query = buildQuery({
      firstSeenAgeFilter: { value: 6, unit },
      authorFilter: 'Ada',
      languageFilter: 'eng'
    });

    expect(query.where.feedId).toEqual([4]);
    expect(query.where.author).toEqual({ [Op.like]: '%Ada%' });
    expect(query.where.language).toBe('eng');
    expect(mocked.literal).toHaveBeenCalledWith(expectedLiteral);
    expect(query.where[Op.and][0][Op.or]).toHaveLength(2);
  });

  // Keeps category- or feed-derived source scope when an explicit Hot filter is applied.
  it('applies an explicit hot filter within the selected source scope', () => {
    const query = buildQuery({ hotFilter: true });

    expect(query.where.feedId).toEqual([4]);
    expect(query.where.hotInd).toBe(1);
  });

  // Maps status vocabulary to the corresponding article state predicate.
  it.each([
    ['hot', 'hotInd', 1],
    ['clicked', 'clickedAmount', { [Op.gt]: 0 }],
    ['favorite', 'favoriteInd', 1],
    ['unread', 'status', 'unread']
  ])('maps %s status to %s', (status, field, expected) => {
    const query = buildQuery({ status });

    expect(query.where[field]).toEqual(expected);
    expect(query.where.feedId).toEqual([4]);
  });

  // Distinguishes articles attached to an event from standalone articles.
  it.each([
    [true, Op.not],
    [false, Op.is]
  ])('applies event=%s filtering', (event, operator) => {
    const query = buildQuery({ event });

    expect(query.where.eventId).toEqual({ [operator]: null });
  });

  // Applies an event-size threshold through a correlated event count expression.
  it('applies a finite event count threshold', () => {
    const query = buildQuery({ eventCountFilter: 4 });

    expect(mocked.sequelizeWhere).toHaveBeenCalledWith(
      expect.objectContaining({ sql: expect.stringContaining('e.articleCount') }),
      { [Op.gte]: 4 }
    );
    expect(query.where[Op.and]).toContain(mocked.sequelizeWhere.mock.results[0].value);
  });

  // Chooses developing event representatives when that view is enabled.
  it('groups events by their developing representative', () => {
    const query = buildQuery({ grouping: 'event', includeDevelopingEvents: true });

    expect(query.where[Op.and][0][Op.or][1].sql)
      .toContain('COALESCE(grouped_event.developingArticleId, grouped_event.representativeArticleId)');
  });

  // Matches the exact unread, non-representative event pointer used by isDevelopingStory.
  it('applies the developing story predicate', () => {
    const query = buildQuery({ developingFilter: true });
    const predicate = query.where[Op.and][0].sql;

    expect(predicate).toContain("articles.status = 'unread'");
    expect(predicate).toContain('developing_story_event.developingArticleId = articles.id');
    expect(predicate).toContain('developing_story_event.developingArticleId <> developing_story_event.representativeArticleId');
    expect(predicate).toContain('developing_story_event.userId = articles.userId');
  });

  // Builds topic grouping around one strongest representative per user-owned topic.
  it('groups topics by strongest event representative', () => {
    const query = buildQuery({ grouping: 'topic' });

    expect(query.where[Op.and][0].id[Op.in].sql).toContain('MAX(eventStrength)');
    expect(query.where[Op.and][0].id[Op.in].sql).toContain('e.userId = t.userId');
  });

  // Delegates prepared ID searches to the Article model unchanged.
  it('executes a prepared article query', async () => {
    mocked.articleFindAll.mockResolvedValue([{ id: 2 }]);
    const query = {
      where: { userId: 7 },
      include: [],
      attributes: ['id'],
      order: [['id', 'DESC']]
    };

    await expect(executeSearch(query)).resolves.toEqual([{ id: 2 }]);
    expect(mocked.articleFindAll).toHaveBeenCalledWith(query);
  });

  it('passes a bounded page limit to the Article model', async () => {
    mocked.articleFindAll.mockResolvedValue([{ id: 2 }]);
    const query = {
      where: { userId: 7 },
      include: [],
      attributes: ['id'],
      order: [['id', 'DESC']],
      limit: 21
    };

    await executeSearch(query);

    expect(mocked.articleFindAll).toHaveBeenCalledWith(query);
  });

  // Delegates count-only searches without materializing result rows.
  it('executes a prepared count query', async () => {
    mocked.articleCount.mockResolvedValue(12);

    await expect(executeSearchCount({ where: { userId: 7 } })).resolves.toBe(12);
    expect(mocked.articleCount).toHaveBeenCalledWith({ where: { userId: 7 } });
  });

  it('counts distinct matching feed IDs without loading articles', async () => {
    mocked.articleCount.mockResolvedValue(4);
    const query = { where: { userId: 7 } };

    await expect(executeSearchSourceCount(query)).resolves.toBe(4);

    expect(mocked.articleCount).toHaveBeenCalledWith({
      where: query.where,
      distinct: true,
      col: 'feedId'
    });
  });
});
