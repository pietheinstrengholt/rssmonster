import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsFeedsOverview from '../src/components/model/SettingsFeedsOverview.vue';
import {
  fetchFeeds,
  recalculateFeedTrust
} from '../src/api/feeds';
import {
  exportOpml,
  importOpml
} from '../src/api/opml';

vi.mock('../src/api/feeds', () => ({
  fetchFeeds: vi.fn(),
  recalculateFeedTrust: vi.fn()
}));

vi.mock('../src/api/opml', () => ({
  exportOpml: vi.fn(),
  importOpml: vi.fn()
}));

// Creates a feed-overview context with live computed properties and store actions.
const createContext = (overrides = {}) => {
  const context = {
    ...SettingsFeedsOverview.data(),
    $emit: vi.fn(),
    $store: {
      data: {
        selectFeed: vi.fn(),
        setShowModal: vi.fn()
      }
    },
    ...SettingsFeedsOverview.methods,
    ...overrides
  };

  for (const [name, getter] of Object.entries(SettingsFeedsOverview.computed)) {
    Object.defineProperty(context, name, {
      configurable: true,
      get: () => getter.call(context)
    });
  }

  return context;
};

// Returns representative feeds for filtering, health, and statistics behavior.
const createFeeds = () => [
  {
    id: 1,
    categoryId: 10,
    feedName: 'Active News',
    url: 'https://active.example/feed',
    status: 'active',
    feedTrust: 0.9,
    articleCount: 120
  },
  {
    id: 2,
    categoryId: 20,
    feedName: 'Broken Feed',
    url: 'https://broken.example/feed',
    status: 'error',
    feedTrust: 0.2,
    articleCount: '30'
  },
  {
    id: 3,
    categoryId: 20,
    feedName: 'Paused Feed',
    url: null,
    status: 'disabled',
    feedTrust: null,
    articleCount: null
  }
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchFeeds.mockResolvedValue({ data: { feeds: createFeeds() } });
});

