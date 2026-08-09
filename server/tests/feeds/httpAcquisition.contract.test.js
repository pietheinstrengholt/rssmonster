import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { acquireHttp } from '../../services/feeds/http/acquireHttp.js';
import {
  FETCH_OUTCOMES,
  createConditionalHeaders,
  createHttpBodyStream,
  createHttpError,
  createHttpRequest,
  createHttpResponse
} from '../../services/feeds/http/contracts.js';
import {
  executeHttpRequest,
  translateTransportError
} from '../../services/feeds/http/fetchTransport.js';

// Creates a neutral response with a finite byte body for outcome tests.
const neutralResponse = ({ status = 200, body = 'feed', headers = {} } = {}) => {
  let delivered = false;
  return createHttpResponse({
    status,
    url: 'https://example.com/feed.xml',
    headers,
    body: createHttpBodyStream({
      read: async () => {
        if (delivered) return { done: true, chunk: null };
        delivered = true;
        return { done: false, chunk: new TextEncoder().encode(body) };
      },
      cancel: vi.fn()
    })
  });
};

// Creates an injected neutral transport result for acquisition classification.
const transportWith = result => vi.fn().mockResolvedValue(result);

describe('feed HTTP acquisition contract', () => {
  it('defines exactly the supported closed outcome set', () => {
    expect(Object.values(FETCH_OUTCOMES)).toEqual([
      'changed',
      'unchanged',
      'not_modified',
      'rate_limited',
      'transient_failure',
      'permanent_failure',
      'malformed',
      'security_rejected',
      'too_large',
      'timed_out'
    ]);
  });

  it.each([
    [
      'both validators',
      { etag: '"feed-v2"', lastModified: 'Sun, 09 Aug 2026 11:55:00 GMT' },
      {
        'if-none-match': '"feed-v2"',
        'if-modified-since': 'Sun, 09 Aug 2026 11:55:00 GMT'
      }
    ],
    ['ETag only', { etag: 'W/"feed-v2"' }, { 'if-none-match': 'W/"feed-v2"' }],
    ['Last-Modified only', { lastModified: 'valid-date' }, {
      'if-modified-since': 'valid-date'
    }],
    ['no validators', {}, {}]
  ])('creates conditional headers with %s', (_label, feed, expected) => {
    expect(createConditionalHeaders(feed)).toEqual(expected);
  });

  it.each([
    [304, {}, 'not_modified'],
    [429, {}, 'rate_limited'],
    [429, { 'retry-after': '120' }, 'rate_limited'],
    [503, { 'retry-after': '120' }, 'rate_limited'],
    [408, {}, 'transient_failure'],
    [425, {}, 'transient_failure'],
    [500, {}, 'transient_failure'],
    [502, {}, 'transient_failure'],
    [503, {}, 'transient_failure'],
    [504, {}, 'transient_failure'],
    [404, {}, 'permanent_failure'],
    [410, {}, 'permanent_failure']
  ])('maps HTTP %i deterministically to %s', async (
    status,
    headers,
    expectedType
  ) => {
    const outcome = await acquireHttp(
      { url: 'https://example.com/feed.xml' },
      { transport: transportWith({ response: neutralResponse({ status, headers }) }) }
    );

    expect(outcome.type).toBe(expectedType);
    expect(outcome.response.headers.get).toBeUndefined();
    if (outcome.error) expect(outcome.error.status).toBe(status);
  });

  it.each([
    [304, 'not_modified'],
    [429, 'rate_limited'],
    [500, 'transient_failure'],
    [404, 'permanent_failure']
  ])('cancels the unused HTTP %i body for %s', async (status, expectedType) => {
    const cancel = vi.fn();
    const response = createHttpResponse({
      status,
      url: 'https://example.com/feed.xml',
      body: createHttpBodyStream({ read: vi.fn(), cancel })
    });

    const outcome = await acquireHttp(
      { url: `https://example.com/cancel-${status}.xml` },
      { transport: transportWith({ response }) }
    );

    expect(outcome.type).toBe(expectedType);
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancel.mock.calls[0][0]).toMatchObject({ type: expectedType });
  });

  it.each([
    ['120', '2026-08-09T12:02:00.000Z'],
    ['Sun, 09 Aug 2026 12:05:00 GMT', '2026-08-09T12:05:00.000Z']
  ])('normalizes Retry-After %s on rate limits', async (header, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'));
    const outcome = await acquireHttp(
      { url: 'https://example.com/feed.xml' },
      {
        transport: transportWith({
          response: neutralResponse({
            status: 429,
            headers: { 'retry-after': header }
          })
        })
      }
    );

    expect(outcome.policy.retryAfterAt.toISOString()).toBe(expected);
    expect(outcome.error.retryAfter).toBe(outcome.policy.retryAfterAt);
    vi.useRealTimers();
  });

  it('distinguishes changed and unchanged decoded bodies by neutral hash input', async () => {
    const body = 'same feed';
    const previousContentHash = createHash('sha256').update(body).digest('hex');
    const changed = await acquireHttp(
      { url: 'https://example.com/feed.xml' },
      { transport: transportWith({ response: neutralResponse({ body }) }) }
    );
    const unchanged = await acquireHttp(
      { url: 'https://example.com/feed.xml', previousContentHash },
      { transport: transportWith({ response: neutralResponse({ body }) }) }
    );

    expect(changed.type).toBe('changed');
    expect(unchanged.type).toBe('unchanged');
  });

  it('coalesces simultaneous semantically identical canonical URLs', async () => {
    let releaseTransport;
    const transport = vi.fn(() => new Promise(resolve => {
      releaseTransport = resolve;
    }));

    const first = acquireHttp(
      { url: 'https://EXAMPLE.com:443/feed.xml#first' },
      { transport }
    );
    const second = acquireHttp(
      { url: 'https://example.com/feed.xml#second' },
      { transport }
    );
    await Promise.resolve();
    expect(transport).toHaveBeenCalledOnce();

    releaseTransport({ response: neutralResponse({ body: 'shared feed' }) });
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { type: 'changed', bodyText: 'shared feed' },
      { type: 'changed', bodyText: 'shared feed' }
    ]);
  });

  it('coalesces callers whose absolute deadlines differ slightly', async () => {
    let releaseTransport;
    const transport = vi.fn(() => new Promise(resolve => {
      releaseTransport = resolve;
    }));
    const now = Date.now();
    const first = acquireHttp({
      url: 'https://example.com/deadline-shared.xml',
      deadlineAt: now + 2000
    }, { transport });
    const second = acquireHttp({
      url: 'https://example.com/deadline-shared.xml',
      deadlineAt: now + 2050
    }, { transport });
    await Promise.resolve();

    expect(transport).toHaveBeenCalledOnce();
    releaseTransport({ response: neutralResponse({ body: 'shared deadline' }) });
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { type: 'changed' },
      { type: 'changed' }
    ]);
  });

  it('keeps shared transport alive when only one coalesced caller aborts', async () => {
    const firstController = new AbortController();
    let releaseTransport;
    let sharedSignal;
    const transport = vi.fn(request => {
      sharedSignal = request.signal;
      return new Promise(resolve => { releaseTransport = resolve; });
    });
    const first = acquireHttp({
      url: 'https://example.com/independent-cancel.xml',
      signal: firstController.signal
    }, { transport });
    const second = acquireHttp({
      url: 'https://example.com/independent-cancel.xml'
    }, { transport });
    await Promise.resolve();

    firstController.abort(new Error('caller stopped'));
    await expect(first).resolves.toMatchObject({ type: 'timed_out' });
    expect(sharedSignal.aborted).toBe(false);
    expect(transport).toHaveBeenCalledOnce();

    releaseTransport({ response: neutralResponse({ body: 'surviving caller' }) });
    await expect(second).resolves.toMatchObject({
      type: 'changed',
      bodyText: 'surviving caller'
    });
  });

  it('consumes a neutral response body only once while retaining its bytes', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({
        done: false,
        chunk: new TextEncoder().encode('single read body')
      })
      .mockResolvedValueOnce({ done: true, chunk: null });
    const response = createHttpResponse({
      status: 200,
      url: 'https://example.com/feed.xml',
      body: createHttpBodyStream({ read, cancel: vi.fn() })
    });

    const outcome = await acquireHttp(
      { url: 'https://example.com/feed.xml' },
      { transport: transportWith({ response }) }
    );

    expect(read).toHaveBeenCalledTimes(2);
    expect(outcome.bodyText).toBe('single read body');
    expect(outcome.bodyContent).toMatchObject({
      text: 'single read body',
      charset: 'utf-8',
      charsetSource: 'default'
    });
    expect(outcome.bodyContent.bytes).toEqual(
      new TextEncoder().encode('single read body')
    );
  });

  it('classifies unsupported declared charsets as malformed outcomes', async () => {
    const outcome = await acquireHttp(
      { url: 'https://example.com/feed.xml' },
      {
        transport: transportWith({
          response: neutralResponse({
            body: '<?xml version="1.0"?><rss></rss>',
            headers: {
              'content-type': 'application/rss+xml; charset=koi8-r'
            }
          })
        })
      }
    );

    expect(outcome).toMatchObject({
      type: 'malformed',
      error: { message: 'Unsupported feed charset: koi8-r' }
    });
  });

  it.each([
    ['malformed', 'malformed'],
    ['security_rejected', 'security_rejected'],
    ['too_large', 'too_large'],
    ['timed_out', 'timed_out']
  ])('preserves neutral %s transport errors as outcomes', async (
    errorType,
    expectedType
  ) => {
    const error = createHttpError({ type: errorType, message: errorType });
    const outcome = await acquireHttp(
      { url: 'https://example.com/feed.xml' },
      { transport: transportWith({ error }) }
    );

    expect(outcome.type).toBe(expectedType);
    expect(outcome.error).toBe(error);
  });
});

