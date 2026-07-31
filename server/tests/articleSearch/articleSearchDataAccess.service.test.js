import { Op } from 'sequelize';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  feedFindAll: vi.fn(),
  tagFindAll: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Feed: { findAll: mocked.feedFindAll },
    Tag: { findAll: mocked.tagFindAll }
  }
}));

import {
  fetchFeedIds,
  fetchTaggedArticleIds
} from '../../services/articleSearch/articleSearchDataAccess.service.js';

describe('articleSearchDataAccess.service', () => {
  // Resets data-access observations between ownership and scope scenarios.
  beforeEach(() => {
    mocked.feedFindAll.mockReset();
    mocked.tagFindAll.mockReset();
  });

  // Avoids a tag query when the caller did not request a tag.
  it('returns null when no tag name is supplied', async () => {
    await expect(fetchTaggedArticleIds({ userId: 7 })).resolves.toBeNull();
    expect(mocked.tagFindAll).not.toHaveBeenCalled();
  });

  // Keeps tag lookup user-scoped and maps model rows to article identities.
  it('returns article ids for an exact user-owned tag', async () => {
    mocked.tagFindAll.mockResolvedValue([{ articleId: 11 }, { articleId: 13 }]);

    await expect(fetchTaggedArticleIds({ userId: 7, tagName: 'docker' }))
      .resolves.toEqual([11, 13]);
    expect(mocked.tagFindAll).toHaveBeenCalledWith({
      where: { userId: 7, name: 'docker' },
      attributes: ['articleId']
    });
  });

  // Preserves an explicitly selected feed without performing a broader lookup.
  it('returns an explicit feed id directly', async () => {
    await expect(fetchFeedIds({ userId: 7, categoryId: '%', feedId: 19 }))
      .resolves.toBe(19);
    expect(mocked.feedFindAll).not.toHaveBeenCalled();
  });

  // Resolves the all-feeds scope inside the requesting user's library.
  it('returns all user feed ids for wildcard scope', async () => {
    mocked.feedFindAll.mockResolvedValue([{ id: 2 }, { id: 4 }]);

    await expect(fetchFeedIds({ userId: 7, categoryId: '%', feedId: '%' }))
      .resolves.toEqual([2, 4]);
    expect(mocked.feedFindAll).toHaveBeenCalledWith({
      attributes: ['id'],
      where: { userId: 7 }
    });
  });

  // Resolves category feeds while preserving both ownership and category matching.
  it('returns user feed ids matching the selected category', async () => {
    mocked.feedFindAll.mockResolvedValue([{ id: 5 }]);

    await expect(fetchFeedIds({ userId: 7, categoryId: 'news%', feedId: '%' }))
      .resolves.toEqual([5]);
    expect(mocked.feedFindAll).toHaveBeenCalledWith({
      attributes: ['id'],
      where: {
        userId: 7,
        categoryId: { [Op.like]: 'news%' }
      }
    });
  });
});
