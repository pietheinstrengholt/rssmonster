import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  smartFolderFindAll: vi.fn(),
  smartFolderDestroy: vi.fn(),
  smartFolderBulkCreate: vi.fn(),
  searchArticles: vi.fn(),
  getSmartFolderRecommendations: vi.fn()
}));

vi.mock('../models/index.js', () => ({
  default: {
    Article: {},
    Feed: {},
    Tag: {},
    SmartFolder: {
      findAll: mocked.smartFolderFindAll,
      destroy: mocked.smartFolderDestroy,
      bulkCreate: mocked.smartFolderBulkCreate
    }
  }
}));

vi.mock('../util/articleSearch.service.js', () => ({
  searchArticles: mocked.searchArticles
}));

vi.mock('../util/smartFolderLLM.js', () => ({
  getSmartFolderRecommendations: mocked.getSmartFolderRecommendations
}));

const { default: smartFolderController } = await import('../controllers/smartFolder.js');

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
    vi.clearAllMocks();
  });

  describe('getSmartFolders', () => {
    it('returns folders with ArticleCount resolved via searchArticles', async () => {
      const folderA = { id: 1, name: 'Top Stories', query: 'sort:IMPORTANCE', limitCount: 25, dataValues: {} };
      const folderB = { id: 2, name: 'Unread', query: 'unread:true', dataValues: {} };

      mocked.smartFolderFindAll.mockResolvedValue([folderA, folderB]);
      mocked.searchArticles.mockImplementation(async ({ search }) => {
        if (search === 'sort:IMPORTANCE') {
          return { itemIds: [11, 12, 13, 14] };
        }

        throw new Error('search failed');
      });

      const req = { userData: { userId: 42 } };
      const res = createRes();
      const next = vi.fn();

      await smartFolderController.getSmartFolders(req, res, next);

      expect(mocked.smartFolderFindAll).toHaveBeenCalledWith({
        where: { userId: 42 },
        order: [['name', 'ASC']]
      });

      expect(mocked.searchArticles).toHaveBeenCalledWith({
        userId: 42,
        search: 'sort:IMPORTANCE',
        smartFolderSearch: true,
        limitCount: 25
      });

      expect(mocked.searchArticles).toHaveBeenCalledWith({
        userId: 42,
        search: 'unread:true',
        smartFolderSearch: true,
        limitCount: 50
      });

      expect(folderA.dataValues.ArticleCount).toBe(4);
      expect(folderB.dataValues.ArticleCount).toBe(0);

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
  });

  describe('postSmartFolder', () => {
    it('replaces folders and applies payload defaults', async () => {
      mocked.smartFolderDestroy.mockResolvedValue(2);
      mocked.smartFolderBulkCreate.mockImplementation(async payload => payload);

      const req = {
        userData: { userId: 42 },
        body: {
          smartFolders: [
            { name: 'Top Stories', query: 'cluster:eventCluster sort:IMPORTANCE', limitCount: 30 },
            { query: 'unread:true' },
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
          query: 'cluster:eventCluster sort:IMPORTANCE',
          limitCount: 30
        },
        {
          userId: 42,
          name: '',
          query: 'unread:true',
          limitCount: 50
        }
      ]);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        total: 2,
        smartFolders: [
          {
            userId: 42,
            name: 'Top Stories',
            query: 'cluster:eventCluster sort:IMPORTANCE',
            limitCount: 30
          },
          {
            userId: 42,
            name: '',
            query: 'unread:true',
            limitCount: 50
          }
        ]
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
