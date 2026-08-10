import { afterEach, describe, expect, it, vi } from 'vitest';
import api, { API_BASE_URL, setAuthToken } from '../src/api/client.js';
import { openFeedRefreshEvents } from '../src/services/feedRefreshStream.js';

// This function creates a one-chunk response body for deterministic SSE parsing.
const createEventResponse = eventText => {
  const reader = {
    read: vi.fn().mockResolvedValueOnce({
      done: false,
      value: new TextEncoder().encode(eventText)
    })
  };

  return {
    body: {
      getReader: () => reader
    },
    ok: true,
    status: 200
  };
};

afterEach(() => {
  vi.useRealTimers();
  setAuthToken(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('feed refresh event stream', () => {
  it('authenticates with a header and never places the bearer token in the SSE URL', async () => {
    const token = 'primary.jwt.session-token';
    const response = createEventResponse(
      'event: progress\ndata: {"processedFeeds":1}\n\n'
    );
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    setAuthToken(token);

    const eventStream = openFeedRefreshEvents('job-7');
    const progress = new Promise(resolve => {
      eventStream.addEventListener('progress', event => {
        eventStream.close();
        resolve(event);
      });
    });

    await expect(progress).resolves.toMatchObject({
      data: '{"processedFeeds":1}',
      type: 'progress'
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [requestUrl, requestOptions] = fetchMock.mock.calls[0];
    expect(requestUrl).toBe(
      `${API_BASE_URL}/feeds/refresh/job-7/events`
    );
    expect(requestUrl).not.toContain(token);
    expect(requestUrl).not.toContain('token=');
    expect(requestOptions.headers).toEqual({
      Accept: 'text/event-stream',
      Authorization: api.defaults.headers.common.Authorization
    });
  });

  // Verifies fragmented chunks, multiline data, comments, and named events retain SSE semantics.
  it('parses fragmented and multiline event blocks', async () => {
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(': keepalive\nevent: progress\ndata: {"part":')
        })
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('1}\ndata: second line\n\n')
        })
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      body: { getReader: () => reader },
      ok: true,
      status: 200
    }));

    const eventStream = openFeedRefreshEvents('fragmented-job');
    const progress = new Promise(resolve => {
      eventStream.addEventListener('progress', event => {
        eventStream.close();
        resolve(event);
      });
    });

    await expect(progress).resolves.toMatchObject({
      data: '{"part":1}\nsecond line',
      type: 'progress'
    });
  });

  // Verifies retry fields control reconnect timing after an otherwise clean disconnect.
  it('reconnects after the server-provided retry delay', async () => {
    vi.useFakeTimers();
    const disconnectedResponse = {
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('retry: 25\n\n')
            })
            .mockResolvedValueOnce({ done: true })
        })
      },
      ok: true,
      status: 200
    };
    const fetchMock = vi.fn().mockResolvedValue(disconnectedResponse);
    vi.stubGlobal('fetch', fetchMock);

    const eventStream = openFeedRefreshEvents('retry-job');
    await vi.advanceTimersByTimeAsync(24);
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    eventStream.close();
  });

  // Verifies a completed job cannot reconnect and replay its terminal event indefinitely.
  it('does not reconnect after receiving a terminal refresh event', async () => {
    vi.useFakeTimers();
    const terminalResponse = {
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                'event: done\ndata: {"processedFeeds":2,"totalFeeds":2}\n\n'
              )
            })
            .mockResolvedValueOnce({ done: true })
        })
      },
      ok: true,
      status: 200
    };
    const fetchMock = vi.fn().mockResolvedValue(terminalResponse);
    vi.stubGlobal('fetch', fetchMock);
    const terminalEvents = [];

    const eventStream = openFeedRefreshEvents('completed-job');
    eventStream.addEventListener('done', event => terminalEvents.push(event));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(terminalEvents).toHaveLength(1);
    expect(terminalEvents[0]).toMatchObject({
      data: '{"processedFeeds":2,"totalFeeds":2}',
      type: 'done'
    });
    eventStream.close();
  });

  // Verifies client errors remain terminal while server failures remain eligible for reconnect.
  it('does not reconnect after a non-retryable HTTP response', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal('fetch', fetchMock);

    const eventStream = openFeedRefreshEvents('terminal-job');
    await vi.advanceTimersByTimeAsync(10000);

    expect(fetchMock).toHaveBeenCalledOnce();
    eventStream.close();
  });
});
