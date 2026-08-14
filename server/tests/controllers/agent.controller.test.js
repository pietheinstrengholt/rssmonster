import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  agentConstructor: vi.fn(),
  run: vi.fn()
}));

vi.mock('@openai/agents', () => ({
  Agent: class Agent {
    constructor(options) {
      mocked.agentConstructor(options);
      Object.assign(this, options);
    }
  },
  run: mocked.run,
  tool: options => options
}));

const { postAgent } = await import('../../controllers/agent.js');

const createRequest = (overrides = {}) => ({
  userData: { userId: 42 },
  body: { input: 'Summarize my feeds' },
  ...overrides
});

const createResponse = () => {
  const res = {
    destroyed: false,
    headersSent: false,
    writableEnded: false,
    end: vi.fn(),
    flushHeaders: vi.fn(),
    on: vi.fn(),
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    write: vi.fn()
  };
  res.status.mockImplementation(() => res);
  res.json.mockReturnValue(res);
  res.flushHeaders.mockImplementation(() => { res.headersSent = true; });
  res.end.mockImplementation(() => { res.writableEnded = true; });
  return res;
};

const createStreamResult = (finalOutput, events = []) => ({
  finalOutput,
  completed: Promise.resolve(),
  async *[Symbol.asyncIterator]() {
    yield* events;
  }
});

describe('agent controller', () => {
  beforeEach(() => {
    Object.values(mocked).forEach(mock => mock.mockReset());
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('rejects requests without an authenticated user', async () => {
    const res = createResponse();

    await postAgent(createRequest({ userData: undefined }), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocked.agentConstructor).not.toHaveBeenCalled();
  });

  it('runs the last user message with shared in-process tools and complete chat history', async () => {
    mocked.run.mockResolvedValue(createStreamResult('<p>Latest articles</p>', [{
      type: 'raw_model_stream_event',
      data: { type: 'output_text_delta', delta: '<p>Latest articles</p>' }
    }]));
    const messages = [
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content: 'Latest question' }
    ];
    const res = createResponse();

    await postAgent(createRequest({ body: { input: 'Fallback input', messages } }), res);

    expect(mocked.agentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'RSS feeds management and retrieval assistant',
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'current_time' }),
          expect.objectContaining({ name: 'search_articles' }),
          expect.objectContaining({ name: 'search_articles_by_keyword' })
        ])
      })
    );
    expect(mocked.agentConstructor.mock.calls[0][0]).not.toHaveProperty('mcpServers');
    expect(mocked.agentConstructor.mock.calls[0][0].tools).toHaveLength(19);
    expect(mocked.run).toHaveBeenCalledWith(
      expect.any(Object),
      'Latest question',
      expect.objectContaining({ chatHistory: messages.slice(0, 2), stream: true })
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: text'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: complete'));
    expect(res.end).toHaveBeenCalledOnce();
  });

  it('excludes the active turn and compacts rendered assistant history', async () => {
    mocked.run.mockResolvedValue(createStreamResult('<p>Current answer</p>'));
    const messages = Array.from({ length: 8 }, (_value, index) => ([
      { role: 'user', content: `Question ${index} ${'q'.repeat(1300)}` },
      {
        role: 'assistant',
        content: `<div><a href="https://example.com/${index}">Answer ${index}</a> ${'a'.repeat(1300)}</div>`
      }
    ])).flat();
    messages.push({ role: 'user', content: 'Current question' });

    await postAgent(createRequest({ body: { messages } }), createResponse());

    const [agent, input, options] = mocked.run.mock.calls[0];
    expect(agent).toBeDefined();
    expect(input).toBe('Current question');
    expect(options.chatHistory.length).toBeLessThanOrEqual(12);
    expect(options.chatHistory.length).toBeGreaterThan(0);
    expect(options.chatHistory.at(-1).content).not.toContain('<div>');
    expect(options.chatHistory.at(-1).content).not.toContain('<a ');
    expect(options.chatHistory.every(message => message.content.length <= 1200)).toBe(true);
    expect(options.chatHistory.reduce((total, message) => total + message.content.length, 0))
      .toBeLessThanOrEqual(8000);
    expect(options.chatHistory).not.toContainEqual(expect.objectContaining({
      content: 'Current question'
    }));
  });

  it('makes structured data canonical while assigning presentation to the agent', async () => {
    mocked.run.mockResolvedValue(createStreamResult('<p>Answer</p>'));

    await postAgent(createRequest(), createResponse());

    const instructions = mocked.agentConstructor.mock.calls[0][0].instructions;
    expect(instructions).toContain('Structured tool results are the canonical source of facts');
    expect(instructions).toContain('You own the presentation');
    expect(instructions).toContain('Never request or reproduce publisher HTML');
    expect(instructions).toContain('get_article_content with format="text"');
    expect(instructions).not.toContain('reproduce MCP HTML exactly');
    expect(instructions).not.toContain('Do NOT ask the user for follow-up questions');
  });

  it('executes shared tools locally and records tool timing', async () => {
    mocked.run.mockImplementation(async agent => {
      const currentTime = agent.tools.find(agentTool => agentTool.name === 'current_time');
      const result = await currentTime.execute({});
      expect(result).toEqual({
        ok: true,
        data: { now: expect.any(String) }
      });
      return createStreamResult('Current time retrieved');
    });
    const res = createResponse();

    await postAgent(createRequest(), res);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"phase":"tool"'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: tool_status'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: timing'));
  });

  it('uses direct input when no message history is provided', async () => {
    mocked.run.mockResolvedValue(createStreamResult('Direct answer'));

    await postAgent(createRequest(), createResponse());

    expect(mocked.run).toHaveBeenCalledWith(
      expect.any(Object),
      'Summarize my feeds',
      expect.objectContaining({ chatHistory: [], stream: true })
    );
  });

  it('sanitizes rendered HTML while preserving RSSMonster article markup', async () => {
    mocked.run.mockResolvedValue(createStreamResult(
      '<h3>Articles</h3>'
        + '<div class="article-card unsafe"><h5 class="article-header">'
        + '<a class="article-link" href="https://example.com/article" target="_blank">Story</a>'
        + '</h5></div>'
        + '<script>window.pwned = true</script>'
        + '<a href="javascript:window.pwned = true" onclick="window.pwned = true">Unsafe</a>'
    ));
    const res = createResponse();

    await postAgent(createRequest(), res);

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining(
      JSON.stringify({ output: '<h3>Articles</h3>'
        + '<div class="article-card"><h5 class="article-header">'
        + '<a class="article-link" href="https://example.com/article" target="_blank" rel="noopener noreferrer">Story</a>'
        + '</h5></div><a>Unsafe</a>' })
    ));
  });

  it('reports agent failures without an MCP connection lifecycle', async () => {
    mocked.run.mockRejectedValue(new Error('OpenAI unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createResponse();

    await postAgent(createRequest(), res);

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: error'));
    expect(res.end).toHaveBeenCalledOnce();
  });
});
