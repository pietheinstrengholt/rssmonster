import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  articleFindOne: vi.fn(),
  sequelizeCol: vi.fn(value => value),
  sequelizeFn: vi.fn((name, value) => ({ name, value })),
  sequelizeWhere: vi.fn((left, right) => ({ left, right }))
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: {
      findAll: mocked.articleFindAll,
      findOne: mocked.articleFindOne
    },
    sequelize: {
      col: mocked.sequelizeCol,
      fn: mocked.sequelizeFn,
      where: mocked.sequelizeWhere
    }
  }
}));

describe('find existing article duplicate lookups', () => {
  beforeEach(() => {
    Object.values(mocked).forEach(mock => mock.mockClear());
    mocked.articleFindAll.mockResolvedValue([]);
    mocked.articleFindOne.mockResolvedValue(null);
  });

  it('limits visible-text duplicate lookup to active articles for one user', async () => {
    const { findByUserContentTextHash } = await import('../../services/crawl/identity/findExistingArticle.js');

    await findByUserContentTextHash({
      userId: 42,
      contentTextHash: 'text-hash'
    });

    expect(mocked.articleFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: 42,
        contentTextHash: 'text-hash',
        filteredInd: false
      }
    }));
  });

  it('limits original-content duplicate lookup to active articles for one user', async () => {
    const { findByUserContentSourceHash } = await import('../../services/crawl/identity/findExistingArticle.js');

    await findByUserContentSourceHash({
      userId: 42,
      contentSourceHash: 'source-hash'
    });

    expect(mocked.articleFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: 42,
        contentSourceHash: 'source-hash',
        filteredInd: false
      }
    }));
  });

  it('limits title fallback to active articles in the same feed and user', async () => {
    const { findFeedTitleCandidates } = await import('../../services/crawl/identity/findExistingArticle.js');

    await findFeedTitleCandidates({
      userId: 42,
      feedId: 7,
      title: 'A sufficiently long fallback title',
      publishedAt: '2026-07-14T00:00:00.000Z'
    }, 7);

    expect(mocked.articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 42,
        feedId: 7,
        filteredInd: false
      })
    }));
  });

  it('keeps feed URL lookups inclusive of filtered articles', async () => {
    const {
      findByFeedNormalizedUrlHash,
      findByFeedUrlHash
    } = await import('../../services/crawl/identity/findExistingArticle.js');
    const identity = {
      userId: 42,
      feedId: 7,
      normalizedUrlHash: 'normalized-url-hash',
      urlHash: 'url-hash'
    };

    await findByFeedNormalizedUrlHash(identity);
    await findByFeedUrlHash(identity);

    expect(mocked.articleFindOne).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        userId: 42,
        feedId: 7,
        normalizedUrlHash: 'normalized-url-hash'
      }
    }));
    expect(mocked.articleFindOne).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: {
        userId: 42,
        feedId: 7,
        urlHash: 'url-hash'
      }
    }));
    expect(mocked.articleFindOne.mock.calls[0][0].where).not.toHaveProperty('filteredInd');
    expect(mocked.articleFindOne.mock.calls[1][0].where).not.toHaveProperty('filteredInd');
  });
});
