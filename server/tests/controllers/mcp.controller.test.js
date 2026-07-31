import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  categoryFindAll: vi.fn(),
  categoryFindOne: vi.fn(),
  crawlRssLinks: vi.fn(),
  feedFindAll: vi.fn(),
  feedFindOne: vi.fn(),
  handlers: new Map(),
  serverClose: vi.fn(),
  serverConnect: vi.fn(),
  tagFindAll: vi.fn(),
  transportClose: vi.fn(),
  transportHandleRequest: vi.fn()
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class McpServer {
    // Supplies a controllable MCP server while retaining every registered tool.
    constructor() {
      this.connect = mocked.serverConnect;
      this.close = mocked.serverClose;
    }

    // Captures each tool callback by its public MCP name.
    tool(name, ...configuration) {
      mocked.handlers.set(name, configuration.at(-1));
    }
  }
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class StreamableHTTPServerTransport {
    // Supplies controllable transport lifecycle methods.
    constructor() {
      this.close = mocked.transportClose;
      this.handleRequest = mocked.transportHandleRequest;
    }
  }
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: {
      findAll: mocked.articleFindAll
    },
    Category: {
      findAll: mocked.categoryFindAll,
      findOne: mocked.categoryFindOne
    },
    Feed: {
      findAll: mocked.feedFindAll,
      findOne: mocked.feedFindOne
    },
    Tag: {
      findAll: mocked.tagFindAll
    }
  }
}));

vi.mock('../../controllers/crawl.js', () => ({
  default: {
    crawlRssLinks: mocked.crawlRssLinks
  }
}));

const mcpController = (await import('../../controllers/mcp.js')).default;

// Builds the authenticated request contract passed to the MCP transport.
const createRequest = (overrides = {}) => ({
  userData: { userId: 42 },
  body: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
  ...overrides
});

// Builds the response contract and captures the registered close callback.
const createResponse = () => {
  const res = {
    closeHandler: null,
    headersSent: false,
    on: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    writeHead: vi.fn(),
    end: vi.fn()
  };
  res.on.mockImplementation((event, handler) => {
    if (event === 'close') res.closeHandler = handler;
    return res;
  });
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.writeHead.mockReturnValue(res);
  res.end.mockReturnValue(res);
  return res;
};

