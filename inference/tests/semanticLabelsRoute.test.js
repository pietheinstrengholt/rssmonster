import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { SemanticLabelInputError } from '../src/semanticLabels/semanticLabelService.js';

const createProvider = () => ({
  embed: vi.fn(),
  getMetadata: () => ({ provider: 'test', modelId: 'test', dimensions: 1 }),
  isLoaded: () => true
});

describe('semantic labels route', () => {
  it('passes generic context, selectors, cancellation, and request identity to the service', async () => {
    const semanticLabelService = vi.fn().mockResolvedValue({
      event: 'OpenAI Releases New Model'
    });
    const app = createApp({
      provider: createProvider(),
      semanticLabelService
    });
    const input = {
      context: { titles: ['OpenAI releases a new model'] },
      event: true
    };

    const response = await request(app)
      .post('/api/semantic-labels')
      .set('X-Request-ID', 'semantic-route-request')
      .send(input);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ event: 'OpenAI Releases New Model' });
    expect(semanticLabelService).toHaveBeenCalledWith(input, {
      requestId: 'semantic-route-request',
      signal: expect.any(AbortSignal)
    });
  });

  it('returns a safe validation error without running provider error handling', async () => {
    const semanticLabelService = vi.fn().mockRejectedValue(
      new SemanticLabelInputError('context is required')
    );
    const logger = { error: vi.fn() };

    const response = await request(createApp({
      provider: createProvider(),
      semanticLabelService,
      logger
    }))
      .post('/api/semantic-labels')
      .send({ event: true });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'context is required' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reuses the stable queue-overload response contract', async () => {
    const error = new Error('full');
    error.code = 'INFERENCE_QUEUE_FULL';
    const semanticLabelService = vi.fn().mockRejectedValue(error);

    const response = await request(createApp({
      provider: createProvider(),
      semanticLabelService
    }))
      .post('/api/semantic-labels')
      .set('X-Request-ID', 'semantic-overload')
      .send({ context: 'Evidence', topic: true });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'inference_queue_full' });
    expect(response.headers['retry-after']).toBe('5');
    expect(response.headers['x-request-id']).toBe('semantic-overload');
  });

  it('keeps provider failures and supplied context out of responses and logs', async () => {
    const privateMarker = 'private evidence token=secret';
    const semanticLabelService = vi.fn().mockRejectedValue(new Error(privateMarker));
    const logger = { error: vi.fn() };

    const response = await request(createApp({
      provider: createProvider(),
      semanticLabelService,
      logger
    }))
      .post('/api/semantic-labels')
      .set('X-Request-ID', 'semantic-error')
      .send({ context: privateMarker, island: true });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Semantic labeling failed' });
    expect(JSON.stringify(response.body)).not.toContain(privateMarker);
    expect(logger.error).toHaveBeenCalledWith(
      '[INFERENCE] Semantic labeling failed requestId=semantic-error:',
      { name: 'Error' }
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(privateMarker);
  });
});
