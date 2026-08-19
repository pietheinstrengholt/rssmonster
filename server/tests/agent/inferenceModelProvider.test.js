import { describe, expect, it, vi } from 'vitest';
import { createInferenceModelProvider } from '../../services/agent/inferenceModelProvider.js';

describe('inference agent model provider', () => {
  it('maps non-streaming model requests to inference without serializing AbortSignal', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [],
      responseId: 'response-1'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const model = createInferenceModelProvider({ fetchImplementation }).getModel();
    const signal = AbortSignal.timeout(1000);

    await expect(model.getResponse({ input: 'Hello', signal })).resolves.toMatchObject({
      responseId: 'response-1'
    });
    const body = JSON.parse(fetchImplementation.mock.calls[0][1].body);
    expect(body.request).toEqual({ input: 'Hello' });
  });

  it('decodes streamed NDJSON model events', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"started"}\n{"type":"done"}\n'));
        controller.close();
      }
    });
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    const model = createInferenceModelProvider({ fetchImplementation }).getModel();

    await expect(Array.fromAsync(model.getStreamedResponse({ input: 'Hello' })))
      .resolves.toEqual([{ type: 'started' }, { type: 'done' }]);
  });
});
