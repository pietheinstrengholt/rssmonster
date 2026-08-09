import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  discover: vi.fn(),
  parse: vi.fn()
}));

vi.mock('../../services/feeds/discoverRssLink.js', () => ({
  default: { discoverRssLink: mocked.discover }
}));

vi.mock('../../services/feeds/parser.js', () => ({
  default: { acquireFeedSource: mocked.parse }
}));

const { acquireFeed } = await import('../../services/feeds/feedAcquisition.js');
const {
  MALFORMED_BASE_BACKOFF_MS,
  NOT_FOUND_BACKOFF_MS,
  classifyFetchRetry
} = await import('../../services/feeds/feedScheduling.js');

beforeEach(() => {
  mocked.discover.mockReset();
  mocked.parse.mockReset();
});

describe('feed acquisition outcomes', () => {
  it('passes the complete crawl execution object through discovery unchanged', async () => {
    const execution = {
      signal: new AbortController().signal,
      deadlineAt: Date.now() + 10_000,
      lease: { feedId: 7, leaseOwner: 'crawl-owner' },
      leaseState: { lost: false },
      assertLeaseOwnership: vi.fn(),
      retargetLease: vi.fn()
    };
    mocked.discover.mockResolvedValue({
      url: 'https://example.com/feed.xml',
      parsedFeed: { title: 'News', entries: [] },
      fetchOutcome: { type: 'changed' }
    });

    await acquireFeed({
      url: 'https://example.com/feed.xml',
      execution
    });

    expect(mocked.discover.mock.calls[0][2].execution).toBe(execution);
    expect(mocked.discover.mock.calls[0][2].conditionalRequest).toMatchObject({
      deadlineAt: execution.deadlineAt,
      signal: execution.signal
    });
  });

  it('returns parsed discovery as a changed neutral outcome', async () => {
    mocked.discover.mockResolvedValue({
      url: 'https://example.com/feed.xml',
      parsedFeed: { title: 'News', entries: [] },
      fetchOutcome: {
        type: 'changed',
        bodyHash: 'accepted-hash',
        policy: { etag: '"accepted"' }
      }
    });

    await expect(acquireFeed({
      url: 'https://example.com'
    })).resolves.toMatchObject({
      type: 'changed',
      url: 'https://example.com/feed.xml',
      bodyHash: 'accepted-hash',
      policy: { etag: '"accepted"' },
      parsedFeed: { title: 'News' }
    });
    expect(mocked.parse).not.toHaveBeenCalled();
  });

  it('classifies an unpersistable required feed URL deterministically', async () => {
    const error = new Error('Feed URL exceeds the persistence limit');
    error.code = 'FEED_PERSISTENCE_URL_TOO_LONG';
    mocked.discover.mockRejectedValue(error);

    await expect(acquireFeed({
      url: 'https://example.com/feed.xml'
    })).resolves.toMatchObject({
      type: 'too_large',
      error: {
        type: 'too_large',
        code: 'FEED_PERSISTENCE_URL_TOO_LONG'
      }
    });
  });

  it('sends only stored validators and the accepted content hash', async () => {
    mocked.discover.mockResolvedValue({
      url: 'https://example.com/feed.xml',
      fetchOutcome: { type: 'not_modified' }
    });

    await acquireFeed({
      url: 'https://example.com/feed.xml',
      feed: {
        etag: '"feed-v2"',
        lastModified: 'Sun, 09 Aug 2026 11:55:00 GMT',
        contentHash: 'accepted-hash'
      }
    });

    expect(mocked.discover).toHaveBeenCalledWith(
      'https://example.com/feed.xml',
      expect.any(Object),
      expect.objectContaining({
        conditionalRequest: {
          headers: {
            'if-none-match': '"feed-v2"',
            'if-modified-since': 'Sun, 09 Aug 2026 11:55:00 GMT'
          },
          previousContentHash: 'accepted-hash'
        }
      })
    );
    expect(mocked.discover.mock.calls[0][2].conditionalRequest.headers)
      .not.toHaveProperty('cache-control');
  });

  it.each(['unchanged', 'not_modified'])(
    'returns %s without invoking a second parser request',
    async type => {
      mocked.discover.mockResolvedValue({
        url: 'https://example.com/feed.xml',
        parsedFeed: null,
        fetchOutcome: { type, bodyHash: 'accepted-hash' }
      });

      await expect(acquireFeed({
        url: 'https://example.com/feed.xml',
        feed: { contentHash: 'accepted-hash' }
      })).resolves.toMatchObject({ type });
      expect(mocked.parse).not.toHaveBeenCalled();
    }
  );

  it.each([
    {
      label: 'malformed primary with missing speculative fallback',
      primary: { type: 'changed', response: { status: 200 } },
      primaryParseFailure: {
        code: 'MALFORMED_FEED_BODY',
        message: 'Primary body is malformed'
      },
      candidates: [{
        provenance: { role: 'candidate', kind: 'conventional_path', speculative: true },
        outcome: {
          type: 'permanent_failure',
          response: { status: 404 },
          error: { type: 'permanent_failure', status: 404, message: 'HTTP 404' }
        }
      }],
      expectedType: 'malformed',
      expectedCode: 'MALFORMED_FEED_BODY',
      failures: 1,
      expectedRetry: {
        retryable: true,
        quarantined: false,
        backoffMs: MALFORMED_BASE_BACKOFF_MS
      }
    },
    {
      label: 'malformed primary with SSRF-rejected speculative fallback',
      primary: { type: 'changed', response: { status: 200 } },
      primaryParseFailure: {
        code: 'INVALID_FEED',
        message: 'Primary body is HTML'
      },
      candidates: [{
        provenance: { role: 'candidate', kind: 'conventional_path', speculative: true },
        outcome: {
          type: 'security_rejected',
          error: { type: 'security_rejected', code: 'SSRF_BLOCKED', message: 'Blocked' }
        }
      }],
      expectedType: 'malformed',
      expectedCode: 'INVALID_FEED',
      failures: 3,
      expectedRetry: { retryable: false, quarantined: true, backoffMs: null }
    },
    {
      label: 'primary 404 with speculative timeout',
      primary: {
        type: 'permanent_failure',
        response: { status: 404 },
        error: { type: 'permanent_failure', status: 404, message: 'Primary HTTP 404' }
      },
      candidates: [{
        provenance: { role: 'candidate', kind: 'conventional_path', speculative: true },
        outcome: { type: 'timed_out', error: { type: 'timed_out', message: 'Timed out' } }
      }],
      expectedType: 'permanent_failure',
      expectedStatus: 404,
      failures: 1,
      expectedRetry: {
        retryable: true,
        quarantined: false,
        backoffMs: NOT_FOUND_BACKOFF_MS
      }
    },
    {
      label: 'primary timeout with missing fallback',
      primary: {
        type: 'timed_out',
        error: { type: 'timed_out', message: 'Primary timed out' }
      },
      candidates: [{
        provenance: { role: 'candidate', kind: 'conventional_path', speculative: true },
        outcome: {
          type: 'permanent_failure',
          response: { status: 404 },
          error: { type: 'permanent_failure', status: 404, message: 'HTTP 404' }
        }
      }],
      expectedType: 'timed_out',
      failures: 2,
      expectedRetry: { retryable: true, quarantined: false, backoffMs: 10 * 60 * 1000 }
    },
    {
      label: 'primary rate limit with advertised alternate failure',
      primary: {
        type: 'rate_limited',
        response: { status: 429 },
        error: { type: 'rate_limited', status: 429, message: 'Primary rate limited' }
      },
      candidates: [{
        provenance: { role: 'candidate', kind: 'html_alternate', speculative: false },
        outcome: { type: 'timed_out', error: { type: 'timed_out', message: 'Alternate timed out' } }
      }],
      expectedType: 'rate_limited',
      expectedStatus: 429,
      failures: 2,
      expectedRetry: { retryable: true, quarantined: false, backoffMs: 10 * 60 * 1000 }
    },
    {
      label: 'malformed primary with missing advertised alternate',
      primary: { type: 'changed', response: { status: 200 } },
      primaryParseFailure: {
        code: 'MALFORMED_FEED_BODY',
        message: 'Primary XML is malformed'
      },
      candidates: [{
        provenance: { role: 'candidate', kind: 'html_alternate', speculative: false },
        outcome: {
          type: 'permanent_failure',
          response: { status: 404 },
          error: { type: 'permanent_failure', status: 404, message: 'Alternate missing' }
        }
      }],
      expectedType: 'malformed',
      expectedCode: 'MALFORMED_FEED_BODY',
      failures: 1,
      expectedRetry: {
        retryable: true,
        quarantined: false,
        backoffMs: MALFORMED_BASE_BACKOFF_MS
      }
    },
    {
      label: 'successful identity-proven advertised recovery',
      primary: {
        type: 'permanent_failure',
        response: { status: 404 },
        error: { type: 'permanent_failure', status: 404, message: 'Primary missing' }
      },
      candidates: [{
        provenance: { role: 'candidate', kind: 'html_alternate', speculative: false },
        outcome: { type: 'changed', response: { status: 200 } }
      }],
      recoveryResult: {
        url: 'https://example.com/moved.xml',
        parsedFeed: { title: 'Verified recovery', entries: [] },
        fetchOutcome: { type: 'changed', response: { status: 200 } },
        recovery: { accepted: true, kind: 'html_alternate' }
      },
      expectedType: 'changed',
      failures: 9,
      expectedRetry: { retryable: true, quarantined: false, backoffMs: 0 }
    }
  ])('attributes $label deterministically', async scenario => {
    mocked.discover.mockImplementation(async (_url, _feed, options) => {
      options.onFetchOutcome(scenario.primary, {
        role: 'primary',
        kind: 'primary',
        requestedUrl: 'https://example.com/section.xml'
      });
      if (scenario.primaryParseFailure) {
        options.onParseFailure(scenario.primaryParseFailure, {
          role: 'primary',
          kind: 'primary',
          requestedUrl: 'https://example.com/section.xml'
        });
      }
      for (const candidate of scenario.candidates) {
        options.onFetchOutcome(candidate.outcome, {
          ...candidate.provenance,
          requestedUrl: 'https://example.com/rss.xml'
        });
      }
      return scenario.recoveryResult;
    });

    const result = await acquireFeed({
      url: 'https://example.com/section.xml'
    });
    expect(result.type).toBe(scenario.expectedType);
    if (scenario.expectedCode) expect(result.error.code).toBe(scenario.expectedCode);
    if (scenario.expectedStatus) expect(result.error.status).toBe(scenario.expectedStatus);
    expect(result.discovery.primary).toMatchObject({
      outcomeType: scenario.primary.type
    });
    expect(result.discovery.candidates).toHaveLength(scenario.candidates.length);
    expect(result.discovery.candidates.map(candidate => candidate.outcomeType))
      .toEqual(scenario.candidates.map(candidate => candidate.outcome.type));

    expect(classifyFetchRetry({
      outcomeType: result.type,
      httpStatus: result.response?.status ?? result.error?.status ?? null,
      consecutiveFailures: scenario.failures
    })).toEqual(scenario.expectedRetry);
  });

  it('returns a deterministic malformed outcome for unverified recovery', async () => {
    mocked.discover.mockResolvedValue({
      url: null,
      parsedFeed: null,
      recovery: {
        accepted: false,
        code: 'FEED_RECOVERY_IDENTITY_UNVERIFIED',
        kind: 'conventional_path',
        candidateUrl: 'https://example.com/feed',
        diagnostic: 'Rejected conventional_path recovery because it lacked same-feed evidence'
      }
    });

    await expect(acquireFeed({
      url: 'https://example.com/sections/news.xml',
      feed: { id: 1, userId: 1 }
    })).resolves.toMatchObject({
      type: 'malformed',
      error: {
        code: 'FEED_RECOVERY_IDENTITY_UNVERIFIED'
      },
      discovery: {
        recovered: false,
        recovery: {
          accepted: false,
          kind: 'conventional_path'
        }
      }
    });
    expect(mocked.parse).not.toHaveBeenCalled();
  });

  it('passes parser timeout outcomes through without exceptions', async () => {
    mocked.discover.mockResolvedValue('https://example.com/feed.xml');
    mocked.parse.mockResolvedValue({
      type: 'timed_out',
      error: { type: 'timed_out', message: 'The fetch operation timed out' }
    });

    await expect(acquireFeed({
      url: 'https://example.com'
    })).resolves.toMatchObject({ type: 'timed_out' });
  });
});
