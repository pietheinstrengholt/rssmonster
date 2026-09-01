import { describe, expect, it, vi } from 'vitest';

import {
  OPML_CONNECTION_STATUSES,
  OPML_CONNECTION_TIMEOUT_MS,
  testOpmlConnection
} from '../../services/feeds/opmlConnection.js';
import {
  createHttpBodyStream,
  createHttpResponse
} from '../../services/feeds/http/contracts.js';

const responseResult = status => {
  const cancel = vi.fn();
  return {
    cancel,
    result: {
      response: createHttpResponse({
        status,
        url: 'https://example.test/feed',
        body: createHttpBodyStream({ read: vi.fn(), cancel })
      })
    }
  };
};

describe('OPML connection checks', () => {
  it.each([
    [200, OPML_CONNECTION_STATUSES.AVAILABLE],
    [404, OPML_CONNECTION_STATUSES.AVAILABLE],
    [401, OPML_CONNECTION_STATUSES.ACCESS_DENIED],
    [403, OPML_CONNECTION_STATUSES.ACCESS_DENIED],
    [429, OPML_CONNECTION_STATUSES.RATE_LIMITED]
  ])('classifies HTTP %i without reading its body', async (status, expected) => {
    const response = responseResult(status);
    const transport = vi.fn().mockResolvedValue(response.result);

    await expect(testOpmlConnection('https://example.test/feed', {
      transport,
      clock: () => 1000
    })).resolves.toBe(expected);

    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      retries: 0,
      connectTimeoutMs: OPML_CONNECTION_TIMEOUT_MS,
      deadlineAt: 1000 + OPML_CONNECTION_TIMEOUT_MS
    }));
    expect(response.cancel).toHaveBeenCalledOnce();
    expect(response.result.response.body.read).not.toHaveBeenCalled();
  });

  it('maps timeout, DNS, connection, and thrown failures to temporary unavailability', async () => {
    for (const result of [{ error: { type: 'timed_out' } }, {
      error: { type: 'transient_failure', code: 'DNS_ERROR' }
    }, {
      error: { type: 'permanent_failure', code: 'CONNECTION_REFUSED' }
    }]) {
      await expect(testOpmlConnection('https://example.test/feed', {
        transport: vi.fn().mockResolvedValue(result)
      })).resolves.toBe(OPML_CONNECTION_STATUSES.TEMPORARILY_UNAVAILABLE);
    }

    await expect(testOpmlConnection('https://example.test/feed', {
      transport: vi.fn().mockRejectedValue(new Error('connection failed'))
    })).resolves.toBe(OPML_CONNECTION_STATUSES.TEMPORARILY_UNAVAILABLE);
  });

  it('caps a feed check at the shared preview deadline', async () => {
    const response = responseResult(200);
    const transport = vi.fn().mockResolvedValue(response.result);

    await testOpmlConnection('https://example.test/feed', {
      transport,
      clock: () => 1000,
      deadlineAt: 4500
    });

    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      deadlineAt: 4500
    }));
  });

  it('does not start a feed check after the shared preview deadline', async () => {
    const transport = vi.fn();

    await expect(testOpmlConnection('https://example.test/feed', {
      transport,
      clock: () => 5000,
      deadlineAt: 5000
    })).resolves.toBe(OPML_CONNECTION_STATUSES.NOT_CHECKED);
    expect(transport).not.toHaveBeenCalled();
  });
});
