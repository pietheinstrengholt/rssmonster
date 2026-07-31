import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  agentConstructor: vi.fn(),
  close: vi.fn(),
  connect: vi.fn(),
  mcpConstructor: vi.fn(),
  run: vi.fn()
}));

vi.mock('@openai/agents', () => ({
  Agent: class Agent {
    // Captures the agent configuration without invoking the OpenAI service.
    constructor(options) {
      mocked.agentConstructor(options);
      Object.assign(this, options);
    }
  },
  MCPServerStreamableHttp: class MCPServerStreamableHttp {
    // Captures the MCP connection configuration and supplies lifecycle spies.
    constructor(options) {
      mocked.mcpConstructor(options);
      this.connect = mocked.connect;
      this.close = mocked.close;
    }
  },
  run: mocked.run
}));

const { postAgent } = await import('../../controllers/agent.js');

// Builds the request contract consumed by the agent endpoint.
const createRequest = (overrides = {}) => ({
  headers: { authorization: 'Bearer signed-token' },
  protocol: 'https',
  get: vi.fn().mockReturnValue('reader.example.com'),
  body: { input: 'Summarize my feeds' },
  ...overrides
});

// Builds the chainable response contract used by the agent endpoint.
const createResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

describe('agent controller', () => {
  beforeEach(() => {
    Object.values(mocked).forEach(mock => mock.mockReset());
    mocked.connect.mockResolvedValue(undefined);
    mocked.close.mockResolvedValue(undefined);
  });

  it('rejects requests that cannot authenticate the downstream MCP call', async () => {
    const res = createResponse();

    await postAgent(
      createRequest({ headers: {} }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocked.mcpConstructor).not.toHaveBeenCalled();
  });

  it('runs the last user message with the complete chat history', async () => {
    mocked.run.mockResolvedValue({ finalOutput: '<p>Latest articles</p>' });
    const messages = [
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content: 'Latest question' }
    ];
    const req = createRequest({
      body: {
        input: 'Fallback input',
        messages
      }
    });
    const res = createResponse();

    await postAgent(req, res);

    expect(mocked.mcpConstructor).toHaveBeenCalledWith({
      url: 'https://reader.example.com/mcp',
      name: 'mcp-rssmonster-server',
      requestInit: {
        headers: {
          authorization: 'Bearer signed-token'
        }
      }
    });
    expect(mocked.agentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'RSS feeds management and retrieval assistant',
        mcpServers: [expect.any(Object)]
      })
    );
    expect(mocked.run).toHaveBeenCalledWith(
      expect.any(Object),
      'Latest question',
      { chatHistory: messages }
    );
    expect(mocked.close).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      output: '<p>Latest articles</p>'
    });
  });

  it('uses direct input when no message history is provided', async () => {
    mocked.run.mockResolvedValue({ finalOutput: 'Direct answer' });
    const res = createResponse();

    await postAgent(createRequest(), res);

    expect(mocked.run).toHaveBeenCalledWith(
      expect.any(Object),
      'Summarize my feeds',
      { chatHistory: [] }
    );
  });

  it('closes the MCP connection and reports agent failures', async () => {
    mocked.run.mockRejectedValue(new Error('OpenAI unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createResponse();

    await postAgent(createRequest(), res);

    expect(mocked.close).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'OpenAI unavailable' });
  });
});
