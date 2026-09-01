import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFeed,
  deleteFeed,
  fetchFeedCrawlResult,
  fetchFeedObservability,
  fetchFeeds,
  muteFeed,
  recalculateFeedTrust,
  rediscoverRss,
  retryFeed,
  startFeedRefresh,
  updateFeed,
  validateFeed
} from '../src/api/feeds.js';
import {
  OPML_PREVIEW_TIMEOUT_MS,
  exportOpml,
  getOpmlPreviewStatus,
  importOpml,
  pollOpmlPreview,
  previewOpml
} from '../src/api/opml.js';

const { del, get, post, put } = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn()
}));

vi.mock('../src/api/client', () => ({
  default: {
    defaults: { headers: { common: {} } },
    delete: del,
    get,
    post,
    put
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('feeds API contracts', () => {
  // Verifies feed retrieval and validation retain the URL and category.
  it('builds feed retrieval and validation requests', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123456);
    fetchFeeds();
    fetchFeeds({ forceRefresh: true });
    validateFeed('https://example.com/feed.xml', 3);

    expect(get).toHaveBeenNthCalledWith(1, '/feeds');
    expect(get).toHaveBeenNthCalledWith(2, '/feeds', {
      params: { refreshedAt: 123456 }
    });
    expect(post).toHaveBeenCalledWith('/feeds/validate', {
      url: 'https://example.com/feed.xml',
      categoryId: 3
    });
  });

  // Verifies observability snapshots and selected crawl details use nested feed routes.
  it('builds feed observability requests', () => {
    fetchFeedObservability(7);
    fetchFeedCrawlResult(7, 91);
    retryFeed(7);

    expect(get).toHaveBeenNthCalledWith(1, '/feeds/7/observability');
    expect(get).toHaveBeenNthCalledWith(2, '/feeds/7/crawls/91');
    expect(post).toHaveBeenCalledWith('/feeds/7/retry', null, { timeout: 120000 });
  });

  // Verifies feed creation sends every supported property without reshaping values.
  it('builds the feed creation request', () => {
    const feed = {
      categoryId: 3,
      feedName: 'Example',
      feedDesc: 'Description',
      feedType: 'rss',
      url: 'https://example.com/feed.xml',
      status: 'active',
      crawlSince: '2026-01-01'
    };

    createFeed(feed);

    expect(post).toHaveBeenCalledWith('/feeds', feed);
  });

  // Verifies feed update, mute, rediscovery, and deletion use the selected feed identifier.
  it('builds feed mutation requests', () => {
    const updates = {
      feedName: 'Updated',
      categoryId: 4,
      status: 'disabled'
    };

    muteFeed(7, '2026-08-01T00:00:00.000Z');
    updateFeed(7, updates);
    rediscoverRss(7);
    deleteFeed(7);

    expect(post).toHaveBeenNthCalledWith(1, '/feeds/mute/7', {
      mutedUntil: '2026-08-01T00:00:00.000Z'
    });
    expect(put).toHaveBeenCalledWith('/feeds/7', updates);
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/feeds/7/rediscover-rss'
    );
    expect(del).toHaveBeenCalledWith('/feeds/7');
  });

  // Verifies refresh jobs and trust recalculation use their operational timeout contracts.
  it('builds feed maintenance requests', () => {
    startFeedRefresh();
    recalculateFeedTrust();

    expect(post).toHaveBeenNthCalledWith(1, '/feeds/refresh');
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/feeds/recalculate-trust',
      null,
      { timeout: 120000 }
    );
  });
});

describe('OPML API contracts', () => {
  // Verifies OPML export requests a blob response.
  it('builds the OPML export request', () => {
    exportOpml();

    expect(get).toHaveBeenCalledWith('/opml/export', {
      responseType: 'blob'
    });
  });

  // Verifies OPML preview posts the selected file as multipart form data.
  it('builds the OPML preview request', () => {
    const file = new File(['<opml />'], 'feeds.opml', {
      type: 'text/xml'
    });

    previewOpml(file);

    expect(post).toHaveBeenCalledWith(
      '/opml/preview',
      expect.any(FormData),
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: OPML_PREVIEW_TIMEOUT_MS
      }
    );
    expect(OPML_PREVIEW_TIMEOUT_MS).toBe(300000);
    const formData = post.mock.calls[0][1];
    expect(formData.get('opmlFile')).toBe(file);
  });

  it('polls OPML preview progress until the completed JSON is returned', async () => {
    const progress = vi.fn();
    const waitForNextPoll = vi.fn().mockResolvedValue();
    const preview = {
      subscriptionCount: 1,
      categories: [],
      subscriptions: [{ inputUrl: 'https://example.test/feed' }]
    };
    get
      .mockResolvedValueOnce({
        data: {
          previewId: 'job/id',
          status: 'running',
          checkedFeeds: 37,
          totalFeeds: 120
        }
      })
      .mockResolvedValueOnce({
        data: {
          previewId: 'job/id',
          status: 'completed',
          checkedFeeds: 120,
          totalFeeds: 120,
          preview
        }
      });

    await expect(pollOpmlPreview({
      previewId: 'job/id',
      status: 'running',
      checkedFeeds: 0,
      totalFeeds: 120
    }, {
      onProgress: progress,
      clock: () => 1000,
      waitForNextPoll
    })).resolves.toBe(preview);

    expect(get).toHaveBeenNthCalledWith(
      1,
      '/opml/preview/job%2Fid/status',
      { timeout: 15000 }
    );
    expect(get).toHaveBeenCalledTimes(2);
    expect(waitForNextPoll).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'completed',
      checkedFeeds: 120
    }));
  });

  it('builds a direct OPML preview status request', () => {
    getOpmlPreviewStatus('preview-job');

    expect(get).toHaveBeenCalledWith(
      '/opml/preview/preview-job/status',
      { timeout: 15000 }
    );
  });

  it('stops polling on failed jobs and at the five-minute client deadline', async () => {
    await expect(pollOpmlPreview({
      previewId: 'failed-job',
      status: 'failed',
      error: 'Validation failed'
    })).rejects.toThrow('Validation failed');

    const clock = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValue(OPML_PREVIEW_TIMEOUT_MS);
    await expect(pollOpmlPreview({
      previewId: 'slow-job',
      status: 'running',
      checkedFeeds: 37,
      totalFeeds: 120
    }, {
      clock,
      waitForNextPoll: vi.fn()
    })).rejects.toThrow('OPML preview validation timed out');
    expect(get).not.toHaveBeenCalled();
  });

  // Verifies OPML import posts the editable preview as JSON.
  it('builds the OPML import request', () => {
    const preview = {
      subscriptionCount: 1,
      categories: [],
      subscriptions: [{ inputUrl: 'https://example.test/feed' }]
    };

    importOpml(preview);

    expect(post).toHaveBeenCalledWith(
      '/opml/import',
      preview,
      { timeout: 60000 }
    );
  });
});
