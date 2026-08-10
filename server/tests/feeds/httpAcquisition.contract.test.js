import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { acquireHttp } from '../../services/feeds/http/acquireHttp.js';
import {
  FETCH_OUTCOMES,
  createConditionalHeaders,
  createHttpBodyStream,
  createHttpError,
  createHttpRequest,
  createHttpResponse,
  resolveFeedHttpTimeoutMs
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

// Creates an origin policy stub so transport retry tests isolate retry decisions.
const immediateRequestPolicy = () => ({
  acquire: vi.fn().mockResolvedValue(vi.fn())
});

// Runs one assertion with a temporary feed HTTP timeout environment value.
const withFeedHttpTimeout = (value, assertion) => {
  const previous = process.env.FEED_HTTP_TIMEOUT_MS;
  try {
    if (value === undefined) delete process.env.FEED_HTTP_TIMEOUT_MS;
    else process.env.FEED_HTTP_TIMEOUT_MS = value;
    assertion();
  } finally {
    if (previous === undefined) delete process.env.FEED_HTTP_TIMEOUT_MS;
    else process.env.FEED_HTTP_TIMEOUT_MS = previous;
  }
};

describe('feed HTTP acquisition contract', () => {
  it('defaults feed HTTP requests to ten seconds', () => {
    expect(resolveFeedHttpTimeoutMs({})).toBe(10000);
    withFeedHttpTimeout(undefined, () => {
      expect(createHttpRequest({ url: 'https://example.com/feed.xml' }).timeoutMs)
        .toBe(10000);
    });
  });

  it('uses a valid configured feed HTTP timeout', () => {
    expect(resolveFeedHttpTimeoutMs({ FEED_HTTP_TIMEOUT_MS: '15000' })).toBe(15000);
    withFeedHttpTimeout('15000', () => {
      expect(createHttpRequest({ url: 'https://example.com/feed.xml' }).timeoutMs)
        .toBe(15000);
    });
  });

  it.each(['invalid', '0', '-1', '1.5', 'Infinity', ''])(
    'falls back to ten seconds for invalid timeout value %j',
    value => {
      expect(resolveFeedHttpTimeoutMs({ FEED_HTTP_TIMEOUT_MS: value })).toBe(10000);
      withFeedHttpTimeout(value, () => {
        expect(createHttpRequest({ url: 'https://example.com/feed.xml' }).timeoutMs)
          .toBe(10000);
      });
    }
  );

  it('preserves an explicit request timeout override', () => {
    expect(createHttpRequest({
      url: 'https://example.com/feed.xml',
      timeoutMs: 2500
    }).timeoutMs).toBe(2500);
  });

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

  it.each([
    ['longer parent deadline', 5000, 1000, 1000],
    ['shorter parent deadline', 500, 1000, 500],
    ['missing parent deadline', null, 1000, 1000]
  ])('caps the shared request with the %s', async (
    _label,
    parentOffsetMs,
    timeoutMs,
    expectedOffsetMs
  ) => {
    vi.useFakeTimers();
    const now = new Date('2026-08-10T12:00:00.000Z');
    vi.setSystemTime(now);
    const transport = vi.fn().mockResolvedValue({
      response: neutralResponse({ body: 'deadline feed' })
    });
    const request = {
      url: `https://example.com/shared-deadline-${expectedOffsetMs}.xml`,
      timeoutMs,
      ...(parentOffsetMs === null
        ? {}
        : { deadlineAt: now.getTime() + parentOffsetMs })
    };

    try {
      await expect(acquireHttp(request, { transport })).resolves.toMatchObject({
        type: 'changed'
      });
      expect(transport.mock.calls[0][0].deadlineAt).toBe(
        now.getTime() + expectedOffsetMs
      );
    } finally {
      vi.useRealTimers();
    }
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

  it('preserves REQUEST_TIMEOUT for a timeout before a usable response', async () => {
    const outcome = await acquireHttp(
      { url: 'https://example.com/pre-response-timeout.xml' },
      {
        transport: transportWith({
          error: createHttpError({
            type: FETCH_OUTCOMES.TIMED_OUT,
            message: 'The fetch operation timed out',
            code: 'REQUEST_TIMEOUT'
          })
        })
      }
    );

    expect(outcome).toMatchObject({
      type: FETCH_OUTCOMES.TIMED_OUT,
      response: null,
      error: { code: 'REQUEST_TIMEOUT' }
    });
  });

  it('reports BODY_TIMEOUT with HTTP status after response body timeout', async () => {
    const response = createHttpResponse({
      status: 200,
      url: 'https://example.com/body-timeout.xml',
      body: createHttpBodyStream({
        read: vi.fn().mockResolvedValue({
          error: createHttpError({
            type: FETCH_OUTCOMES.TIMED_OUT,
            message: 'The fetch operation timed out',
            code: 'REQUEST_TIMEOUT'
          })
        }),
        cancel: vi.fn()
      })
    });
    const outcome = await acquireHttp(
      { url: response.url },
      { transport: transportWith({ response }) }
    );

    expect(outcome).toMatchObject({
      type: FETCH_OUTCOMES.TIMED_OUT,
      response: { status: 200 },
      error: {
        message: 'The fetch operation timed out',
        code: 'BODY_TIMEOUT'
      }
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

  it('allows the first attempt to use more than half of a ten-second deadline', async () => {
    vi.useFakeTimers();
    try {
      const fetchImplementation = vi.fn(() => new Promise(resolve => {
        setTimeout(() => resolve(new Response('feed', { status: 200 })), 6000);
      }));
      const pendingResult = executeHttpRequest(
        createHttpRequest({
          url: 'https://example.com/slow-success.xml',
          retries: 1,
          timeoutMs: 10000
        }),
        fetchImplementation,
        { requestPolicy: immediateRequestPolicy() }
      );

      await vi.advanceTimersByTimeAsync(6000);
      await expect(pendingResult).resolves.toMatchObject({
        attempts: 1,
        response: { status: 200 }
      });
      expect(fetchImplementation).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [
      'request timeout',
      Object.assign(new Error('deadline'), { name: 'TimeoutError' })
    ],
    [
      'connection reset',
      Object.assign(new Error('reset'), { code: 'ECONNRESET' })
    ],
    [
      'temporary DNS failure',
      Object.assign(new Error('try DNS again'), { code: 'EAI_AGAIN' })
    ]
  ])('retries one eligible %s and reports both attempts', async (
    _label,
    firstError
  ) => {
    const fetchImplementation = vi.fn()
      .mockRejectedValueOnce(firstError)
      .mockResolvedValueOnce(new Response('feed', { status: 200 }));
    const result = await executeHttpRequest(
      createHttpRequest({
        url: 'https://example.com/retry-success.xml',
        retries: 1,
        timeoutMs: 2000
      }),
      fetchImplementation,
      { requestPolicy: immediateRequestPolicy() }
    );

    expect(result).toMatchObject({
      attempts: 2,
      response: { status: 200 }
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('does not retry a timeout after the parent deadline is exhausted', async () => {
    const deadlineAt = Date.now() + 100;
    const timeoutError = Object.assign(new Error('deadline'), {
      name: 'TimeoutError'
    });
    const fetchImplementation = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 120));
      throw timeoutError;
    });

    const result = await executeHttpRequest(
      createHttpRequest({
        url: 'https://example.com/no-retry-budget.xml',
        retries: 1,
        timeoutMs: 10000,
        deadlineAt
      }),
      fetchImplementation,
      {
        requestPolicy: immediateRequestPolicy()
      }
    );

    expect(result).toMatchObject({
      attempts: 1,
      error: { type: FETCH_OUTCOMES.TIMED_OUT }
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('does not retry after the parent signal is aborted', async () => {
    const parentController = new AbortController();
    const fetchImplementation = vi.fn().mockRejectedValue(
      Object.assign(new Error('reset'), { code: 'ECONNRESET' })
    );
    const pendingResult = executeHttpRequest(
      createHttpRequest({
        url: 'https://example.com/parent-abort.xml',
        retries: 1,
        timeoutMs: 2000,
        signal: parentController.signal
      }),
      fetchImplementation,
      { requestPolicy: immediateRequestPolicy() }
    );
    setTimeout(() => parentController.abort(), 10);
    const result = await pendingResult;

    expect(result).toMatchObject({
      attempts: 1,
      error: { type: 'transient_failure' }
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it.each([
    ['redirect loop', Object.assign(new Error('redirects'), { code: 'REDIRECT_LIMIT_EXCEEDED' })],
    ['security rejection', Object.assign(new Error('blocked'), { code: 'SSRF_BLOCKED' })],
    ['malformed URL', Object.assign(new Error('URL is invalid'), { code: 'SSRF_BLOCKED' })],
    ['missing DNS name', Object.assign(new Error('missing host'), { code: 'ENOTFOUND' })],
    ['connection refused', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })],
    ['TLS failure', Object.assign(new Error('certificate failed'), { code: 'ERR_TLS_CERT' })]
  ])('does not retry %s failures', async (_label, error) => {
    const fetchImplementation = vi.fn().mockRejectedValue(error);
    const result = await executeHttpRequest(
      createHttpRequest({
        url: 'https://example.com/non-retryable.xml',
        retries: 1,
        timeoutMs: 1000
      }),
      fetchImplementation,
      { requestPolicy: immediateRequestPolicy() }
    );

    expect(result.attempts).toBe(1);
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('keeps all timeout attempts within the absolute parent deadline', async () => {
    const startedAt = Date.now();
    const deadlineAt = startedAt + 120;
    const fetchImplementation = vi.fn((_url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      })
    );
    const result = await executeHttpRequest(
      createHttpRequest({
        url: 'https://example.com/absolute-deadline.xml',
        retries: 1,
        timeoutMs: 1000,
        deadlineAt
      }),
      fetchImplementation,
      { requestPolicy: immediateRequestPolicy() }
    );

    expect(result).toMatchObject({
      attempts: 1,
      error: { type: FETCH_OUTCOMES.TIMED_OUT }
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(Date.now()).toBeLessThan(deadlineAt + 100);
  });
});
