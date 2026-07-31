import { Op } from 'sequelize';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleCount: vi.fn(),
  articleFindAll: vi.fn(),
  literal: vi.fn(sql => ({ sql })),
  sequelizeWhere: vi.fn((left, right) => ({ left, right }))
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: {
      count: mocked.articleCount,
      findAll: mocked.articleFindAll,
      sequelize: {
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
  executeSearchCount
} from '../../services/articleSearch/articleSearchExecutor.service.js';

// Builds a neutral search descriptor so each test highlights one retrieval concern.
const buildQuery = overrides => buildArticleSearchQuery({
  baseWhere: { feedId: [4] },
  smartFolderSearch: false,
  sortRecommended: false,
  sortQuality: false,
  sortAttention: false,
  sortTrust: false,
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
    mocked.literal.mockClear();
    mocked.sequelizeWhere.mockClear();
  });

  // Loads attention inputs only when runtime attention ordering needs them.
  it('selects attention attributes without database ordering', () => {
    const query = buildQuery({ sortAttention: true });

    expect(query.attributes).toEqual(expect.arrayContaining(['attentionBucket', 'clickedAmount']));
    expect(query).not.toHaveProperty('order');
  });

  // Applies age, author, and language predicates without dropping the base feed scope.
  it.each([
    ['h', 'HOUR'],
    ['d', 'DAY']
  ])('applies first-seen age in %s units', (unit, intervalUnit) => {
    const query = buildQuery({
      firstSeenAgeFilter: { value: 6, unit },
      authorFilter: 'Ada',
      languageFilter: 'eng'
    });

    expect(query.where.feedId).toEqual([4]);
    expect(query.where.author).toEqual({ [Op.like]: '%Ada%' });
    expect(query.where.language).toBe('eng');
    expect(mocked.literal).toHaveBeenCalledWith(`NOW() - INTERVAL 6 ${intervalUnit}`);
    expect(query.where[Op.and][0][Op.or]).toHaveLength(2);
  });

  // Lets an explicit hot filter broaden source scope while retaining hot eligibility.
  it('applies an explicit hot filter across feeds', () => {
    const query = buildQuery({ hotFilter: true });

    expect(query.where).not.toHaveProperty('feedId');
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
    if (status === 'hot') expect(query.where).not.toHaveProperty('feedId');
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

  // Delegates count-only searches without materializing result rows.
  it('executes a prepared count query', async () => {
    mocked.articleCount.mockResolvedValue(12);

    await expect(executeSearchCount({ where: { userId: 7 } })).resolves.toBe(12);
    expect(mocked.articleCount).toHaveBeenCalledWith({ where: { userId: 7 } });
  });
});