describe('MCP controller', () => {
  beforeEach(() => {
    mocked.handlers.clear();
    Object.entries(mocked)
      .filter(([, value]) => typeof value?.mockReset === 'function')
      .forEach(([, mock]) => mock.mockReset());
    mocked.serverConnect.mockResolvedValue(undefined);
    mocked.serverClose.mockResolvedValue(undefined);
    mocked.crawlRssLinks.mockResolvedValue(undefined);
    mocked.transportClose.mockResolvedValue(undefined);
    mocked.transportHandleRequest.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('rejects MCP requests without an authenticated user', async () => {
    const res = createResponse();

    await mcpController.postMcp(
      createRequest({ userData: {} }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocked.serverConnect).not.toHaveBeenCalled();
  });

  it('registers tools and delegates the request to the streamable transport', async () => {
    const req = createRequest();
    const res = createResponse();

    await mcpController.postMcp(req, res);

    expect(mocked.handlers.size).toBe(17);
    expect(mocked.handlers.has('categories')).toBe(true);
    expect(mocked.handlers.has('search_articles_by_keyword')).toBe(true);
    expect(mocked.serverConnect).toHaveBeenCalledOnce();
    expect(mocked.transportHandleRequest).toHaveBeenCalledWith(
      req,
      res,
      req.body
    );

    res.closeHandler();

    expect(mocked.transportClose).toHaveBeenCalledOnce();
    expect(mocked.serverClose).toHaveBeenCalledOnce();
  });

  it('returns user-owned categories through the registered tool', async () => {
    const categories = [{ id: 3, name: 'Technology' }];
    mocked.categoryFindAll.mockResolvedValue(categories);
    await mcpController.postMcp(createRequest(), createResponse());

    const result = await mocked.handlers.get('categories')();

    expect(mocked.categoryFindAll).toHaveBeenCalledWith({
      where: { userId: 42 },
      order: [['categoryOrder', 'ASC'], ['name', 'ASC']],
      raw: true
    });
    expect(result.structuredContent).toEqual({ categories });
    expect(result.content[0].text).toBe(JSON.stringify({ categories }));
    expect(result.isError).toBe(false);
  });

  it('turns category query failures into MCP tool errors', async () => {
    mocked.categoryFindAll.mockRejectedValue(new Error('database unavailable'));
    await mcpController.postMcp(createRequest(), createResponse());

    const result = await mocked.handlers.get('categories')();

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: 'Failed to fetch categories.'
    });
  });

  it('renders keyword search results as linked HTML', async () => {
    const articles = [
      {
        id: 7,
        title: 'Security update',
        url: 'https://example.com/security',
        author: 'Reporter',
        content: '<p>Summary</p>',
        publishedAt: '2026-07-31T08:00:00.000Z'
      }
    ];
    mocked.articleFindAll.mockResolvedValue(articles);
    await mcpController.postMcp(createRequest(), createResponse());

    const result = await mocked.handlers.get('search_articles_by_keyword')({
      search: 'security',
      feedId: undefined,
      status: 'unread'
    });

    expect(mocked.articleFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: { exclude: ['contentOriginal'] },
        where: expect.objectContaining({
          userId: 42,
          status: 'unread',
          filteredInd: false
        })
      })
    );
    expect(result.structuredContent.totalResults).toBe(1);
    expect(result.structuredContent.htmlOutput).toContain(
      '<a class="article-link" target="_blank" href="https://example.com/security">Security update</a>'
    );
  });

  it('serves feed discovery and time tools with user scoping', async () => {
    const feeds = [{ id: 2, feedName: 'Security' }];
    mocked.feedFindAll.mockResolvedValue(feeds);
    mocked.feedFindOne.mockResolvedValue(feeds[0]);
    await mcpController.postMcp(createRequest(), createResponse());

    const feedList = await mocked.handlers.get('feeds')();
    const feedSearch = await mocked.handlers.get('search_feed_by_name')({
      feed_name: 'Sec'
    });
    const categoryFeeds = await mocked.handlers.get('feeds_by_category_id')({
      category_id: '3'
    });
    const currentTime = await mocked.handlers.get('current_time')();

    expect(feedList.structuredContent).toEqual({ feeds });
    expect(feedSearch.structuredContent).toEqual({ feed: feeds[0] });
    expect(categoryFeeds.structuredContent).toEqual({ feeds });
    expect(currentTime.structuredContent.now).toMatch(
      /^\d{4}-\d{2}-\d{2}T/
    );
    expect(mocked.feedFindAll).toHaveBeenCalledWith({
      where: { categoryId: '3', userId: 42 },
      order: [['feedName', 'ASC']],
      raw: true
    });
  });

  it('returns a tool error when feed discovery finds no match', async () => {
    mocked.feedFindOne.mockResolvedValue(null);
    await mcpController.postMcp(createRequest(), createResponse());

    const result = await mocked.handlers.get('search_feed_by_name')({
      feed_name: 'Missing'
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: 'No feed found with name "Missing".'
    });
  });

  it('serves time, feed, favorite, hot, and clicked article tools', async () => {
    const article = {
      id: 7,
      title: 'Security update',
      url: 'https://example.com/security',
      createdAt: '2026-07-31T08:00:00.000Z',
      content: 'Summary'
    };
    mocked.feedFindOne.mockResolvedValue({
      id: 2,
      feedName: 'Security',
      url: 'https://example.com/feed'
    });
    mocked.articleFindAll.mockResolvedValue([article]);
    await mcpController.postMcp(createRequest(), createResponse());

    const recent = await mocked.handlers.get('search_articles_by_time')({
      seconds: 3600,
      feedId: '2',
      status: 'unread'
    });
    const byFeed = await mocked.handlers.get('articles_by_feed_id')({
      feedId: 2,
      status: 'unread',
      seconds: 3600
    });
    const favorites = await mocked.handlers.get('favorite_articles')({
      feedId: '2',
      status: 'read',
      seconds: 3600
    });
    const hot = await mocked.handlers.get('hot_articles')({
      sort: 'DESC',
      status: 'unread'
    });
    const clicked = await mocked.handlers.get('search_clicked_articles')({
      feedId: '2',
      seconds: 3600
    });

    expect(recent.structuredContent.articles).toHaveLength(1);
    expect(byFeed.structuredContent.totalArticles).toBe(1);
    expect(favorites.structuredContent.totalFavorites).toBe(1);
    expect(hot.isError).toBe(true);
    expect(hot.structuredContent.error).toBe(
      'Failed to fetch hot articles.'
    );
    expect(clicked.structuredContent.totalClicked).toBe(1);
  });

  it('handles missing feeds before querying their articles', async () => {
    mocked.feedFindOne.mockResolvedValue(null);
    await mcpController.postMcp(createRequest(), createResponse());

    const result = await mocked.handlers.get('articles_by_feed_id')({
      feedId: 404,
      status: 'unread'
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent.error).toBe(
      'No feed found with ID 404.'
    );
    expect(mocked.articleFindAll).not.toHaveBeenCalled();
  });

  it('serves tag discovery and tag-based article tools', async () => {
    mocked.tagFindAll
      .mockResolvedValueOnce([{ name: 'security', count: 4 }])
      .mockResolvedValueOnce([{ articleId: 7 }, { articleId: null }])
      .mockResolvedValueOnce([{ name: 'security', count: 4 }])
      .mockResolvedValueOnce([{ name: 'security', count: 2 }]);
    mocked.articleFindAll
      .mockResolvedValueOnce([{ id: 7, title: 'Tagged article' }])
      .mockResolvedValueOnce([{ id: 7 }]);
    await mcpController.postMcp(createRequest(), createResponse());

    const popular = await mocked.handlers.get('popular_tags')();
    const tagged = await mocked.handlers.get('articles_by_tag')({
      tag: 'security'
    });
    const searched = await mocked.handlers.get('search_tag_by_keyword')({
      keyword: 'sec'
    });
    const clickedTags = await mocked.handlers.get('tags_clicked_articles')();

    expect(popular.structuredContent.popularTags).toHaveLength(1);
    expect(tagged.structuredContent.totalArticles).toBe(1);
    expect(searched.structuredContent.totalMatches).toBe(1);
    expect(clickedTags.structuredContent).toEqual({
      totalClickedArticles: 1,
      topTags: [{ name: 'security', count: 2 }]
    });
  });

  it('returns empty tag results without unnecessary article queries', async () => {
    mocked.tagFindAll.mockResolvedValue([]);
    mocked.articleFindAll.mockResolvedValue([]);
    await mcpController.postMcp(createRequest(), createResponse());

    const tagged = await mocked.handlers.get('articles_by_tag')({
      tag: 'missing'
    });
    const clickedTags = await mocked.handlers.get('tags_clicked_articles')();

    expect(tagged.structuredContent.totalArticles).toBe(0);
    expect(clickedTags.structuredContent).toEqual({
      totalClickedArticles: 0,
      topTags: []
    });
  });

  it('validates and returns category details', async () => {
    const category = {
      toJSON: vi.fn().mockReturnValue({
        id: 3,
        name: 'Technology',
        feeds: [{ id: 2 }]
      })
    };
    mocked.categoryFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(category);
    await mcpController.postMcp(createRequest(), createResponse());
    const categoryDetails = mocked.handlers.get('category_details');

    const missingInput = await categoryDetails({});
    const conflictingInput = await categoryDetails({
      categoryId: '3',
      categoryName: 'Technology'
    });
    const notFound = await categoryDetails({ categoryId: '404' });
    const found = await categoryDetails({ categoryName: 'Tech' });

    expect(missingInput.isError).toBe(true);
    expect(conflictingInput.isError).toBe(true);
    expect(notFound.isError).toBe(true);
    expect(found.structuredContent).toEqual({
      category: {
        id: 3,
        name: 'Technology',
        feeds: [{ id: 2 }]
      },
      totalFeeds: 1
    });
  });

  it('triggers crawling and maps crawl failures to MCP errors', async () => {
    await mcpController.postMcp(createRequest(), createResponse());
    const crawl = mocked.handlers.get('crawl');

    const success = await crawl();
    expect(success.structuredContent.success).toBe(true);
    expect(mocked.crawlRssLinks).toHaveBeenCalledOnce();

    mocked.crawlRssLinks.mockRejectedValue(new Error('crawler unavailable'));
    const failure = await crawl();
    expect(failure.isError).toBe(true);
    expect(failure.structuredContent.error).toBe(
      'Failed to trigger RSS crawl: crawler unavailable'
    );
  });

  it('reports transport failures unless a response was already sent', async () => {
    mocked.transportHandleRequest.mockRejectedValue(
      new Error('transport failed')
    );
    const unsentResponse = createResponse();

    await mcpController.postMcp(createRequest(), unsentResponse);

    expect(unsentResponse.status).toHaveBeenCalledWith(500);
    expect(unsentResponse.json).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error'
      },
      id: null
    });

    const sentResponse = createResponse();
    sentResponse.headersSent = true;
    await mcpController.postMcp(createRequest(), sentResponse);

    expect(sentResponse.status).not.toHaveBeenCalled();
  });

  it('returns a JSON-RPC method error for GET requests', async () => {
    const res = createResponse();

    await mcpController.getMcp(createRequest(), res);

    expect(res.writeHead).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.'
      },
      id: null
    }));
  });
});