describe('SettingsFeedsOverview actions', () => {
  // Verifies successful, malformed, and failed feed responses finalize loading state.
  it('loads populated feeds and handles malformed or failed responses', async () => {
    const context = createContext();

    await context.fetchFeeds();
    expect(context.feeds).toEqual(createFeeds());
    expect(context.feedsLoading).toBe(false);
    expect(context.feedsError).toBeNull();

    fetchFeeds.mockResolvedValueOnce({ data: { feeds: 'invalid' } });
    await context.fetchFeeds();
    expect(context.feeds).toEqual([]);

    fetchFeeds.mockRejectedValueOnce(new Error('offline'));
    await context.fetchFeeds();
    expect(context.feedsError).toBe('Could not load feeds. Please try again.');
    expect(context.feedsLoading).toBe(false);
  });

  // Verifies search and status filters combine case-insensitively.
  it('filters feeds by status, name, and URL', () => {
    const context = createContext();
    context.feeds = createFeeds();
    context.statusFilter = 'error';
    context.searchQuery = 'BROKEN.EXAMPLE';

    expect(context.filteredFeeds.map(feed => feed.id)).toEqual([2]);

    context.statusFilter = 'all';
    context.searchQuery = 'feed';
    expect(context.filteredFeeds.map(feed => feed.id)).toEqual([1, 2, 3]);
  });

  // Verifies aggregate feed statistics normalize numeric article totals.
  it('derives feed totals and statuses', () => {
    const context = createContext();
    context.feeds = createFeeds();

    expect(context.feedStats.map(stat => [stat.label, stat.value])).toEqual([
      ['Total Feeds', 3],
      ['Active Feeds', 1],
      ['Feeds with Errors', 1],
      ['Total Articles', '150']
    ]);
  });

  // Verifies status, health, row, trust, score, and coverage formatting boundaries.
  it('formats feed health and score presentation', () => {
    const context = createContext();
    const [active, error, disabled] = createFeeds();

    expect(context.feedStatus({ status: 'ACTIVE' })).toBe('active');
    expect(context.feedStatus({})).toBe('disabled');
    expect(context.feedHealth(active)).toBe('Excellent');
    expect(context.feedHealth({ ...active, feedTrust: 0.4 })).toBe('Good');
    expect(context.feedHealth(error)).toBe('Error');
    expect(context.feedHealth(disabled)).toBe('Disabled');
    expect(context.feedRowClass(error)).toBe('feeds-table-row--error');
    expect(context.feedRowClass(disabled)).toBe('feeds-table-row--disabled');
    expect(context.feedRowClass(active)).toBe('');
    expect(context.trustProgress(1.5)).toBe(100);
    expect(context.trustProgress(-0.4)).toBe(0);
    expect(context.trustProgress('invalid')).toBeNull();
    expect(context.formatScore(0.876)).toBe('88%');
    expect(context.formatScore(null)).toBe('-');
    expect(context.formatCoverage(87.66)).toBe('87.7%');
    expect(context.formatCoverage('invalid')).toBe('-');
  });

  // Verifies editing selects the feed through store actions and ignores an empty selection.
  it('opens feed editing through the store contract', () => {
    const context = createContext();

    context.openFeedEdit(createFeeds()[0]);
    context.openFeedEdit(null);

    expect(context.$store.data.selectFeed).toHaveBeenCalledWith(1, 10);
    expect(context.$store.data.setShowModal).toHaveBeenCalledWith('UpdateFeed');
    expect(context.$store.data.selectFeed).toHaveBeenCalledOnce();
  });

  // Verifies OPML export uses the server filename and releases browser resources.
  it('downloads and cleans up an OPML export', async () => {
    const context = createContext();
    const createObjectURL = vi.fn().mockReturnValue('blob:opml');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL
    });
    exportOpml.mockResolvedValue({
      data: '<opml />',
      headers: {
        'content-disposition': 'attachment; filename="feeds.opml"'
      }
    });

    await context.downloadOpml();

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:opml');
    expect(document.querySelector('a[download="feeds.opml"]')).toBeNull();
  });

  // Verifies OPML export failures remain in component-local error state.
  it('reports OPML export failures', async () => {
    const context = createContext();
    exportOpml.mockRejectedValue(new Error('export failed'));

    await context.downloadOpml();

    expect(context.opmlError)
      .toBe('Could not download the OPML export. Please try again.');
  });

  // Verifies a selected OPML file is imported, refreshed, emitted, and cleared.
  it('imports an OPML file and refreshes the overview', async () => {
    const context = createContext({
      fetchFeeds: vi.fn().mockResolvedValue()
    });
    const file = new File(['<opml />'], 'feeds.opml', {
      type: 'text/xml'
    });
    const target = { files: [file], value: 'C:\\fakepath\\feeds.opml' };
    importOpml.mockResolvedValue({
      data: { categoriesCreated: 2, feedsCreated: 5 }
    });

    await SettingsFeedsOverview.methods.handleFileSelect.call(context, { target });

    expect(importOpml).toHaveBeenCalledWith(file);
    expect(context.opmlMessage)
      .toBe('Import completed: 2 categories and 5 feeds added.');
    expect(context.fetchFeeds).toHaveBeenCalledOnce();
    expect(context.$emit).toHaveBeenCalledWith('saved');
    expect(target.value).toBe('');
  });

  // Verifies missing files are ignored and failed imports clear the file input.
  it('handles missing and failed OPML imports', async () => {
    const context = createContext();
    const emptyTarget = { files: [], value: '' };
    await context.handleFileSelect({ target: emptyTarget });
    expect(importOpml).not.toHaveBeenCalled();

    const file = new File(['invalid'], 'bad.opml');
    const target = { files: [file], value: 'selected' };
    importOpml.mockRejectedValue(new Error('invalid'));
    await context.handleFileSelect({ target });

    expect(context.opmlError)
      .toBe('Could not import this OPML file. Check the file and try again.');
    expect(target.value).toBe('');
    expect(context.$emit).not.toHaveBeenCalled();
  });

  // Verifies trust recalculation reports partial success, refreshes, and finalizes loading.
  it('recalculates feed trust and reports partial failures', async () => {
    const context = createContext({
      fetchFeeds: vi.fn().mockResolvedValue()
    });
    recalculateFeedTrust.mockResolvedValue({
      data: { updatedCount: 8, failedCount: 2 }
    });

    await SettingsFeedsOverview.methods.handleRecalculateFeedTrust.call(context);

    expect(context.feedTrustMessage)
      .toBe('Feed scores recalculated for 8 feeds. 2 failed.');
    expect(context.fetchFeeds).toHaveBeenCalledOnce();
    expect(context.$emit).toHaveBeenCalledWith('saved');
    expect(context.feedTrustLoading).toBe(false);
  });

  // Verifies failed trust recalculation exposes an error and releases loading state.
  it('reports trust recalculation failures', async () => {
    const context = createContext();
    recalculateFeedTrust.mockRejectedValue(new Error('failed'));

    await context.handleRecalculateFeedTrust();

    expect(context.feedTrustError)
      .toBe('Could not recalculate feed scores. Please try again.');
    expect(context.feedTrustLoading).toBe(false);
    expect(context.$emit).not.toHaveBeenCalled();
  });
});
