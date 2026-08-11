import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { triggerCrawl } from '../src/api/crawl.js';
import { startFeedRefresh } from '../src/api/feeds.js';
import { openFeedRefreshEvents } from '../src/services/feedRefreshStream.js';
import { ACTION_ERROR_EVENT } from '../src/services/actionNotifications.js';
import { useFeedRefreshStore } from '../src/store/feedRefresh.js';

vi.mock('../src/api/crawl.js', () => ({
  triggerCrawl: vi.fn()
}));

vi.mock('../src/api/feeds.js', () => ({
  startFeedRefresh: vi.fn()
}));

vi.mock('../src/services/feedRefreshStream.js', async importOriginal => ({
  ...await importOriginal(),
  openFeedRefreshEvents: vi.fn()
}));

// Creates a controllable EventSource-compatible refresh stream.
const createEventSource = () => {
  const handlers = {};
  const eventSource = {
    addEventListener: vi.fn((type, handler) => {
      handlers[type] = handler;
    }),
    close: vi.fn(),
    removeEventListener: vi.fn(),
    onerror: null,
    onopen: null
  };
  return { eventSource, handlers };
};

let store;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  setActivePinia(createPinia());
  store = useFeedRefreshStore();
});

afterEach(() => {
  store.teardown();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('feed refresh store', () => {
  // Verifies one job owns progress, duplicate-start protection, completion, and teardown.
  it('runs one live refresh job and publishes successful completion', async () => {
    const { eventSource, handlers } = createEventSource();
    startFeedRefresh.mockResolvedValue({
      data: { jobId: 'job-7', reused: true }
    });
    openFeedRefreshEvents.mockReturnValue(eventSource);

    await store.startRefresh();
    await store.startRefresh();

    expect(startFeedRefresh).toHaveBeenCalledOnce();
    expect(openFeedRefreshEvents).toHaveBeenCalledWith('job-7');
    expect(store.currentJobId).toBe('job-7');
    expect(store.progress.logs.join(' ')).toContain('Resuming live updates');

    eventSource.onopen();
    handlers.progress({
      data: JSON.stringify({
        feedName: 'Example feed',
        newArticles: 3,
        processedFeeds: 1,
        totalFeeds: 2
      }),
      type: 'progress'
    });
    handlers.done({
      data: JSON.stringify({ processedFeeds: 2, totalFeeds: 2 }),
      type: 'done'
    });

    expect(store.progress).toMatchObject({
      currentFeedLabel: '2/2 feeds',
      newArticles: 0,
      processedFeeds: 2,
      progressPercent: 100,
      totalFeeds: 2,
      visible: true
    });
    expect(eventSource.close).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(500);
    expect(store).toMatchObject({
      completionStatus: 'success',
      currentJobId: null,
      running: false,
      successfulCompletionId: 1
    });
    expect(store.progress.visible).toBe(false);
  });

  // Verifies named events, invalid JSON, and disconnect errors preserve existing diagnostics.
  it('handles every progress event and disconnected streams', async () => {
    const { eventSource, handlers } = createEventSource();
    startFeedRefresh.mockResolvedValue({ data: { jobId: 'job-events' } });
    openFeedRefreshEvents.mockReturnValue(eventSource);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await store.startRefresh();
    for (const [type, payload] of [
      ['refresh_started', { totalFeeds: 2 }],
      ['feed_started', { feedId: 1 }],
      ['feed_parsed', { entries: 4, feedName: 'Feed A' }],
      ['articles_inserted_updated', { feedId: 1, feedNewArticles: 2, feedUpdatedArticles: 1 }],
      ['feed_error', { feedId: 1 }],
      ['feed_completed', { feedName: 'Feed A' }],
      ['progress', { currentFeed: 1, errors: 1, newArticles: 2, totalFeeds: 2 }]
    ]) {
      handlers[type]({ data: JSON.stringify(payload), type });
    }
    handlers.progress({ data: '{invalid', type: 'progress' });

    expect(store.progress.progressPercent).toBe(50);
    expect(store.progress.logs.join(' ')).toContain('Received invalid progress payload');
    expect(console.warn).toHaveBeenCalledWith('Invalid SSE payload', expect.any(SyntaxError));

    eventSource.onerror();
    await vi.advanceTimersByTimeAsync(500);
    expect(store.completionStatus).toBe('error');
    expect(store.successfulCompletionId).toBe(0);
  });

  // Verifies callbacks from a closed generation cannot mutate the replacement job.
  it('ignores stale stream callbacks after explicit teardown', () => {
    const { eventSource, handlers } = createEventSource();
    openFeedRefreshEvents.mockReturnValue(eventSource);

    store.openEventStream('job-stale');
    store.closeEventStream();
    handlers.progress({
      data: JSON.stringify({ processedFeeds: 1, totalFeeds: 1 }),
      type: 'progress'
    });

    expect(store.progress.processedFeeds).toBe(0);
    expect(eventSource.removeEventListener).toHaveBeenCalledTimes(9);
    expect(eventSource.close).toHaveBeenCalledOnce();
  });

  // Verifies a startup response from an invalidated session cannot reopen its stream.
  it('ignores a stale startup response after session reset', async () => {
    let resolveStart;
    startFeedRefresh.mockReturnValue(new Promise(resolve => {
      resolveStart = resolve;
    }));

    const pendingRefresh = store.startRefresh();
    store.resetSessionState();
    resolveStart({ data: { jobId: 'stale-job' } });
    await pendingRefresh;

    expect(openFeedRefreshEvents).not.toHaveBeenCalled();
    expect(store).toMatchObject({
      completionStatus: 'idle',
      currentJobId: null,
      running: false
    });
  });

  // Verifies startup failures use the legacy endpoint and retain the existing display delay.
  it('falls back when live startup cannot provide a job', async () => {
    startFeedRefresh.mockResolvedValue({ data: {} });
    triggerCrawl.mockResolvedValue({});

    await store.startRefresh();
    expect(triggerCrawl).toHaveBeenCalledOnce();
    expect(store.progress.visible).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    expect(store).toMatchObject({
      completionStatus: 'fallback-complete',
      running: false
    });
    expect(store.progress.visible).toBe(false);
    expect(store.progress.logs[0]).toContain('Standard refresh completed');
  });

  // Verifies a failed fallback publishes safe feedback while retaining diagnostic state.
  it('reports a safe error when both refresh paths fail', async () => {
    const liveError = new Error('live endpoint unavailable');
    const fallbackError = new Error('crawler database detail');
    const notifications = [];
    // This handler retains recoverable notification details for assertions.
    const handleNotification = event => notifications.push(event.detail);
    window.addEventListener(ACTION_ERROR_EVENT, handleNotification);
    startFeedRefresh.mockRejectedValue(liveError);
    triggerCrawl.mockRejectedValue(fallbackError);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await store.startRefresh();

    expect(store.completionStatus).toBe('error');
    expect(store.error).toEqual({ message: fallbackError.message });
    expect(notifications).toEqual([{
      message: 'Could not refresh feeds. Please try again.'
    }]);
    expect(console.error).toHaveBeenCalledWith(
      'Error refreshing feeds after stream fallback:',
      fallbackError
    );
    window.removeEventListener(ACTION_ERROR_EVENT, handleNotification);
  });
});
