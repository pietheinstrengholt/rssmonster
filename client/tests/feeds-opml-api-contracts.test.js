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
  startFeedRefresh,
  updateFeed,
  validateFeed
} from '../src/api/feeds.js';
import {
  exportOpml,
  importOpml
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
    fetchFeeds();
    validateFeed('https://example.com/feed.xml', 3);

    expect(get).toHaveBeenCalledWith('/feeds');
    expect(post).toHaveBeenCalledWith('/feeds/validate', {
      url: 'https://example.com/feed.xml',
      categoryId: 3
    });
  });

  // Verifies observability snapshots and selected crawl details use nested feed routes.
  it('builds feed observability requests', () => {
    fetchFeedObservability(7);
    fetchFeedCrawlResult(7, 91);

    expect(get).toHaveBeenNthCalledWith(1, '/feeds/7/observability');
    expect(get).toHaveBeenNthCalledWith(2, '/feeds/7/crawls/91');
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

  // Verifies OPML import posts the selected file as multipart form data.
  it('builds the OPML import request', () => {
    const file = new File(['<opml />'], 'feeds.opml', {
      type: 'text/xml'
    });

    importOpml(file);

    expect(post).toHaveBeenCalledWith(
      '/opml/import',
      expect.any(FormData),
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    const formData = post.mock.calls[0][1];
    expect(formData.get('opmlFile')).toBe(file);
  });
});