describe('Fetch transport exception translation', () => {
  it.each([
    [Object.assign(new Error('wrapped'), { cause: { code: 'SSRF_BLOCKED' } }), 'security_rejected'],
    [Object.assign(new Error('deadline'), { name: 'TimeoutError' }), 'timed_out'],
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), 'timed_out'],
    [Object.assign(new Error('socket timeout'), { code: 'ETIMEDOUT' }), 'timed_out'],
    [new TypeError('fetch failed'), 'transient_failure'],
    [Object.assign(new Error('reset'), { code: 'ECONNRESET' }), 'transient_failure'],
    [new Error('unsupported client failure'), 'permanent_failure']
  ])('translates client exception %# deterministically', (error, expectedType) => {
    const translated = translateTransportError(error);

    expect(translated.type).toBe(expectedType);
    expect(translated).not.toHaveProperty('cause');
  });

  it('translates redirect limits into a stable neutral crawl code', () => {
    const translated = translateTransportError(
      Object.assign(new Error('too many redirects'), {
        code: 'REDIRECT_LIMIT_EXCEEDED'
      })
    );

    expect(translated).toMatchObject({
      type: 'permanent_failure',
      code: 'REDIRECT_LOOP'
    });
  });

  it.each([
    ['ENOTFOUND', 'DNS_ERROR'],
    ['EAI_AGAIN', 'DNS_ERROR'],
    ['ECONNRESET', 'CONNECTION_RESET'],
    ['ECONNREFUSED', 'CONNECTION_REFUSED'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'TLS_ERROR']
  ])('normalizes %s into %s', (clientCode, expectedCode) => {
    const translated = translateTransportError(
      Object.assign(new Error('connection failed'), { code: clientCode })
    );

    expect(translated.code).toBe(expectedCode);
  });

  it('returns translated errors instead of throwing client exceptions', async () => {
    const clientError = new TypeError('fetch failed');
    const result = await executeHttpRequest(
      createHttpRequest({
        url: 'https://example.com/feed.xml',
        retries: 0,
        timeoutMs: 1000
      }),
      vi.fn().mockRejectedValue(clientError)
    );

    expect(result).toEqual({
      error: {
        type: 'transient_failure',
        message: 'fetch failed',
        status: null,
        retryAfter: null,
        code: 'NETWORK_ERROR'
      },
      attempts: 1
    });
    expect(result.error).not.toBe(clientError);
  });

  it('reports the total transport attempts after retry exhaustion', async () => {
    const result = await executeHttpRequest(
      createHttpRequest({
        url: 'https://example.com/feed.xml',
        retries: 1,
        timeoutMs: 2000
      }),
      vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    );

    expect(result).toMatchObject({
      attempts: 2,
      error: { type: 'transient_failure', code: 'NETWORK_ERROR' }
    });
  });
});
