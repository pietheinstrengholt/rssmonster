import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Op } from 'sequelize';

const articleAttributesForSummary = [
  'id',
  'title',
  'url',
  'author',
  'feedId',
  'publishedAt',
  'status',
  'favoriteInd',
  'contentSummaryBullets',
  'contentText'
];
const toolData = result => result.structuredContent.data;
const toolPagination = result => result.structuredContent.pagination;

const mocked = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  categoryFindAll: vi.fn(),
  categoryFindOne: vi.fn(),
  startUserCrawl: vi.fn(),
  feedFindAll: vi.fn(),
  feedFindOne: vi.fn(),
  handlers: new Map(),
  schemas: new Map(),
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
      mocked.schemas.set(name, configuration.at(-2));
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
      findAll: mocked.articleFindAll,
      sequelize: {
        escape: value => `'${String(value).replaceAll("'", "''")}'`,
        getDialect: () => 'sqlite'
      }
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
  startUserCrawl: mocked.startUserCrawl
}));

const mcpModule = await import('../../controllers/mcp.js');
const mcpController = mcpModule.default;

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
    mocked.schemas.clear();
    Object.entries(mocked)
      .filter(([, value]) => typeof value?.mockReset === 'function')
      .forEach(([, mock]) => mock.mockReset());
    mocked.serverConnect.mockResolvedValue(undefined);
    mocked.serverClose.mockResolvedValue(undefined);
    mocked.startUserCrawl.mockResolvedValue({
      userId: 42,
      crawlRunId: 91,
      status: 'running',
      reused: false,
      reason: null
    });
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

    expect(mocked.handlers.size).toBe(19);
    expect(mocked.handlers.has('categories')).toBe(true);
    expect(mocked.handlers.has('search_articles')).toBe(true);
    expect(mocked.handlers.has('search_articles_by_keyword')).toBe(true);
    expect(mocked.handlers.has('get_article_content')).toBe(true);
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

  it('keeps MCP routing instructions aligned with every registered tool', async () => {
    await mcpController.postMcp(createRequest(), createResponse());

    for (const toolName of mocked.handlers.keys()) {
      expect(mcpModule.RSSMONSTER_MCP_INSTRUCTIONS).toContain(`- ${toolName}:`);
    }
    expect(mcpModule.RSSMONSTER_MCP_INSTRUCTIONS).toContain('Neutral status is all');
    expect(mcpModule.RSSMONSTER_MCP_INSTRUCTIONS).toContain('search_feed_by_name: return ranked');
    expect(mcpModule.RSSMONSTER_MCP_INSTRUCTIONS).not.toContain('clicked by the user (clickedAmount > 0).\n      - Optionally filter');
    expect(mcpModule.RSSMONSTER_MCP_INSTRUCTIONS).not.toContain('internal cache of URLs');
  });

  it('uses camelCase positive-integer identifier arguments consistently', async () => {
    await mcpController.postMcp(createRequest(), createResponse());

    const feedTools = [
      'search_articles_by_keyword',
      'search_articles_by_time',
      'articles_by_feed_id',
      'favorite_articles',
      'search_clicked_articles'
    ];
    for (const toolName of feedTools) {
      const feedId = mocked.schemas.get(toolName).feedId;
      expect(feedId.safeParse(2).success).toBe(true);
      expect(feedId.safeParse('2').success).toBe(false);
      expect(feedId.safeParse(0).success).toBe(false);
    }

    const feedsByCategorySchema = mocked.schemas.get('feeds_by_category_id');
    expect(feedsByCategorySchema).toHaveProperty('categoryId');
    expect(feedsByCategorySchema).not.toHaveProperty('category_id');
    expect(feedsByCategorySchema.categoryId.safeParse(3).success).toBe(true);
    expect(feedsByCategorySchema.categoryId.safeParse('3').success).toBe(false);

    const categoryId = mocked.schemas.get('category_details').categoryId;
    expect(categoryId.safeParse(3).success).toBe(true);
    expect(categoryId.safeParse(-1).success).toBe(false);

    const articleIds = mocked.schemas.get('get_article_content').articleIds;
    expect(articleIds.safeParse([7]).success).toBe(true);
    expect(articleIds.safeParse(['7']).success).toBe(false);
    expect(articleIds.safeParse([0]).success).toBe(false);

    const canonicalSearch = mocked.schemas.get('search_articles');
    for (const field of ['feedIds', 'categoryIds']) {
      expect(canonicalSearch[field].safeParse([2, 3]).success).toBe(true);
      expect(canonicalSearch[field].safeParse(['2']).success).toBe(false);
      expect(canonicalSearch[field].safeParse([0]).success).toBe(false);
    }
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
    expect(result.structuredContent).toEqual({ ok: true, data: { categories } });
    expect(result.content[0].text).toBe(JSON.stringify({
      ok: true,
      data: { categories }
    }));
    expect(result.isError).toBe(false);
  });

  it('turns category query failures into MCP tool errors', async () => {
    mocked.categoryFindAll.mockRejectedValue(new Error('database unavailable'));
    await mcpController.postMcp(createRequest(), createResponse());

    const result = await mocked.handlers.get('categories')();

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: 'TOOL_ERROR',
        message: 'Failed to fetch categories.'
      }
    });
  });

  it('turns dependency failures from every data tool into MCP errors', async () => {
    mocked.articleFindAll.mockRejectedValue(new Error('article query unavailable'));
    mocked.categoryFindAll.mockRejectedValue(new Error('category query unavailable'));
    mocked.categoryFindOne.mockRejectedValue(new Error('category lookup unavailable'));
    mocked.feedFindAll.mockRejectedValue(new Error('feed query unavailable'));
    mocked.feedFindOne.mockRejectedValue(new Error('feed lookup unavailable'));
    mocked.tagFindAll.mockRejectedValue(new Error('tag query unavailable'));
    await mcpController.postMcp(createRequest(), createResponse());

    const toolCalls = [
      ['feeds', {}],
      ['search_feed_by_name', { feedName: 'Security' }],
      ['search_articles', { query: 'security', status: 'all', sort: 'published_desc' }],
      ['search_articles_by_keyword', { search: 'security', status: 'unread' }],
      ['search_articles_by_time', { from: '2026-07-01T00:00:00.000Z', status: 'unread' }],
      ['articles_by_feed_id', { feedId: 2, status: 'unread' }],
      ['favorite_articles', { status: 'read' }],
      ['hot_articles', { sort: 'DESC', status: 'unread' }],
      ['feeds_by_category_id', { categoryId: 3 }],
      ['popular_tags', {}],
      ['articles_by_tag', { tag: 'security' }],
      ['search_tag_by_keyword', { keyword: 'sec' }],
      ['search_clicked_articles', {}],
      ['tags_clicked_articles', {}],
      ['category_details', { categoryId: 3 }],
      ['get_article_content', { articleIds: [7], format: 'text' }]
    ];

    // Invokes each registered data tool with valid input so its dependency error path runs.
    const results = await Promise.all(toolCalls.map(([name, input]) => (
      mocked.handlers.get(name)(input)
    )));

    expect(results).toHaveLength(toolCalls.length);
    expect(results.every(result => result.isError)).toBe(true);
    expect(results.every(result => (
      result.structuredContent.ok === false &&
      result.structuredContent.error.code === 'TOOL_ERROR' &&
      typeof result.structuredContent.error.message === 'string'
    ))).toBe(true);
  });

  it('combines canonical article search filters in one bounded user-scoped query', async () => {
    mocked.articleFindAll.mockResolvedValue([{
      id: 7,
      title: 'AI security update',
      feedId: 2,
      contentText: 'A compact article body.',
      contentSummaryBullets: ['One point'],
      'feed.feedName': 'The Verge',
      publishedAt: '2026-07-15T10:00:00.000Z',
      status: 'unread',
      favoriteInd: 0
    }]);
    await mcpController.postMcp(createRequest(), createResponse());

    const result = await mocked.handlers.get('search_articles')({
      query: 'AI security',
      feedIds: [2, 3, 2],
      categoryIds: [4],
      tags: ['privacy', 'security'],
      status: 'unread',
      favorite: false,
      hot: true,
      clicked: true,
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
      dateBasis: 'published',
      sort: 'published_desc',
      limit: 15,
      detail: 'summary'
    });

    const query = mocked.articleFindAll.mock.calls[0][0];
    expect(query).toMatchObject({
      attributes: articleAttributesForSummary,
      order: [['publishedAt', 'DESC'], ['id', 'DESC']],
      limit: 16,
      offset: 0,
      raw: true
    });
    expect(query.where).toMatchObject({
      userId: 42,
      status: 'unread',
      favoriteInd: 0,
      hotInd: 1
    });
    expect(query.where.feedId[Op.in]).toEqual([2, 3]);
    expect(query.where.clickedAmount[Op.gt]).toBe(0);
    expect(query.where.publishedAt[Op.between]).toEqual([
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-08-01T00:00:00.000Z')
    ]);
    expect(query.where.id[Op.in].val).toContain('HAVING COUNT(DISTINCT name) = 2');
    expect(query.where.id[Op.in].val).toContain("'privacy', 'security'");
    expect(query.where[Op.and]).toHaveLength(2);
    expect(query.include[0]).toMatchObject({
      required: true,
      where: { userId: 42 }
    });
    expect(query.include[0].where.categoryId[Op.in]).toEqual([4]);
    expect(toolData(result)).toMatchObject({
      filters: {
        query: 'AI security',
        feedIds: [2, 3],
        categoryIds: [4],
        tags: ['privacy', 'security'],
        status: 'unread',
        favorite: false,
        hot: true,
        clicked: true,
        dateBasis: 'published'
      },
      sort: 'published_desc'
    });
    expect(toolPagination(result)).toEqual({
      limit: 15,
      returnedCount: 1,
      hasMore: false,
      nextCursor: null
    });
  });

  it('returns compact keyword search results without full HTML or duplicate text payloads', async () => {
    const articles = [
      {
        id: 7,
        title: 'Security update',
        url: 'https://example.com/security',
        author: 'Reporter',
        contentText: '  A detailed summary with\nextra whitespace.  ',
        contentHtml: '<p>Must not be exposed</p>',
        contentOriginal: '<script>Must never be exposed</script>',
        contentSummaryBullets: ['First point'],
        feedId: 2,
        'feed.feedName': 'Security Feed',
        status: 'unread',
        favoriteInd: 0,
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
        attributes: [
          'id',
          'title',
          'url',
          'author',
          'feedId',
          'publishedAt',
          'status',
          'favoriteInd',
          'contentSummaryBullets',
          'contentText'
        ],
        where: expect.objectContaining({
          userId: 42,
          status: 'unread',
          filteredInd: false
        })
      })
    );
    expect(toolData(result).totalResults).toBe(1);
    const textConditions = mocked.articleFindAll.mock.calls[0][0].where[Op.and];
    expect(textConditions[0][Op.or].map(condition => condition.attribute.args[0].col))
      .toEqual(['title', 'contentText']);
    expect(toolData(result).articles[0]).toEqual({
      id: 7,
      title: 'Security update',
      url: 'https://example.com/security',
      author: 'Reporter',
      feedId: 2,
      feedName: 'Security Feed',
      publishedAt: '2026-07-31T08:00:00.000Z',
      status: 'unread',
      favoriteInd: 0,
      summaryBullets: ['First point'],
      contentExcerpt: 'A detailed summary with extra whitespace.'
    });
    expect(toolData(result)).not.toHaveProperty('htmlOutput');
    expect(result.content[0].text).toBe(
      'Returned 1 compact article result. Use structuredContent for the article data.'
    );
    expect(JSON.stringify(result)).not.toContain('Must not be exposed');
  });

  it('returns only the explicitly requested article content representation', async () => {
    mocked.articleFindAll
      .mockResolvedValueOnce([{
        id: 7,
        title: 'Security update',
        url: 'https://example.com/security',
        feedId: 2,
        contentText: 'Plain article content',
        contentHtml: '<p>Unexpected HTML</p>'
      }])
      .mockResolvedValueOnce([{
        id: 7,
        title: 'Security update',
        url: 'https://example.com/security',
        feedId: 2,
        contentText: 'Unexpected text',
        contentHtml: '<p>Sanitized article content</p>'
      }]);
    await mcpController.postMcp(createRequest(), createResponse());
    const getArticleContent = mocked.handlers.get('get_article_content');

    const textResult = await getArticleContent({ articleIds: [7], format: 'text' });
    expect(mocked.articleFindAll).toHaveBeenNthCalledWith(1, expect.objectContaining({
      attributes: [
        'id', 'title', 'url', 'author', 'feedId', 'publishedAt', 'contentText'
      ],
      where: expect.objectContaining({ userId: 42, filteredInd: false })
    }));
    expect(toolData(textResult).articles[0]).toHaveProperty(
      'contentText',
      'Plain article content'
    );
    expect(toolData(textResult).articles[0]).not.toHaveProperty('contentHtml');

    const htmlResult = await getArticleContent({ articleIds: [7], format: 'html' });
    expect(mocked.articleFindAll).toHaveBeenNthCalledWith(2, expect.objectContaining({
      attributes: [
        'id', 'title', 'url', 'author', 'feedId', 'publishedAt', 'contentHtml'
      ]
    }));
    expect(toolData(htmlResult).articles[0]).toHaveProperty(
      'contentHtml',
      '<p>Sanitized article content</p>'
    );
    expect(toolData(htmlResult).articles[0]).not.toHaveProperty('contentText');
  });

  it('bounds article pages, returns continuation cursors, and honors detail levels', async () => {
    const articles = Array.from({ length: 16 }, (_, index) => ({
      id: 100 - index,
      title: `Article ${index + 1}`,
      feedId: 2,
      contentSummaryBullets: ['Summary'],
      contentText: `Content ${index + 1}`
    }));
    mocked.articleFindAll
      .mockResolvedValueOnce(articles)
      .mockResolvedValueOnce(articles.slice(15))
      .mockResolvedValueOnce(articles.slice(0, 11));
    await mcpController.postMcp(createRequest(), createResponse());
    const search = mocked.handlers.get('search_articles_by_keyword');

    const firstPage = await search({
      search: 'article',
      status: 'unread',
      limit: 15,
      detail: 'metadata'
    });
    expect(mocked.articleFindAll).toHaveBeenNthCalledWith(1, expect.objectContaining({
      attributes: [
        'id', 'title', 'url', 'author', 'feedId', 'publishedAt', 'status', 'favoriteInd'
      ],
      limit: 16,
      offset: 0
    }));
    expect(toolData(firstPage)).toMatchObject({
      detail: 'metadata',
      totalResults: 15
    });
    expect(toolPagination(firstPage)).toEqual({
      limit: 15,
      returnedCount: 15,
      hasMore: true,
      nextCursor: expect.any(String)
    });
    expect(toolData(firstPage).articles[0]).not.toHaveProperty('contentExcerpt');

    const secondPage = await search({
      search: 'article',
      status: 'unread',
      limit: 15,
      cursor: toolPagination(firstPage).nextCursor,
      detail: 'metadata'
    });
    expect(mocked.articleFindAll).toHaveBeenNthCalledWith(2, expect.objectContaining({
      limit: 16,
      offset: 15
    }));
    expect(toolPagination(secondPage)).toEqual({
      limit: 15,
      returnedCount: 1,
      hasMore: false,
      nextCursor: null
    });

    const fullPage = await search({
      search: 'article',
      status: 'unread',
      limit: 50,
      detail: 'full'
    });
    expect(mocked.articleFindAll).toHaveBeenNthCalledWith(3, expect.objectContaining({
      limit: 11,
      offset: 0
    }));
    expect(toolData(fullPage)).toMatchObject({ detail: 'full' });
    expect(toolPagination(fullPage)).toEqual({
      limit: 10,
      returnedCount: 10,
      hasMore: true,
      nextCursor: expect.any(String)
    });
    expect(toolData(fullPage).articles[0]).toHaveProperty('contentText');
    expect(toolData(fullPage).articles[0]).not.toHaveProperty('contentExcerpt');
  });

  it('serves feed discovery and time tools with user scoping', async () => {
    const feeds = [
      { id: 3, feedName: 'Security Weekly', url: 'https://weekly.example', 'Category.name': 'News' },
      { id: 2, feedName: 'Security', url: 'https://security.example', 'Category.name': 'Technology' },
      { id: 4, feedName: 'Application Security', url: 'https://appsec.example', 'Category.name': 'Engineering' }
    ];
    mocked.feedFindAll.mockResolvedValue(feeds);
    mocked.feedFindOne.mockResolvedValue(feeds[0]);
    await mcpController.postMcp(createRequest(), createResponse());

    const feedList = await mocked.handlers.get('feeds')();
    const feedSearch = await mocked.handlers.get('search_feed_by_name')({
      feedName: 'Security'
    });
    const categoryFeeds = await mocked.handlers.get('feeds_by_category_id')({
      categoryId: 3
    });
    const currentTime = await mocked.handlers.get('current_time')();

    expect(toolData(feedList)).toEqual({ feeds });
    expect(toolData(feedSearch)).toEqual({
      query: 'Security',
      totalMatches: 3,
      matches: [
        { id: 2, name: 'Security', categoryName: 'Technology', url: 'https://security.example' },
        { id: 3, name: 'Security Weekly', categoryName: 'News', url: 'https://weekly.example' },
        { id: 4, name: 'Application Security', categoryName: 'Engineering', url: 'https://appsec.example' }
      ]
    });
    expect(toolData(categoryFeeds)).toEqual({ feeds });
    expect(toolData(currentTime).now).toMatch(
      /^\d{4}-\d{2}-\d{2}T/
    );
    expect(mocked.feedFindAll).toHaveBeenCalledWith({
      where: { categoryId: 3, userId: 42 },
      order: [['feedName', 'ASC']],
      raw: true
    });
  });

  it('returns an empty ranked feed match list when discovery finds no match', async () => {
    mocked.feedFindAll.mockResolvedValue([]);
    await mcpController.postMcp(createRequest(), createResponse());

    const result = await mocked.handlers.get('search_feed_by_name')({
      feedName: 'Missing'
    });

    expect(result.isError).toBe(false);
    expect(toolData(result)).toEqual({
      query: 'Missing',
      totalMatches: 0,
      matches: []
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
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
      feedId: 2,
      status: 'unread'
    });
    const byFeed = await mocked.handlers.get('articles_by_feed_id')({
      feedId: 2,
      status: 'unread',
      from: '2026-07-01T00:00:00.000Z'
    });
    const favorites = await mocked.handlers.get('favorite_articles')({
      feedId: 2,
      status: 'read'
    });
    const hot = await mocked.handlers.get('hot_articles')({
      sort: 'DESC',
      status: 'unread'
    });
    const clicked = await mocked.handlers.get('search_clicked_articles')({
      feedId: 2
    });

    expect(toolData(recent).articles).toHaveLength(1);
    expect(toolData(byFeed).totalArticles).toBe(1);
    expect(toolData(favorites).totalFavorites).toBe(1);
    expect(hot.isError).toBe(false);
    expect(toolData(hot).totalHotArticles).toBe(1);
    expect(toolData(clicked).totalClicked).toBe(1);
  });

  it('does not expose unsupported favorite or click event-time filters', async () => {
    mocked.articleFindAll.mockResolvedValue([]);
    await mcpController.postMcp(createRequest(), createResponse());

    await mocked.handlers.get('favorite_articles')({ status: 'unread' });
    const favoriteQuery = mocked.articleFindAll.mock.calls.at(-1)[0];
    await mocked.handlers.get('search_clicked_articles')({});
    const clickedQuery = mocked.articleFindAll.mock.calls.at(-1)[0];

    for (const toolName of ['favorite_articles', 'search_clicked_articles']) {
      expect(mocked.schemas.get(toolName)).not.toHaveProperty('from');
      expect(mocked.schemas.get(toolName)).not.toHaveProperty('to');
      expect(mocked.schemas.get(toolName)).not.toHaveProperty('dateBasis');
    }
    expect(favoriteQuery.where).not.toHaveProperty('updatedAt');
    expect(clickedQuery.where).not.toHaveProperty('updatedAt');
    expect(favoriteQuery.order[0]).toEqual(['publishedAt', 'DESC']);
    expect(clickedQuery.order[0]).toEqual(['publishedAt', 'DESC']);
  });

  it('defaults neutral article retrieval and favorites to all read statuses', async () => {
    mocked.articleFindAll.mockResolvedValue([]);
    mocked.feedFindOne.mockResolvedValue({ id: 2, feedName: 'Security' });
    await mcpController.postMcp(createRequest(), createResponse());

    const calls = [
      ['search_articles_by_keyword', { search: 'security' }],
      ['search_articles_by_time', { from: '2026-07-01T00:00:00.000Z' }],
      ['articles_by_feed_id', { feedId: 2 }],
      ['favorite_articles', {}],
      ['hot_articles', { sort: 'DESC' }]
    ];
    for (const [name, input] of calls) {
      expect(mocked.schemas.get(name).status.parse(undefined)).toBe('all');
      await mocked.handlers.get(name)(input);
      expect(mocked.articleFindAll.mock.calls.at(-1)[0].where).not.toHaveProperty('status');
    }
  });

  it('defaults date filtering to publishedAt and supports explicit date bases', async () => {
    mocked.articleFindAll.mockResolvedValue([]);
    mocked.feedFindOne.mockResolvedValue({
      id: 2,
      feedName: 'Security',
      url: 'https://example.com/feed'
    });
    await mcpController.postMcp(createRequest(), createResponse());

    const published = await mocked.handlers.get('search_articles_by_time')({
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.000Z',
      status: 'unread'
    });
    const modified = await mocked.handlers.get('articles_by_feed_id')({
      feedId: 2,
      status: 'unread',
      from: '2026-07-01T00:00:00.000Z',
      dateBasis: 'modified'
    });

    const publishedQuery = mocked.articleFindAll.mock.calls[0][0];
    const modifiedQuery = mocked.articleFindAll.mock.calls[1][0];
    expect(publishedQuery.where.publishedAt).toBeDefined();
    expect(publishedQuery.where.createdAt).toBeUndefined();
    expect(publishedQuery.order[0]).toEqual(['publishedAt', 'DESC']);
    expect(toolData(published)).toEqual(expect.objectContaining({
      dateBasis: 'published',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.000Z'
    }));
    expect(modifiedQuery.where.modifiedAt).toBeDefined();
    expect(modifiedQuery.order[0]).toEqual(['modifiedAt', 'DESC']);
    expect(toolData(modified).dateBasis).toBe('modified');
  });

  it('queries hot articles by the persisted hot flag without an obsolete URL filter', async () => {
    mocked.articleFindAll.mockResolvedValue([]);
    await mcpController.postMcp(createRequest(), createResponse());

    const result = await mocked.handlers.get('hot_articles')({
      sort: 'DESC',
      status: 'unread'
    });

    expect(result.isError).toBe(false);
    expect(mocked.articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        filteredInd: false,
        hotInd: 1,
        status: 'unread',
        userId: 42
      })
    }));
    expect(mocked.articleFindAll.mock.calls.at(-1)[0].where).not.toHaveProperty('url');
  });

  it('handles missing feeds before querying their articles', async () => {
    mocked.feedFindOne.mockResolvedValue(null);
    await mcpController.postMcp(createRequest(), createResponse());

    const result = await mocked.handlers.get('articles_by_feed_id')({
      feedId: 404,
      status: 'unread'
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent.error.message).toBe(
      'No feed found with ID 404.'
    );
    expect(mocked.articleFindAll).not.toHaveBeenCalled();
  });

  it('serves tag discovery and tag-based article tools', async () => {
    mocked.tagFindAll
      .mockResolvedValueOnce([{ name: 'security', count: 4 }])
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

    expect(toolData(popular).popularTags).toHaveLength(1);
    expect(toolData(tagged).totalArticles).toBe(1);
    expect(toolData(searched).totalMatches).toBe(1);
    expect(toolData(clickedTags)).toEqual({
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

    expect(toolData(tagged).totalArticles).toBe(0);
    expect(toolData(clickedTags)).toEqual({
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
      categoryId: 3,
      categoryName: 'Technology'
    });
    const notFound = await categoryDetails({ categoryId: 404 });
    const found = await categoryDetails({ categoryName: 'Tech' });

    expect(missingInput.isError).toBe(true);
    expect(conflictingInput.isError).toBe(true);
    expect(notFound.isError).toBe(true);
    expect(toolData(found)).toEqual({
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
    expect(toolData(success)).toMatchObject({
      crawlRunId: 91,
      status: 'running',
      reused: false,
      reason: null
    });
    expect(mocked.startUserCrawl).toHaveBeenCalledWith(42, {
      triggerType: 'api'
    });

    mocked.startUserCrawl.mockRejectedValue(new Error('crawler unavailable'));
    const failure = await crawl();
    expect(failure.isError).toBe(true);
    expect(failure.structuredContent.error.message).toBe(
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
