import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createHttpBodyStream,
  createHttpRequest,
  createHttpResponse
} from '../../services/feeds/http/contracts.js';
import {
  RSSMONSTER_USER_AGENT,
  executeHttpRequest
} from '../../services/feeds/http/fetchTransport.js';
import { createOriginRequestPolicy } from '../../services/feeds/http/requestCoordination.js';
import {
  getFeedResponseMaxBytes,
  readResponseText
} from '../../services/feeds/http/responseBody.js';

const originalFeedResponseMaxBytes = process.env.FEED_RESPONSE_MAX_BYTES;
const originalInternalHostAllowlist =
  process.env.RSSMONSTER_INTERNAL_HOST_ALLOWLIST;

// Builds a neutral response whose body emits the provided chunks.
const responseWithChunks = ({ chunks, headers = {}, cancel = vi.fn() }) => {
  const pending = [...chunks];
  return createHttpResponse({
    status: 200,
    url: 'https://example.com/feed.xml',
    headers,
    body: createHttpBodyStream({
      read: async () => pending.length > 0
        ? { done: false, chunk: pending.shift() }
        : { done: true, chunk: null },
      cancel
    })
  });
};

afterEach(() => {
  if (originalFeedResponseMaxBytes === undefined) {
    delete process.env.FEED_RESPONSE_MAX_BYTES;
  } else {
    process.env.FEED_RESPONSE_MAX_BYTES = originalFeedResponseMaxBytes;
  }

  if (originalInternalHostAllowlist === undefined) {
    delete process.env.RSSMONSTER_INTERNAL_HOST_ALLOWLIST;
  } else {
    process.env.RSSMONSTER_INTERNAL_HOST_ALLOWLIST =
      originalInternalHostAllowlist;
  }
});

