import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Op } from 'sequelize';

const mocked = vi.hoisted(() => ({ articles: vi.fn(), islands: vi.fn() }));
vi.mock('../../models/index.js', () => ({ default: {
  Article: { findAll: mocked.articles }, Island: { findAll: mocked.islands }
} }));
import { collectArticleIslandMatches, matchingArticleIslands } from '../../services/islands/islandArticleMatches.js';

describe('direct Article affinity for Island filtering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('matches neutral and negative Islands without an Event and rejects invalid or unrelated vectors', () => {
    const islands = [
      { id: 1, weight: 0, islandVector: [1, 0] },
      { id: 2, weight: -0.8, islandVector: '[1,0]' },
      { id: 3, weight: 1, islandVector: [0, 1] }
    ];
    expect(matchingArticleIslands({ articleVector: [1, 0], interestScore: 0 }, islands).map(i => i.id)).toEqual([1, 2]);
    expect(matchingArticleIslands({ articleVector: null }, islands)).toEqual([]);
    expect(matchingArticleIslands({ articleVector: [1, 0, 0] }, islands)).toEqual([]);
    expect(matchingArticleIslands({ articleVector: [1, 0] }, [islands[0]], 1)).toEqual([]);
  });

  it('applies ownership and visibility in every bounded batch before comparing vectors', async () => {
    mocked.islands.mockResolvedValue([{ id: 3, islandVector: [1, 0] }]);
    mocked.articles.mockResolvedValueOnce(Array.from({ length: 200 }, (_, i) => ({ id: i + 1, articleVector: [0, 1] })))
      .mockResolvedValueOnce([{ id: 201, articleVector: [1, 0] }]).mockResolvedValueOnce([]);
    const onBatch = vi.fn();
    const where = { feedId: 7, status: 'unread' };
    expect(await collectArticleIslandMatches(42, { where, onBatch })).toEqual([201]);
    expect(mocked.islands).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 42, archivedInd: false } }));
    for (const [index, [query]] of mocked.articles.mock.calls.entries()) {
      expect(query).toMatchObject({ limit: 200, order: [['id', 'ASC']], attributes: ['id', 'articleVector'] });
      expect(query.where[Op.and][0]).toBe(where);
      expect(query.where[Op.and][1]).toMatchObject({ userId: 42, filteredInd: false,
        duplicateOfArticleId: { [Op.is]: null }, id: { [Op.gt]: [0, 200, 201][index] } });
    }
    expect(onBatch).toHaveBeenLastCalledWith([{ articleId: 201, islands: [{ id: 3, islandVector: [1, 0] }] }]);
  });

  it('does not scan articles when there are no active Islands', async () => {
    mocked.islands.mockResolvedValue([]);
    expect(await collectArticleIslandMatches(42)).toEqual([]);
    expect(mocked.articles).not.toHaveBeenCalled();
  });
});
