import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('../../services/inference/inferenceClient.js', async importOriginal => ({
  ...await importOriginal(), requestInferenceStream: transport.stream
}));
const { postAgent } = await import('../../controllers/agent.js');

const response = () => {
  const res = { headersSent: false, writableEnded: false, destroyed: false,
    on: vi.fn(), setHeader: vi.fn(), write: vi.fn(), end: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.flushHeaders = () => { res.headersSent = true; };
  return res;
};
const completion = { type: 'complete', finalOutput: '<p>Answer</p>', agentSetupMs: 1,
  toolResults: [], toolDurations: [] };

describe('inference-owned agent controller', () => {
  beforeEach(() => {
    transport.stream.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    transport.stream.mockImplementation(async function* () { yield completion; });
  });

  it('rejects requests without an authenticated user', async () => {
    const res = response();
    await postAgent({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(transport.stream).not.toHaveBeenCalled();
  });

  it('sends bounded semantic history and tool definitions to inference', async () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user', content: `<p>${'a'.repeat(1300)}</p>`
    }));
    messages.push({ role: 'user', content: 'Latest question' });
    const res = response();
    await postAgent({ userData: { userId: 42 }, body: { messages } }, res);
    const [path, payload, options] = transport.stream.mock.calls[0];
    expect(path).toBe('/api/assistant/run/stream');
    expect(payload.input).toBe('Latest question');
    expect(payload.chatHistory.length).toBeLessThanOrEqual(12);
    expect(payload.chatHistory.reduce((sum, item) => sum + item.content.length, 0)).toBeLessThanOrEqual(8000);
    expect(payload.chatHistory.filter(item => item.role === 'assistant').every(item => !item.content.includes('<p>'))).toBe(true);
    expect(payload.tools).toHaveLength(19);
    expect(payload.tools).toContainEqual(expect.objectContaining({ name: 'search_articles', parameters: expect.any(Object) }));
    expect(payload.toolToken).toEqual(expect.any(String));
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: complete'));
  });

  it('preserves tool progress, semantic history and sanitized HTML', async () => {
    transport.stream.mockImplementation(async function* () {
      yield { type: 'tool_status', name: 'search_articles', status: 'started' };
      yield { type: 'text', output: '<p>Answer</p><script>unsafe</script>' };
      yield { ...completion, finalOutput: '<p>Answer</p><script>unsafe</script>',
        toolResults: [{ name: 'search_articles', input: { query: 'news' }, result: { ok: true, data: { articles: [{ id: 9 }] } } }],
        toolDurations: [{ name: 'search_articles', durationMs: 2 }] };
    });
    const res = response();
    await postAgent({ userData: { userId: 42 }, body: { input: 'news' } }, res);
    const output = res.write.mock.calls.flat().join('');
    expect(output).toContain('event: tool_status');
    expect(output).toContain('event: timing');
    expect(output).toContain('articleIds');
    expect(output).toContain('event: history');
    expect(output).not.toContain('<script>');
    expect(output).not.toContain('unsafe');
    expect(res.end).toHaveBeenCalledOnce();
  });

  it.each(['error', 'truncated', 'transport'])('reports %s streams without publishing a completion', async mode => {
    transport.stream.mockImplementation(async function* () {
      if (mode === 'transport') throw Object.assign(new Error('Bearer secret'), { code: 'INFERENCE_UNAVAILABLE' });
      if (mode === 'error') yield { type: 'error', error: 'Bearer secret' };
    });
    const res = response();
    await postAgent({ userData: { userId: 42 }, body: { input: 'test' } }, res);
    const output = res.write.mock.calls.flat().join('');
    expect(output).toContain('event: error');
    expect(output).not.toContain('event: complete');
    expect(output).not.toContain('secret');
    expect(JSON.stringify(console.error.mock.calls)).not.toContain('Bearer secret');
  });

  it('cancels inference when the chat connection closes', async () => {
    const res = response();
    transport.stream.mockImplementation(async function* (_path, _payload, { signal }) {
      res.on.mock.calls.find(([event]) => event === 'close')[1]();
      expect(signal.aborted).toBe(true);
      yield completion;
    });
    await postAgent({ userData: { userId: 42 }, body: { input: 'test' } }, res);
  });
});
