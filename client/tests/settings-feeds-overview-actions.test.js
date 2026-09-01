import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsFeedsOverview from '../src/components/settings/SettingsFeedsOverview.vue';
import {
  fetchFeeds,
  recalculateFeedTrust
} from '../src/api/feeds';
import {
  exportOpml,
  importOpml,
  pollOpmlPreview,
  previewOpml
} from '../src/api/opml';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/feeds', () => ({
  fetchFeeds: vi.fn(),
  recalculateFeedTrust: vi.fn()
}));

vi.mock('../src/api/opml', () => ({
  exportOpml: vi.fn(),
  importOpml: vi.fn(),
  pollOpmlPreview: vi.fn(),
  previewOpml: vi.fn()
}));

// Creates a feed-overview context with live computed properties and store actions.
const createContext = (overrides = {}) => {
  const stores = createFocusedStores({
    selection: { selectFeed: vi.fn() },
    ui: { setShowModal: vi.fn() }
  });
  const context = {
    ...SettingsFeedsOverview.data(),
    ...stores,
    $emit: vi.fn(),
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
    health: 'HEALTHY',
    reliabilityPct: 98.5,
    lastCrawlAt: '2026-08-10T08:55:00.000Z',
    lastCrawlStatus: 'SUCCESS',
    lastCrawlErrorCategory: null,
    lastSuccessfulCrawlAt: '2026-08-10T08:55:00.000Z',
    consecutiveFailures: 0,
    feedTrust: 0.9,
    articleCount: 120
  },
  {
    id: 2,
    categoryId: 20,
    feedName: 'Broken Feed',
    url: 'https://broken.example/feed',
    status: 'error',
    health: 'FAILING',
    reliabilityPct: 62,
    lastCrawlAt: '2026-08-10T08:50:00.000Z',
    lastCrawlStatus: 'FAILED',
    lastCrawlErrorCategory: 'REQUEST_TIMEOUT',
    lastSuccessfulCrawlAt: '2026-08-09T08:50:00.000Z',
    consecutiveFailures: 3,
    feedTrust: 0.2,
    articleCount: '30'
  },
  {
    id: 3,
    categoryId: 20,
    feedName: 'Paused Feed',
    url: null,
    status: 'disabled',
    health: 'DISABLED',
    reliabilityPct: null,
    lastCrawlAt: null,
    lastCrawlStatus: null,
    lastCrawlErrorCategory: null,
    lastSuccessfulCrawlAt: null,
    consecutiveFailures: 0,
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
    expect(context.feeds[0]).toMatchObject({
      health: 'HEALTHY',
      reliabilityPct: 98.5,
      lastCrawlStatus: 'SUCCESS',
      lastCrawlErrorCategory: null,
      lastSuccessfulCrawlAt: '2026-08-10T08:55:00.000Z',
      consecutiveFailures: 0
    });
    expect(fetchFeeds).toHaveBeenCalledOnce();

    fetchFeeds.mockResolvedValueOnce({ data: { feeds: 'invalid' } });
    await context.fetchFeeds();
    expect(context.feeds).toEqual([]);

    fetchFeeds.mockRejectedValueOnce(new Error('offline'));
    await context.fetchFeeds();
    expect(context.feedsError).toBe('Could not load feeds. Please try again.');
    expect(context.feedsLoading).toBe(false);
  });

  it('does not restore a deleted feed from an older in-flight response', async () => {
    const context = createContext();
    context.overviewStore.deletedFeedIds = [2];

    await context.fetchFeeds();

    expect(context.feeds.map(feed => feed.id)).toEqual([1, 3]);
  });

  // Verifies search and backend health filters combine case-insensitively.
  it('filters feeds by health, name, and URL', () => {
    const context = createContext();
    context.feeds = createFeeds();
    context.healthFilter = 'FAILING';
    context.searchQuery = 'BROKEN.EXAMPLE';

    expect(context.filteredFeeds.map(feed => feed.id)).toEqual([2]);

    context.healthFilter = 'all';
    context.searchQuery = 'feed';
    expect(context.filteredFeeds.map(feed => feed.id)).toEqual([1, 2, 3]);

    context.feeds.push({ id: 4, feedName: 'Recovered Source', health: 'RECOVERED' });
    context.healthFilter = 'RECOVERED';
    context.searchQuery = '';
    expect(context.filteredFeeds.map(feed => feed.id)).toEqual([4]);

    context.feeds.push({ id: 5, feedName: 'Imported Source', health: 'NEW' });
    context.healthFilter = 'NEW';
    expect(context.filteredFeeds.map(feed => feed.id)).toEqual([5]);
  });

  // Verifies summary cards use backend health while excluding disabled feeds from attention.
  it('derives feed totals and health summaries', () => {
    const context = createContext();
    context.feeds = [
      ...createFeeds(),
      { id: 4, health: 'RECOVERED', articleCount: 0 },
      { id: 5, health: 'DEGRADED', articleCount: 0 },
      { id: 6, health: 'NEW', articleCount: 0 }
    ];

    expect(context.feedStats.map(stat => [stat.label, stat.value])).toEqual([
      ['Total Feeds', 6],
      ['Healthy Feeds', 1],
      ['Need Attention', 3],
      ['Total Articles', '150']
    ]);
  });

  // Verifies health, crawl, reliability, row, trust, score, and coverage formatting boundaries.
  it('formats feed health and score presentation', () => {
    const context = createContext();
    const [active, error, disabled] = createFeeds();
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-10T09:00:00.000Z').getTime());

    expect(context.feedStatus({ status: 'ACTIVE' })).toBe('active');
    expect(context.feedStatus({})).toBe('disabled');
    expect(context.feedHealthLabel(active)).toBe('Healthy');
    expect(context.feedHealthLabel({ health: 'NEW' })).toBe('New');
    expect(context.feedHealthLabel({ health: 'RECOVERED' })).toBe('Recovered');
    expect(context.feedHealthLabel({ health: 'DEGRADED' })).toBe('Degraded');
    expect(context.feedHealthLabel(error)).toBe('Failing');
    expect(context.feedHealthLabel(disabled)).toBe('Disabled');
    expect(context.feedHealthLabel({})).toBe('Unknown');
    expect(context.feedRowClass(error)).toBe('feeds-table-row--failing');
    expect(context.feedRowClass({ health: 'NEW' })).toBe('feeds-table-row--new');
    expect(context.feedRowClass({ health: 'RECOVERED' })).toBe('feeds-table-row--recovered');
    expect(context.feedRowClass({ health: 'DEGRADED' })).toBe('feeds-table-row--degraded');
    expect(context.feedRowClass(disabled)).toBe('feeds-table-row--disabled');
    expect(context.feedRowClass(active)).toBe('feeds-table-row--healthy');
    expect(context.trustProgress(1.5)).toBe(100);
    expect(context.trustProgress(-0.4)).toBe(0);
    expect(context.trustProgress('invalid')).toBeNull();
    expect(context.formatReliability(98.5)).toBe('99%');
    expect(context.formatReliability(62)).toBe('62%');
    expect(context.formatReliability(null)).toBe('—');
    expect(context.reliabilityProgress(null)).toBeNull();
    expect(context.reliabilityTone(99)).toBe('high');
    expect(context.reliabilityTone(84)).toBe('degraded');
    expect(context.reliabilityTone(12)).toBe('poor');
    expect(context.formatLastCrawl(active.lastCrawlAt)).toBe('5m ago');
    expect(context.formatLastCrawl(null)).toBe('Never');
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

    expect(context.selectionStore.selectFeed).toHaveBeenCalledWith(1, 10);
    expect(context.uiStore.setShowModal).toHaveBeenCalledWith('UpdateFeed');
    expect(context.selectionStore.selectFeed).toHaveBeenCalledOnce();
  });

  // Verifies local detail navigation retains the Feeds section and restores the overview.
  it('opens and closes feed details through local state', () => {
    const context = createContext();

    context.openFeedDetails(createFeeds()[0]);
    expect(context.selectedFeedId).toBe(1);

    context.closeFeedDetails();
    expect(context.selectedFeedId).toBeNull();
  });

  it('removes an explicitly deleted feed and returns from its details', () => {
    const context = createContext({
      feeds: createFeeds(),
      selectedFeedId: 2
    });
    context.reconcileDeletedFeeds([2]);

    expect(context.feeds.map(feed => feed.id)).toEqual([1, 3]);
    expect(context.selectedFeedId).toBeNull();
  });

  it('does not reconcile without a confirmed deletion', () => {
    const feeds = createFeeds();
    const context = createContext({ feeds, selectedFeedId: 2 });

    context.reconcileDeletedFeeds([]);

    expect(context.feeds).toEqual(feeds);
    expect(context.selectedFeedId).toBe(2);
    expect(context.$emit).not.toHaveBeenCalled();
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

  // Verifies a selected OPML file is previewed without changing subscriptions.
  it('previews a selected OPML file and clears the input', async () => {
    const context = createContext({
      fetchFeeds: vi.fn().mockResolvedValue()
    });
    const file = new File(['<opml />'], 'feeds.opml', {
      type: 'text/xml'
    });
    const target = { files: [file], value: 'C:\\fakepath\\feeds.opml' };
    const preview = {
      subscriptionCount: 5,
      categories: [{ name: 'News', subscriptionCount: 5 }],
      subscriptions: [{ inputUrl: 'https://example.test/feed' }]
    };
    previewOpml.mockResolvedValue({
      data: {
        previewId: 'preview-job',
        status: 'running',
        checkedFeeds: 0,
        totalFeeds: 5
      }
    });
    pollOpmlPreview.mockImplementation(async (_status, { onProgress }) => {
      onProgress({ checkedFeeds: 3, totalFeeds: 5 });
      return preview;
    });

    const previewRequest = SettingsFeedsOverview.methods.handleFileSelect.call(
      context,
      { target }
    );

    expect(context.opmlPreviewOpen).toBe(true);
    expect(context.opmlPreviewLoading).toBe(true);
    expect(context.opmlPreview).toBeNull();

    await previewRequest;

    expect(previewOpml).toHaveBeenCalledWith(file);
    expect(pollOpmlPreview).toHaveBeenCalledWith(
      expect.objectContaining({ previewId: 'preview-job' }),
      expect.objectContaining({ onProgress: expect.any(Function) })
    );
    expect(context.opmlPreview).toBe(preview);
    expect(context.opmlPreviewLoading).toBe(false);
    expect(context.opmlPreviewCheckedFeeds).toBe(3);
    expect(context.opmlPreviewTotalFeeds).toBe(5);
    expect(importOpml).not.toHaveBeenCalled();
    expect(context.fetchFeeds).not.toHaveBeenCalled();
    expect(context.$emit).not.toHaveBeenCalled();
    expect(target.value).toBe('');
  });

  // Verifies missing files are ignored and failed previews remain in the dialog.
  it('handles missing and failed OPML previews', async () => {
    const context = createContext();
    const emptyTarget = { files: [], value: '' };
    await context.handleFileSelect({ target: emptyTarget });
    expect(previewOpml).not.toHaveBeenCalled();

    const file = new File(['invalid'], 'bad.opml');
    const target = { files: [file], value: 'selected' };
    previewOpml.mockResolvedValue({
      data: {
        previewId: 'failed-job',
        status: 'running',
        checkedFeeds: 0,
        totalFeeds: 1
      }
    });
    pollOpmlPreview.mockRejectedValue(new Error('validation failed'));
    await context.handleFileSelect({ target });

    expect(context.opmlPreviewOpen).toBe(true);
    expect(context.opmlPreviewLoading).toBe(false);
    expect(context.opmlPreview).toBeNull();
    expect(context.opmlDialogError)
      .toBe('Could not preview this OPML file. Check the file and try again.');
    expect(target.value).toBe('');
    expect(context.$emit).not.toHaveBeenCalled();

    context.discardOpmlPreview();
    expect(context.opmlPreviewOpen).toBe(false);
    expect(context.opmlDialogError).toBeNull();
  });

  it('imports an approved preview and refreshes the overview', async () => {
    const preview = {
      subscriptionCount: 5,
      categories: [],
      subscriptions: [{ inputUrl: 'https://example.test/feed' }]
    };
    const context = createContext({
      opmlPreviewOpen: true,
      opmlPreview: preview,
      feeds: createFeeds()
    });
    const importedFeed = {
      id: 4,
      categoryId: 30,
      feedName: 'Imported Feed',
      url: 'https://imported.example/feed',
      status: 'active',
      health: 'HEALTHY'
    };
    importOpml.mockResolvedValue({
      data: { categoriesCreated: 1, feedsCreated: 1, feedsFailed: 1 }
    });
    fetchFeeds.mockResolvedValueOnce({
      data: { feeds: [...createFeeds(), importedFeed] }
    });

    const selectedPreview = {
      ...preview,
      subscriptionCount: 1,
      subscriptions: preview.subscriptions.slice(0, 1)
    };
    await context.confirmOpmlImport(selectedPreview);

    expect(importOpml).toHaveBeenCalledWith(selectedPreview);
    expect(context.opmlMessage)
      .toBe('Import completed: 1 category and 1 feed added. 1 feed could not be added.');
    expect(context.opmlPreview).toBeNull();
    expect(context.opmlPreviewOpen).toBe(false);
    expect(fetchFeeds).toHaveBeenCalledWith({ forceRefresh: true });
    expect(context.feeds).toHaveLength(4);
    expect(context.feeds.at(-1)).toEqual(importedFeed);
    expect(context.feedStats.find(stat => stat.label === 'Total Feeds')?.value)
      .toBe(4);
    expect(context.$emit).toHaveBeenCalledWith('saved');
    expect(context.opmlImporting).toBe(false);
  });

  it('keeps a failed import preview open and supports discarding it', async () => {
    const preview = {
      subscriptionCount: 1,
      categories: [],
      subscriptions: [{ inputUrl: 'https://example.test/feed' }]
    };
    const context = createContext({ opmlPreviewOpen: true, opmlPreview: preview });
    importOpml.mockRejectedValue(new Error('failed'));

    await context.confirmOpmlImport();

    expect(context.opmlPreview).toBe(preview);
    expect(context.opmlDialogError)
      .toBe('Could not import these subscriptions. Please try again.');

    context.discardOpmlPreview();
    expect(context.opmlPreviewOpen).toBe(false);
    expect(context.opmlPreview).toBeNull();
    expect(context.opmlDialogError).toBeNull();
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
