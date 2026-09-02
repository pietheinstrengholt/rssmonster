import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  categoryFindAll: vi.fn(),
  categoryFindOne: vi.fn(),
  categoryUpdate: vi.fn(),
  feedFindOne: vi.fn(),
  transaction: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: {},
    BriefingPreference: {},
    Category: {
      findAll: mocked.categoryFindAll,
      findOne: mocked.categoryFindOne,
      update: mocked.categoryUpdate
    },
    Feed: {
      findOne: mocked.feedFindOne
    },
    Setting: {},
    sequelize: {
      transaction: mocked.transaction
    }
  }
}));

const {
  categoryUpdateOrder,
  feedChangeCategory,
  getOverviewLite
} = await import('../../controllers/manager.js');

// Builds an authenticated manager request with overridable fields.
const createRequest = (overrides = {}) => ({
  userData: { userId: 42 },
  body: {},
  ...overrides
});

// Builds the chainable response contract used by manager handlers.
const createResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

describe('manager controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.transaction.mockImplementation(callback => callback('transaction'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns the category and feed structure without article counts', async () => {
    mocked.categoryFindAll.mockResolvedValue([
      {
        get: vi.fn().mockReturnValue({
          id: 3,
          name: 'Technology',
          feeds: [
            {
              id: 8,
              feedName: 'Security Feed'
            }
          ]
        })
      }
    ]);
    const res = createResponse();

    await getOverviewLite(createRequest(), res);

    expect(mocked.categoryFindAll).toHaveBeenCalledWith({
      where: { userId: 42 },
      attributes: ['id', 'name', 'categoryOrder', 'iconName'],
      include: [{
        model: expect.any(Object),
        attributes: [
          'id',
          'categoryId',
          'feedName',
          'feedDesc',
          'url',
          'favicon',
          'errorCount',
          'errorMessage',
          'errorSince',
          'status',
          'updateIntervalMinutes',
          'feedTags',
          'itemFilter',
          'generateEmbeddings',
          'applyAiAnalysis'
        ],
        required: false
      }],
      order: ['categoryOrder', 'name']
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      total: 0,
      readCount: 0,
      unreadCount: 0,
      favoriteCount: 0,
      hotCount: 0,
      clickedCount: 0,
      categories: [
        {
          id: 3,
          name: 'Technology',
          readCount: 0,
          unreadCount: 0,
          briefingCount: 0,
          favoriteCount: 0,
          hotCount: 0,
          clickedCount: 0,
          feeds: [
            {
              id: 8,
              feedName: 'Security Feed',
              readCount: 0,
              unreadCount: 0,
              briefingCount: 0,
              favoriteCount: 0,
              hotCount: 0,
              clickedCount: 0
            }
          ]
        }
      ]
    });
  });

  it('validates overview authentication and handles load failures', async () => {
    const unauthorizedRes = createResponse();
    await getOverviewLite(
      createRequest({ userData: {} }),
      unauthorizedRes
    );
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    mocked.categoryFindAll.mockRejectedValue(new Error('load failed'));
    const failureRes = createResponse();
    await getOverviewLite(createRequest(), failureRes);
    expect(failureRes.status).toHaveBeenCalledWith(500);
    expect(failureRes.json).toHaveBeenCalledWith({
      error: 'Unable to load overview'
    });
  });

  it('updates category positions within the authenticated user scope', async () => {
    mocked.categoryUpdate.mockResolvedValue([1]);
    const res = createResponse();

    await categoryUpdateOrder(
      createRequest({ body: { order: [9, 4] } }),
      res
    );

    expect(mocked.categoryUpdate).toHaveBeenNthCalledWith(
      1,
      { categoryOrder: 0 },
      { where: { userId: 42, id: 9 }, transaction: 'transaction' }
    );
    expect(mocked.categoryUpdate).toHaveBeenNthCalledWith(
      2,
      { categoryOrder: 1 },
      { where: { userId: 42, id: 4 }, transaction: 'transaction' }
    );
    expect(mocked.transaction).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith('order updated');
  });

  it('accepts an empty category order without issuing updates', async () => {
    const res = createResponse();

    await categoryUpdateOrder(
      createRequest({ body: { order: [] } }),
      res
    );

    expect(mocked.categoryUpdate).not.toHaveBeenCalled();
    expect(mocked.transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('validates category ordering requests and reports update errors', async () => {
    const unauthorizedRes = createResponse();
    await categoryUpdateOrder(
      createRequest({ userData: {} }),
      unauthorizedRes
    );
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    const invalidRes = createResponse();
    await categoryUpdateOrder(createRequest(), invalidRes);
    expect(invalidRes.status).toHaveBeenCalledWith(400);
    expect(invalidRes.json).toHaveBeenCalledWith({
      message: 'order is not set'
    });

    mocked.categoryUpdate.mockRejectedValue(new Error('update failed'));
    const failureRes = createResponse();
    await categoryUpdateOrder(
      createRequest({ body: { order: [9] } }),
      failureRes
    );
    expect(failureRes.status).toHaveBeenCalledWith(500);
    expect(failureRes.json).toHaveBeenCalledWith({
      error: 'Unable to update category order'
    });
  });

  it('moves an owned feed to an owned category', async () => {
    const feed = {
      id: 8,
      update: vi.fn().mockResolvedValue(undefined)
    };
    mocked.feedFindOne.mockResolvedValue(feed);
    mocked.categoryFindOne.mockResolvedValue({ id: 3 });
    const res = createResponse();

    await feedChangeCategory(
      createRequest({
        body: {
          feedId: 8,
          categoryId: 3
        }
      }),
      res
    );

    expect(mocked.feedFindOne).toHaveBeenCalledWith({
      where: { id: 8, userId: 42 }
    });
    expect(mocked.categoryFindOne).toHaveBeenCalledWith({
      where: { id: 3, userId: 42 }
    });
    expect(feed.update).toHaveBeenCalledWith(
      { categoryId: 3 },
      { where: { userId: 42 } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(feed);
  });

  it('validates feed category changes before mutation', async () => {
    const unauthorizedRes = createResponse();
    await feedChangeCategory(
      createRequest({ userData: {} }),
      unauthorizedRes
    );
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    const invalidRes = createResponse();
    await feedChangeCategory(
      createRequest({ body: { feedId: 8 } }),
      invalidRes
    );
    expect(invalidRes.status).toHaveBeenCalledWith(400);
    expect(invalidRes.json).toHaveBeenCalledWith({
      message: 'feedId or categoryId is not set'
    });
  });

  it('does not move foreign or missing feeds and categories', async () => {
    mocked.feedFindOne.mockResolvedValue(null);
    mocked.categoryFindOne.mockResolvedValue({ id: 3 });
    const res = createResponse();

    await feedChangeCategory(
      createRequest({
        body: {
          feedId: 8,
          categoryId: 3
        }
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Feed or category not found'
    });
  });

  it('returns a stable error when changing a feed category fails', async () => {
    mocked.feedFindOne.mockRejectedValue(new Error('query failed'));
    const res = createResponse();

    await feedChangeCategory(
      createRequest({
        body: {
          feedId: 8,
          categoryId: 3
        }
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unable to change feed category'
    });
  });
});
