import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  feedFindAll: vi.fn(),
  smartFolderFindAll: vi.fn(),
  smartFolderDestroy: vi.fn(),
  smartFolderBulkCreate: vi.fn(),
  settingFindOne: vi.fn(),
  tagFindAll: vi.fn(),
  searchArticles: vi.fn(),
  getSmartFolderRecommendations: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: {
      findAll: mocked.articleFindAll
    },
    Feed: {
      findAll: mocked.feedFindAll
    },
    Tag: {
      findAll: mocked.tagFindAll
    },
    Setting: {
      findOne: mocked.settingFindOne
    },
    SmartFolder: {
      findAll: mocked.smartFolderFindAll,
      destroy: mocked.smartFolderDestroy,
      bulkCreate: mocked.smartFolderBulkCreate
    }
  }
}));

vi.mock('../../services/articleSearch/articleSearch.service.js', () => ({
  searchArticles: mocked.searchArticles
}));

vi.mock('../../services/smartFolders/smartFolderLLM.js', () => ({
  getSmartFolderRecommendations: mocked.getSmartFolderRecommendations
}));

const { default: smartFolderController } = await import('../../controllers/smartFolder.js');

const createRes = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn()
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
};

describe('smartFolder controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getSmartFolders', () => {
    it('returns folders with ArticleCount resolved via searchArticles', async () => {
      const folderA = {
        id: 1,
        name: 'Top Stories',
        query: 'sort:recommended',
        limitCount: 25,
        markAsReadOnScroll: false,
        dataValues: {}
      };
      const folderB = {
        id: 2,
        name: 'Unread',
        query: 'unread:true',
        markAsReadOnScroll: true,
        dataValues: {}
      };

      mocked.smartFolderFindAll.mockResolvedValue([folderA, folderB]);
      mocked.settingFindOne.mockResolvedValue({
        minAdvertisementScore: 0,
        minSentimentScore: 0,
        minQualityScore: 0
      });
      mocked.feedFindAll.mockResolvedValue([{ id: 8 }, { id: 13 }]);
      mocked.searchArticles.mockImplementation(async ({ search }) => ({
        articleCount: search === 'sort:recommended' ? 4 : 0
      }));

      const req = { userData: { userId: 42 } };
      const res = createRes();
      const next = vi.fn();

      await smartFolderController.getSmartFolders(req, res, next);

      expect(mocked.smartFolderFindAll).toHaveBeenCalledWith({
        where: { userId: 42 },
        attributes: ['id', 'name', 'query', 'limitCount', 'markAsReadOnScroll'],
        order: [['name', 'ASC']]
      });

      expect(mocked.searchArticles).toHaveBeenCalledWith({
        userId: 42,
        search: 'sort:recommended',
        minAdvertisementScore: 0,
        minSentimentScore: 0,
        minQualityScore: 0,
        resolvedFeedIds: [8, 13],
        smartFolderSearch: true,
        limitCount: 25,
        countOnly: true
      });

      expect(mocked.searchArticles).toHaveBeenCalledWith({
        userId: 42,
        search: 'unread:true',
        minAdvertisementScore: 0,
        minSentimentScore: 0,
        minQualityScore: 0,
        resolvedFeedIds: [8, 13],
        smartFolderSearch: true,
        limitCount: 50,
        countOnly: true
      });

      expect(folderA.dataValues.ArticleCount).toBe(4);
      expect(folderB.dataValues.ArticleCount).toBe(0);
      expect(folderA.markAsReadOnScroll).toBe(false);
      expect(folderB.markAsReadOnScroll).toBe(true);
      expect(mocked.settingFindOne).toHaveBeenCalledOnce();
      expect(mocked.feedFindAll).toHaveBeenCalledOnce();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        total: 2,
        smartFolders: [folderA, folderB]
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when userId is missing', async () => {
      const req = { userData: {} };
      const res = createRes();
      const next = vi.fn();

      await smartFolderController.getSmartFolders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: missing userId' });
      expect(next).not.toHaveBeenCalled();
    });

    it('skips count queries when withCounts is false', async () => {
      const folders = [
        { id: 1, name: 'Unread', query: 'unread:true', dataValues: {} }
      ];
      mocked.smartFolderFindAll.mockResolvedValue(folders);
      const req = {
        userData: { userId: 42 },
        query: { withCounts: 'false' }
      };
      const res = createRes();

      await smartFolderController.getSmartFolders(req, res, vi.fn());

      expect(mocked.smartFolderFindAll).toHaveBeenCalledOnce();
      expect(mocked.settingFindOne).not.toHaveBeenCalled();
      expect(mocked.searchArticles).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        total: 1,
        smartFolders: folders
      });
    });

    it('forwards folder-loading errors to Express', async () => {
      const error = new Error('folder query failed');
      mocked.smartFolderFindAll.mockRejectedValue(error);
      const next = vi.fn();

      await smartFolderController.getSmartFolders(
        { userData: { userId: 42 }, query: {} },
        createRes(),
        next
      );

      expect(next).toHaveBeenCalledWith(error);
    });

    it('isolates one count failure and publishes zero for only that folder', async () => {
      const folders = [
        { id: 1, name: 'Broken', query: 'title:broken', limitCount: 50, dataValues: {} },
        { id: 2, name: 'Working', query: 'unread:true', limitCount: 50, dataValues: {} }
      ];
      const error = new Error('search failed');
      mocked.smartFolderFindAll.mockResolvedValue(folders);
      mocked.settingFindOne.mockResolvedValue(null);
      mocked.feedFindAll.mockResolvedValue([{ id: 8 }]);
      mocked.searchArticles.mockImplementation(({ search }) => (
        search === 'title:broken'
          ? Promise.reject(error)
          : Promise.resolve({ articleCount: 6 })
      ));
      const res = createRes();
      const next = vi.fn();

      await smartFolderController.getSmartFolders(
        { userData: { userId: 42 }, query: {} },
        res,
        next
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        total: 2,
        smartFolders: folders
      });
      expect(folders[0].dataValues.ArticleCount).toBe(0);
      expect(folders[1].dataValues.ArticleCount).toBe(6);
    });
  });

  describe('getSmartFolderCounts', () => {
    it('returns count-only folder results', async () => {
      mocked.smartFolderFindAll.mockResolvedValue([
        { id: 1, query: 'unread:true', limitCount: null }
      ]);
      mocked.settingFindOne.mockResolvedValue(null);
      mocked.feedFindAll.mockResolvedValue([{ id: 8 }]);
      mocked.searchArticles.mockResolvedValue({ articleCount: 7 });
      const res = createRes();

      await smartFolderController.getSmartFolderCounts(
        { userData: { userId: 42 } },
        res,
        vi.fn()
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mocked.searchArticles).toHaveBeenCalledWith(expect.objectContaining({
        resolvedFeedIds: [8]
      }));
      expect(res.json).toHaveBeenCalledWith({
        total: 1,
        smartFolders: [{ id: 1, ArticleCount: 7 }]
      });
    });

    it('rejects count requests without a user and forwards query errors', async () => {
      const unauthorizedRes = createRes();
      await smartFolderController.getSmartFolderCounts(
        { userData: {} },
        unauthorizedRes,
        vi.fn()
      );
      expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

      const error = new Error('count query failed');
      mocked.smartFolderFindAll.mockRejectedValue(error);
      const next = vi.fn();
      await smartFolderController.getSmartFolderCounts(
        { userData: { userId: 42 } },
        createRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(error);
    });

    it('returns zero when one count-only folder search fails', async () => {
      const error = new Error('search failed');
      mocked.smartFolderFindAll.mockResolvedValue([
        { id: 1, query: 'title:broken', limitCount: 50 }
      ]);
      mocked.settingFindOne.mockResolvedValue(null);
      mocked.feedFindAll.mockResolvedValue([{ id: 8 }]);
      mocked.searchArticles.mockRejectedValue(error);
      const res = createRes();
      const next = vi.fn();

      await smartFolderController.getSmartFolderCounts(
        { userData: { userId: 42 } },
        res,
        next
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        total: 1,
        smartFolders: [{ id: 1, ArticleCount: 0 }]
      });
    });
  });

  describe('postSmartFolder', () => {
    it('replaces folders and applies payload defaults', async () => {
      mocked.smartFolderDestroy.mockResolvedValue(2);
      mocked.smartFolderBulkCreate.mockImplementation(async payload => payload);

      const req = {
        userData: { userId: 42 },
        body: {
          smartFolders: [
            { name: 'Top Stories', query: 'event:true sort:recommended', limitCount: 30 },
            { query: 'unread:true', markAsReadOnScroll: true },
            { name: '', query: '' },
            null
          ]
        }
      };

      const res = createRes();
      const next = vi.fn();

      await smartFolderController.postSmartFolder(req, res, next);

      expect(mocked.smartFolderDestroy).toHaveBeenCalledWith({ where: { userId: 42 } });
      expect(mocked.smartFolderBulkCreate).toHaveBeenCalledWith([
        {
          userId: 42,
          name: 'Top Stories',
          query: 'event:true sort:recommended',
          limitCount: 30,
          markAsReadOnScroll: false
        },
        {
          userId: 42,
          name: '',
          query: 'unread:true',
          limitCount: 50,
          markAsReadOnScroll: true
        }
      ]);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        total: 2,
        smartFolders: [
          {
            userId: 42,
            name: 'Top Stories',
            query: 'event:true sort:recommended',
            limitCount: 30,
            markAsReadOnScroll: false
          },
          {
            userId: 42,
            name: '',
            query: 'unread:true',
            limitCount: 50,
            markAsReadOnScroll: true
          }
        ]
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects missing users and clears folders for an empty payload', async () => {
      const unauthorizedRes = createRes();
      await smartFolderController.postSmartFolder(
        { userData: {}, body: {} },
        unauthorizedRes,
        vi.fn()
      );
      expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

      mocked.smartFolderDestroy.mockResolvedValue(2);
      const emptyRes = createRes();
      await smartFolderController.postSmartFolder(
        { userData: { userId: 42 }, body: {} },
        emptyRes,
        vi.fn()
      );
      expect(mocked.smartFolderBulkCreate).not.toHaveBeenCalled();
      expect(emptyRes.json).toHaveBeenCalledWith({
        total: 0,
        smartFolders: []
      });
    });

    it('rejects invalid expressions before replacing existing folders', async () => {
      const res = createRes();

      await smartFolderController.postSmartFolder(
        {
          userData: { userId: 42 },
          body: {
            smartFolders: [
              { name: 'Valid', query: 'unread:true limit:50' },
              { name: 'Invalid', query: 'quallity:>=0.7' }
            ]
          }
        },
        res,
        vi.fn()
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'EXPRESSION_UNKNOWN_FILTER',
          message: 'Unknown expression field: "quallity".',
          index: 1
        }
      });
      expect(mocked.smartFolderDestroy).not.toHaveBeenCalled();
      expect(mocked.smartFolderBulkCreate).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean scrolling preference before replacing folders', async () => {
      const res = createRes();

      await smartFolderController.postSmartFolder(
        {
          userData: { userId: 42 },
          body: {
            smartFolders: [{
              name: 'Unread',
              query: 'unread:true',
              markAsReadOnScroll: 'true'
            }]
          }
        },
        res,
        vi.fn()
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'SMART_FOLDER_INVALID_MARK_AS_READ_ON_SCROLL',
          message: 'markAsReadOnScroll must be a boolean.',
          index: 0
        }
      });
      expect(mocked.smartFolderDestroy).not.toHaveBeenCalled();
      expect(mocked.smartFolderBulkCreate).not.toHaveBeenCalled();
    });

    it('requires an unread:true filter when scrolling should mark articles read', async () => {
      const res = createRes();

      await smartFolderController.postSmartFolder(
        {
          userData: { userId: 42 },
          body: {
            smartFolders: [{
              name: 'Favorites',
              query: 'favorite:true',
              markAsReadOnScroll: true
            }]
          }
        },
        res,
        vi.fn()
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'SMART_FOLDER_MARK_AS_READ_ON_SCROLL_REQUIRES_UNREAD',
          message: 'markAsReadOnScroll requires unread:true.',
          index: 0
        }
      });
      expect(mocked.smartFolderDestroy).not.toHaveBeenCalled();
      expect(mocked.smartFolderBulkCreate).not.toHaveBeenCalled();
    });

    it('rejects a named Smart Folder without an expression before replacement', async () => {
      const res = createRes();

      await smartFolderController.postSmartFolder(
        {
          userData: { userId: 42 },
          body: { smartFolders: [{ name: 'Missing expression', query: '' }] }
        },
        res,
        vi.fn()
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'EXPRESSION_REQUIRED',
          message: 'Expression cannot be empty.',
          index: 0
        }
      });
      expect(mocked.smartFolderDestroy).not.toHaveBeenCalled();
    });

    it('forwards folder persistence errors to Express', async () => {
      const error = new Error('save failed');
      mocked.smartFolderDestroy.mockRejectedValue(error);
      const next = vi.fn();

      await smartFolderController.postSmartFolder(
        { userData: { userId: 42 }, body: {} },
        createRes(),
        next
      );

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('smart folder insights', () => {
    it('collects and distills user engagement into recommendations', async () => {
      mocked.articleFindAll
        .mockResolvedValueOnce([
          {
            feedId: 1,
            total: '10',
            unread: '8',
            read: '2',
            clicked: '3',
            favorite: '2'
          },
          {
            feedId: 999,
            total: '5',
            unread: '5',
            read: '0',
            clicked: '0',
            favorite: '0'
          }
        ])
        .mockResolvedValueOnce([
          { feedId: 1, title: 'Favorite article' }
        ]);
      mocked.feedFindAll.mockResolvedValue([
        { id: 1, feedName: 'Security Feed' },
        { id: 2, feedName: 'Quiet Feed' }
      ]);
      mocked.tagFindAll.mockResolvedValue([
        { name: 'security', count: '4' },
        { name: 'privacy', count: null }
      ]);
      mocked.smartFolderFindAll.mockResolvedValue([
        { name: 'Existing', query: 'unread:true' }
      ]);
      mocked.getSmartFolderRecommendations.mockResolvedValue([
        { name: 'Security', query: 'tag:security' }
      ]);
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = createRes();

      await smartFolderController.getSmartFolderInsights(
        { userData: { userId: 42 }, query: { days: '14' } },
        res,
        vi.fn()
      );

      expect(mocked.articleFindAll).toHaveBeenCalledTimes(2);
      expect(mocked.getSmartFolderRecommendations).toHaveBeenCalledWith({
        distilledInsights: {
          window: 'last 14 days',
          engagement: {
            unreadRatio: 0.8,
            favoriteArticles: 2
          },
          feeds: [
            {
              name: 'Security Feed',
              unreadRatio: 0.8,
              favorite: 2
            }
          ],
          interests: {
            topTags: ['security', 'privacy'],
            longTailTagCount: 0
          },
          favoriteItems: [
            {
              feed: 'Security Feed',
              title: 'Favorite article'
            }
          ],
          existingSmartFolders: [
            { name: 'Existing', query: 'unread:true' }
          ]
        }
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns raw signals with zero-safe engagement values', async () => {
      mocked.articleFindAll
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mocked.feedFindAll.mockResolvedValue([
        { id: 2, feedName: 'Empty Feed' }
      ]);
      mocked.tagFindAll.mockResolvedValue([]);
      mocked.smartFolderFindAll.mockResolvedValue([]);

      const result = await smartFolderController.collectSmartFolderSignals(
        42,
        { days: 7, maxFavoriteTitles: 3 }
      );

      expect(result.window).toEqual({ days: 7 });
      expect(result.engagement).toEqual({
        totalArticles: 0,
        unread: 0,
        read: 0,
        clicked: 0,
        favorite: 0
      });
      expect(result.feeds).toEqual([
        {
          name: 'Empty Feed',
          total: 0,
          unread: 0,
          read: 0,
          clicked: 0,
          favorite: 0
        }
      ]);
    });

    it('rejects unauthenticated insight requests and forwards failures', async () => {
      const unauthorizedRes = createRes();
      await smartFolderController.getSmartFolderInsights(
        { userData: {}, query: {} },
        unauthorizedRes,
        vi.fn()
      );
      expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

      const error = new Error('insight query failed');
      mocked.articleFindAll.mockRejectedValue(error);
      mocked.feedFindAll.mockResolvedValue([]);
      mocked.tagFindAll.mockResolvedValue([]);
      mocked.smartFolderFindAll.mockResolvedValue([]);
      const next = vi.fn();
      await smartFolderController.getSmartFolderInsights(
        { userData: { userId: 42 }, query: {} },
        createRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
