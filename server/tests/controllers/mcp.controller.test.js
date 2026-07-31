import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  categoryFindAll: vi.fn(),
  categoryFindOne: vi.fn(),
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
    crawlRssLinks: vi.fn()
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
