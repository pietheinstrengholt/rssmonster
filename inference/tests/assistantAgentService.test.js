import { describe, expect, it, vi } from 'vitest';
import { createAssistantAgentService } from '../src/assistant/assistantAgentService.js';

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
const definition = { name: 'current_time', description: 'Current server time',
  parameters: { type: 'object', properties: {}, additionalProperties: false } };
const input = { input: 'What time is it?', tools: [definition], toolToken: 'private-callback-token' };

const createModel = requests => ({
  async *getStreamedResponse(request) {
    requests.push(request);
    if (requests.length === 1) {
      yield { type: 'response_done', response: { id: 'r1', usage,
        output: [{ type: 'function_call', callId: 'call1', name: 'current_time', arguments: '{}' }] } };
    } else {
      yield { type: 'output_text_delta', delta: '<p>Now</p>' };
      yield { type: 'response_done', response: { id: 'r2', usage,
        output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '<p>Now</p>' }] }] } };
    }
  }
});

describe('inference agent runtime', () => {
  it('runs the real SDK loop and returns remote tool results to the model', async () => {
    const requests = [];
    const fetchImplementation = vi.fn(async () => ({ ok: true, json: async () => ({ result: { ok: true, data: { now: '2026-10-11T12:00:00Z' } } }) }));
    const service = createAssistantAgentService({
      environment: { ASSISTANT_TOOL_URL: 'http://server:3000/api/agent/tools', ASSISTANT_REASONING_EFFORT: 'high' },
      modelService: { getModel: () => createModel(requests) }, fetchImplementation
    });
    const events = await Array.fromAsync(service.stream(input));
    expect(events).toContainEqual({ type: 'text', output: '<p>Now</p>' });
    expect(events).toContainEqual({ type: 'tool_status', name: 'current_time', status: 'started' });
    expect(events).toContainEqual({ type: 'tool_status', name: 'current_time', status: 'completed' });
    expect(events.at(-1)).toMatchObject({ type: 'complete', finalOutput: '<p>Now</p>',
      toolResults: [{ name: 'current_time', result: { ok: true } }],
      toolDurations: [{ name: 'current_time', durationMs: expect.any(Number) }] });
    expect(JSON.stringify(requests[1].input)).toContain('2026-10-11T12:00:00Z');
    expect(requests[0].modelSettings.reasoning.effort).toBe('high');
    expect(JSON.stringify(requests)).not.toContain(input.toolToken);
    expect(fetchImplementation).toHaveBeenCalledWith('http://server:3000/api/agent/tools', expect.objectContaining({
      redirect: 'error', headers: expect.objectContaining({ Authorization: `Bearer ${input.toolToken}` }),
      body: JSON.stringify({ name: 'current_time', input: {} })
    }));
  });

  it.each([401, 403, 500])('fails on callback HTTP %s without inventing results', async status => {
    const service = createAssistantAgentService({ environment: {},
      modelService: { getModel: () => createModel([]) },
      fetchImplementation: async () => ({ ok: false, status }) });
    await expect(Array.fromAsync(service.stream(input))).rejects.toThrow('Assistant tool request failed');
  });

  it('rejects malformed callback output', async () => {
    const service = createAssistantAgentService({ environment: {}, modelService: { getModel: () => createModel([]) },
      fetchImplementation: async () => ({ ok: true, json: async () => ({}) }) });
    await expect(Array.fromAsync(service.stream(input))).rejects.toThrow('Invalid assistant tool response');
  });

  it.each(['file:///private', 'http://user:secret@server/tools', 'http://server/tools?token=secret'])('rejects an unsafe configured callback URL', async url => {
    const service = createAssistantAgentService({ environment: { ASSISTANT_TOOL_URL: url } });
    await expect(Array.fromAsync(service.stream(input))).rejects.toThrow('Invalid ASSISTANT_TOOL_URL');
  });

  it('requires a valid run and callback token', async () => {
    const service = createAssistantAgentService({ environment: {} });
    await expect(Array.fromAsync(service.stream({}))).rejects.toThrow('Invalid assistant run');
  });

  it('propagates cancellation to the database tool request', async () => {
    const controller = new AbortController();
    const service = createAssistantAgentService({ environment: {}, modelService: { getModel: () => createModel([]) },
      fetchImplementation: async (_url, { signal }) => {
        controller.abort();
        expect(signal.aborted).toBe(true);
        signal.throwIfAborted();
      } });
    await expect(Array.fromAsync(service.stream(input, { signal: controller.signal }))).rejects.toThrow();
  });
});