describe('neutral response body reader', () => {
  it('reads valid bodies and honors configuration', async () => {
    process.env.FEED_RESPONSE_MAX_BYTES = '12';
    const response = responseWithChunks({
      chunks: [new TextEncoder().encode('hello world')],
      headers: { 'content-length': '11' }
    });

    expect(getFeedResponseMaxBytes()).toBe(12);
    const result = await readResponseText(response);

    expect(result).toMatchObject({
      text: 'hello world',
      charset: 'utf-8',
      charsetSource: 'default',
      contentHash:
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    });
    expect(result.bytes).toEqual(new TextEncoder().encode('hello world'));
  });

  it.each([
    ['dishonest', { 'content-length': '2' }],
    ['missing', {}]
  ])('rejects %s Content-Length after streamed bytes cross the limit', async (
    _label,
    headers
  ) => {
    const cancel = vi.fn();
    const response = responseWithChunks({
      chunks: [new TextEncoder().encode('sixteen-byte-body')],
      headers,
      cancel
    });

    const result = await readResponseText(response, { maxBytes: 8 });

    expect(result.error).toMatchObject({ type: 'too_large' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('validates an honest Content-Length before pulling the body', async () => {
    const read = vi.fn();
    const cancel = vi.fn();
    const response = createHttpResponse({
      status: 200,
      url: 'https://example.com/feed.xml',
      headers: { 'content-length': '9' },
      body: createHttpBodyStream({ read, cancel })
    });

    const result = await readResponseText(response, { maxBytes: 8 });

    expect(result.error.type).toBe('too_large');
    expect(read).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels when decoded text exceeds the limit despite bounded encoded bytes', async () => {
    const cancel = vi.fn();
    const response = responseWithChunks({
      chunks: [Uint8Array.from([0xe9, 0xe9, 0xe9, 0xe9, 0xe9, 0xe9])],
      headers: { 'content-type': 'application/xml; charset=iso-8859-1' },
      cancel
    });

    const result = await readResponseText(response, { maxBytes: 8 });

    expect(result.error).toMatchObject({ type: 'too_large' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('limits decoded bytes after redirects and gzip decompression', async () => {
    const compressedBody = gzipSync('x'.repeat(4096));
    const server = createServer((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, { Location: '/compressed-feed' });
        response.end();
        return;
      }

      response.writeHead(200, {
        'Content-Encoding': 'gzip',
        'Content-Length': compressedBody.length
      });
      response.end(compressedBody);
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    try {
      process.env.RSSMONSTER_INTERNAL_HOST_ALLOWLIST = `127.0.0.1:${port}`;
      const transportResult = await executeHttpRequest(createHttpRequest({
        url: `http://127.0.0.1:${port}/redirect`,
        retries: 0,
        timeoutMs: 1000
      }));
      const result = await readResponseText(
        transportResult.response,
        { maxBytes: 100 }
      );

      expect(transportResult.response.redirects).toHaveLength(1);
      expect(result.error.type).toBe('too_large');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('sends conditional validators without forcing request revalidation', async () => {
    let receivedHeaders;
    const server = createServer((request, response) => {
      receivedHeaders = request.headers;
      response.writeHead(304);
      response.end();
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    try {
      process.env.RSSMONSTER_INTERNAL_HOST_ALLOWLIST = `127.0.0.1:${port}`;
      await executeHttpRequest(createHttpRequest({
        url: `http://127.0.0.1:${port}/feed.xml`,
        headers: {
          'if-none-match': '"feed-v2"',
          'if-modified-since': 'Sun, 09 Aug 2026 11:55:00 GMT'
        },
        retries: 0,
        timeoutMs: 1000
      }));

      expect(receivedHeaders['if-none-match']).toBe('"feed-v2"');
      expect(receivedHeaders['if-modified-since'])
        .toBe('Sun, 09 Aug 2026 11:55:00 GMT');
      expect(receivedHeaders['cache-control']).toBeUndefined();
      expect(receivedHeaders['user-agent']).toBe(RSSMONSTER_USER_AGENT);
      expect(receivedHeaders['user-agent']).not.toContain('Chrome');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('keeps the total deadline active during body reads', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200);
      response.write('partial');
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    try {
      process.env.RSSMONSTER_INTERNAL_HOST_ALLOWLIST = `127.0.0.1:${port}`;
      const transportResult = await executeHttpRequest(createHttpRequest({
        url: `http://127.0.0.1:${port}/feed`,
        retries: 0,
        timeoutMs: 200
      }));
      const result = await readResponseText(transportResult.response);

      expect(result.error.type).toBe('timed_out');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('holds origin capacity until a slow response body is cancelled', async () => {
    const requestPolicy = createOriginRequestPolicy({
      maxConcurrency: 1,
      minSpacingMs: 0
    });
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(new ReadableStream({
        // Leaves the first response open until the neutral caller cancels it.
        start(controller) {
          controller.enqueue(new TextEncoder().encode('partial'));
        }
      })))
      .mockResolvedValueOnce(new Response('second'));
    const first = await executeHttpRequest(createHttpRequest({
      url: 'https://publisher.example/slow',
      retries: 0,
      timeoutMs: 2000
    }), fetchImplementation, { requestPolicy });
    let secondSettled = false;
    const second = executeHttpRequest(createHttpRequest({
      url: 'https://publisher.example/second',
      retries: 0,
      timeoutMs: 2000
    }), fetchImplementation, { requestPolicy }).then(result => {
      secondSettled = true;
      return result;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(secondSettled).toBe(false);
    await first.response.body.cancel(new Error('unused'));
    const secondResult = await second;
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    await secondResult.response.body.cancel(new Error('test complete'));
  });

  it('releases origin capacity when an oversized response is rejected', async () => {
    const requestPolicy = createOriginRequestPolicy({
      maxConcurrency: 1,
      minSpacingMs: 0
    });
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response('oversized response body'))
      .mockResolvedValueOnce(new Response('next response'));
    const first = await executeHttpRequest(createHttpRequest({
      url: 'https://publisher.example/oversized',
      retries: 0,
      timeoutMs: 2000
    }), fetchImplementation, { requestPolicy });
    const second = executeHttpRequest(createHttpRequest({
      url: 'https://publisher.example/next',
      retries: 0,
      timeoutMs: 2000
    }), fetchImplementation, { requestPolicy });

    const bodyResult = await readResponseText(first.response, { maxBytes: 8 });
    expect(bodyResult.error.type).toBe('too_large');
    const secondResult = await second;
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    await secondResult.response.body.cancel(new Error('test complete'));
  });

  it('coordinates every redirect hop by its actual origin', async () => {
    const requestPolicy = createOriginRequestPolicy({
      maxConcurrency: 1,
      minSpacingMs: 0
    });
    const finalStream = new ReadableStream({
      // Keeps the cross-origin final response active for coordination assertions.
      start(controller) {
        controller.enqueue(new TextEncoder().encode('redirected'));
      }
    });
    const fetchImplementation = vi.fn(async input => {
      const url = new URL(input);
      if (url.hostname === 'alpha.example' && url.pathname === '/start') {
        return new Response('', {
          status: 302,
          headers: { location: 'https://beta.example/final' }
        });
      }
      if (url.hostname === 'beta.example' && url.pathname === '/final') {
        return new Response(finalStream);
      }
      return new Response(null, { status: 200 });
    });
    const redirected = await executeHttpRequest(createHttpRequest({
      url: 'https://alpha.example/start',
      retries: 0,
      timeoutMs: 2000
    }), fetchImplementation, { requestPolicy });
    let alphaSettled = false;
    let betaSettled = false;
    const alpha = executeHttpRequest(createHttpRequest({
      url: 'https://alpha.example/other',
      retries: 0,
      timeoutMs: 2000
    }), fetchImplementation, { requestPolicy }).then(result => {
      alphaSettled = true;
      return result;
    });
    const beta = executeHttpRequest(createHttpRequest({
      url: 'https://beta.example/other',
      retries: 0,
      timeoutMs: 2000
    }), fetchImplementation, { requestPolicy }).then(result => {
      betaSettled = true;
      return result;
    });
    await vi.waitFor(() => expect(alphaSettled).toBe(true));

    expect(redirected.response.redirects).toHaveLength(1);
    expect(betaSettled).toBe(false);
    await redirected.response.body.cancel(new Error('redirect complete'));
    await expect(beta).resolves.toMatchObject({ attempts: 1 });
    expect(betaSettled).toBe(true);
    await alpha;
  });
});
