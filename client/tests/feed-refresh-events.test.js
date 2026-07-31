import { afterEach, describe, expect, it, vi } from 'vitest';
import api, { setAuthToken } from '../src/api/client.js';
import { openFeedRefreshEvents } from '../src/api/feeds.js';

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
  setAuthToken(null);
  vi.unstubAllGlobals();
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
      `${import.meta.env.VITE_VUE_APP_HOSTNAME}/api/feeds/refresh/job-7/events`
    );
    expect(requestUrl).not.toContain(token);
    expect(requestUrl).not.toContain('token=');
    expect(requestOptions.headers).toEqual({
      Accept: 'text/event-stream',
      Authorization: api.defaults.headers.common.Authorization
    });
  });
});
