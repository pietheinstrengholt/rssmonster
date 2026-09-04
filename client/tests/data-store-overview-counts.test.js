import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';
import { fetchSettings } from '../src/api/settings';
import {
  fetchOverview,
  fetchOverviewCounts,
  fetchOverviewLite
} from '../src/api/manager';
import { fetchSmartFolderCounts } from '../src/api/smartfolders';
import { fetchTopTags } from '../src/api/tags';

vi.mock('../src/api/settings', () => ({
  fetchSettings: vi.fn()
}));

vi.mock('../src/api/manager', () => ({
  fetchOverview: vi.fn(),
  fetchOverviewCounts: vi.fn(),
  fetchOverviewLite: vi.fn()
}));

vi.mock('../src/api/smartfolders', () => ({
  fetchSmartFolders: vi.fn(),
  fetchSmartFolderCounts: vi.fn()
}));

vi.mock('../src/api/tags', () => ({
  fetchTopTags: vi.fn()
}));

// This function creates a response whose completion is controlled by an ordering test.
const deferred = () => {
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

// Creates a fresh real Pinia overview store for overview and count tests.
const createStore = () => {
  setActivePinia(createPinia());
  return useOverviewStore();
};

// Builds a complete overview response with optionally overridden fields.
const createOverview = (overrides = {}) => ({
  briefingCount: 2,
  briefingSelectionPeriod: '7d',
  briefingIncludeOnlyUnreadArticles: false,
  briefingMarkAsReadOnScroll: false,
  briefingPrioritizeHighTrust: false,
  unreadCount: 5,
  readCount: 4,
  favoriteCount: 3,
  hotCount: 2,
  clickedCount: 1,
  categories: [{
    id: 1,
    briefingCount: 2,
    unreadCount: 5,
    readCount: 4,
    favoriteCount: 3,
    feeds: [{
      id: 10,
      categoryId: 1,
      briefingCount: 2,
      unreadCount: 5,
      readCount: 4,
      favoriteCount: 3
    }]
  }],
  ...overrides
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchSettings.mockResolvedValue({
    data: {
      themeMode: 'dark',
      viewMode: 'minimal',
      grouping: 'topic',
      sort: 'quality'
    }
  });
  fetchOverview.mockResolvedValue({ data: createOverview() });
  fetchOverviewLite.mockResolvedValue({
    data: { categories: createOverview().categories }
  });
  fetchOverviewCounts.mockResolvedValue({ data: createOverview() });
  fetchTopTags.mockResolvedValue({ data: { tags: [] } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('data store overview and count behavior', () => {
  // Verifies initial overview loading applies settings, normalized structure, and counters.
  it('initializes settings and a full overview', async () => {
    const store = createStore();

    await store.fetchOverview({ initial: true });

    expect(fetchSettings).toHaveBeenCalledOnce();
    expect(fetchOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        viewMode: 'minimal',
        grouping: 'topic',
        sort: 'quality'
      })
    );
    expect(useUiStore().themeMode).toBe('dark');
    expect(store.categories[0].feeds[0]).toMatchObject({
      briefingCount: 2,
      unreadCount: 5,
      readCount: 4,
      favoriteCount: 3,
      errorCount: 0
    });
    expect(store.unreadCount).toBe(5);
    expect(store.unreadsSinceLastUpdate).toBe(0);
  });

  // Verifies ordinary and forced overview updates calculate unread deltas correctly.
  it('tracks unread deltas unless the refresh is forced', () => {
    const store = createStore();
    useOverviewStore().$patch({ unreadCount: 3, unreadsSinceLastUpdate: 8 });

    store.updateOverview(createOverview({ unreadCount: 7 }));
    expect(store.unreadsSinceLastUpdate).toBe(4);

    store.updateOverview(createOverview({ unreadCount: 9 }), {
      forceUpdate: true
    });
    expect(store.unreadsSinceLastUpdate).toBe(0);
  });

  // Verifies split overview loading publishes structure before background counts.
  it('loads split overview structure and then refreshes counts', async () => {
    const store = createStore();
    fetchOverviewLite.mockResolvedValue({
      data: {
        categories: [{
          id: 2,
          name: 'Technology',
          feeds: [{ id: 20, feedName: 'Example Feed', unreadCount: -4 }]
        }]
      }
    });
    let resolveCounts;
    // Holds counts until the structure-only state has been asserted.
    fetchOverviewCounts.mockReturnValue(new Promise(resolve => {
      resolveCounts = resolve;
    }));

    await store.fetchOverviewSplit({ forceUpdate: true });

    expect(store.categories[0].feeds[0].unreadCount).toBe(0);
    resolveCounts({
      data: createOverview({
        unreadCount: 11,
        categories: [{
          id: 2,
          unreadCount: 11,
          feeds: [{ id: 20, unreadCount: 11 }]
        }]
      })
    });

    await vi.waitFor(() => {
      expect(store.unreadCount).toBe(11);
    });
    expect(store.categories[0].feeds[0]).toMatchObject({
      feedName: 'Example Feed',
      unreadCount: 11,
      readCount: 0,
      favoriteCount: 0,
      errorCount: 0
    });
    expect(store.categories[0].name).toBe('Technology');
  });

  // Verifies initial split counts establish a baseline before later background changes are announced.
  it('does not report the initial unread total as newly fetched articles', async () => {
    const store = createStore();
    fetchOverviewCounts
      .mockResolvedValueOnce({ data: createOverview({ unreadCount: 5 }) })
      .mockResolvedValueOnce({ data: createOverview({ unreadCount: 8 }) });

    await store.fetchOverviewSplit({ initial: true });
    await vi.waitFor(() => {
      expect(store.overviewCountsStatus).toBe('success');
    });

    expect(store.unreadCount).toBe(5);
    expect(store.unreadsSinceLastUpdate).toBe(0);

    await store.fetchOverviewCounts();

    expect(store.unreadCount).toBe(8);
    expect(store.unreadsSinceLastUpdate).toBe(3);
  });

  // Verifies Briefing preferences settle before the shell can mount its initial article feed.
  it('waits for initial Briefing filters before completing split overview loading', async () => {
    const counts = deferred();
    fetchSettings.mockResolvedValueOnce({
      data: {
        status: 'briefing',
        themeMode: 'system'
      }
    });
    fetchOverviewCounts.mockReturnValueOnce(counts.promise);
    const store = createStore();
    const selectionStore = useSelectionStore();
    let overviewResolved = false;

    const overviewRequest = store.fetchOverviewSplit({ initial: true }).then(result => {
      overviewResolved = true;
      return result;
    });
    await vi.waitFor(() => expect(fetchOverviewCounts).toHaveBeenCalledOnce());

    expect(overviewResolved).toBe(false);
    expect(selectionStore.currentSelection.search).toBeNull();

    counts.resolve({
      data: createOverview({
        briefingSelectionPeriod: '24h',
        briefingIncludeOnlyUnreadArticles: true,
        briefingPrioritizeHighTrust: true
      })
    });

    await expect(overviewRequest).resolves.toBe(true);
    expect(selectionStore.currentSelection.search)
      .toBe('briefing:true unread:true @today sort:recommended');
  });

  // Verifies count-free structure refreshes retain known counts when the count refresh fails.
  it('preserves existing category and feed counts across overview-lite refresh failure', async () => {
    const store = createStore();
    store.$patch({
      unreadCount: 5,
      readCount: 4,
      favoriteCount: 3,
      categories: [{
        id: 1,
        unreadCount: 5,
        readCount: 4,
        favoriteCount: 3,
        hotCount: 2,
        clickedCount: 1,
        feeds: [{
          id: 10,
          unreadCount: 5,
          readCount: 4,
          favoriteCount: 3,
          hotCount: 2,
          clickedCount: 1
        }]
      }]
    });
    fetchOverviewLite.mockResolvedValueOnce({
      data: {
        categories: [{
          id: 1,
          unreadCount: 0,
          readCount: 0,
          favoriteCount: 0,
          feeds: [
            { id: 10, unreadCount: 0, readCount: 0, favoriteCount: 0 },
            { id: 11, unreadCount: 0, readCount: 0, favoriteCount: 0 }
          ]
        }, {
          id: 2,
          unreadCount: 0,
          feeds: [{ id: 20, unreadCount: 0 }]
        }]
      }
    });
    fetchOverviewCounts.mockRejectedValueOnce(new Error('counts unavailable'));

    await store.fetchOverviewSplit();
    await vi.waitFor(() => {
      expect(store.overviewCountsStatus).toBe('error');
    });

    expect(store).toMatchObject({ unreadCount: 5, readCount: 4, favoriteCount: 3 });
    expect(store.categories[0]).toMatchObject({
      unreadCount: 5,
      readCount: 4,
      favoriteCount: 3,
      hotCount: 2,
      clickedCount: 1
    });
    expect(store.categories[0].feeds[0]).toMatchObject({
      unreadCount: 5,
      readCount: 4,
      favoriteCount: 3,
      hotCount: 2,
      clickedCount: 1
    });
    expect(store.categories[0].feeds[1]).toMatchObject({
      unreadCount: 0,
      readCount: 0,
      favoriteCount: 0
    });
    expect(store.categories[1]).toMatchObject({ unreadCount: 0, readCount: 0 });
  });

  // Verifies initial Top Tags wait for persisted grouping instead of using the default.
  it('starts initial Top Tags only after settings establish grouping', async () => {
    const settings = deferred();
    fetchSettings.mockReturnValueOnce(settings.promise);
    const store = createStore();

    const overviewRequest = store.fetchOverviewSplit({ initial: true });
    expect(fetchTopTags).not.toHaveBeenCalled();

    settings.resolve({ data: { grouping: 'topic' } });
    await overviewRequest;

    expect(fetchTopTags).toHaveBeenCalledOnce();
    expect(fetchTopTags).toHaveBeenCalledWith({
      grouping: 'topic',
      includeDevelopingEvents: false,
      status: 'unread'
    });
  });

  // Verifies count-free structure starts without waiting for persisted selection settings.
  it('requests initial overview structure concurrently with settings', async () => {
    const settings = deferred();
    fetchSettings.mockReturnValueOnce(settings.promise);
    const store = createStore();

    const overviewRequest = store.fetchOverviewSplit({ initial: true });

    expect(fetchSettings).toHaveBeenCalledOnce();
    expect(fetchOverviewLite).toHaveBeenCalledOnce();
    expect(store.categories).toEqual([]);

    settings.resolve({ data: { grouping: 'topic' } });
    await overviewRequest;

    expect(store.categories).toHaveLength(1);
  });

  // Verifies collection changes refresh scoped tags, including Daily Briefing.
  it('refreshes Top Tags when the article status changes', async () => {
    const store = createStore();
    const selectionStore = useSelectionStore();
    fetchTopTags.mockResolvedValueOnce({
      data: { tags: [{ name: 'security', count: 3 }] }
    });

    selectionStore.setSelectedStatus('favorite');
    await vi.waitFor(() => {
      expect(fetchTopTags).toHaveBeenCalledWith({
        grouping: 'none',
        includeDevelopingEvents: false,
        status: 'favorite'
      });
    });
    expect(store.topTags).toEqual([{ name: 'security', count: 3 }]);

    fetchTopTags.mockClear();
    selectionStore.setSelectedStatus('briefing');
    await vi.waitFor(() => {
      expect(fetchTopTags).toHaveBeenCalledWith({
        grouping: 'event',
        includeDevelopingEvents: false,
        status: 'briefing'
      });
    });
    expect(store.topTags).toEqual([]);
  });

  // Verifies active Briefing membership preference changes refresh its tag snapshot.
  it('refreshes Daily Briefing tags when eligibility preferences change', async () => {
    createStore();
    const selectionStore = useSelectionStore();
    selectionStore.setSelectedStatus('briefing');
    await vi.waitFor(() => expect(fetchTopTags).toHaveBeenCalled());
    fetchTopTags.mockClear();

    selectionStore.setBriefingFilters({
      selectionPeriod: '24h',
      includeOnlyUnreadArticles: true,
      markAsReadOnScroll: true,
      prioritizeHighTrust: false
    });
    await vi.waitFor(() => {
      expect(fetchTopTags).toHaveBeenCalledWith({
        grouping: 'event',
        includeDevelopingEvents: false,
        status: 'briefing'
      });
    });

    fetchTopTags.mockClear();
    selectionStore.refreshBriefingSelection();
    await vi.waitFor(() => expect(fetchTopTags).toHaveBeenCalledOnce());
  });

  // Verifies settings responses cannot inject persistence or unrelated fields into selection state.
  it('whitelists settings fields before updating current selection', async () => {
    fetchSettings.mockResolvedValueOnce({
      data: {
        AIEnabled: true,
        grouping: 'event',
        startupViewMode: 'default',
        themeMode: 'dark',
        unrelatedField: 'private',
        userId: 42,
        viewMode: 'reader'
      }
    });
    createStore();
    const selectionStore = useSelectionStore();

    await selectionStore.fetchSettings();

    expect(selectionStore.currentSelection).toMatchObject({
      AIEnabled: true,
      grouping: 'event',
      viewMode: 'reader'
    });
    expect(selectionStore.currentSelection).not.toHaveProperty('startupViewMode');
    expect(selectionStore.currentSelection).not.toHaveProperty('themeMode');
    expect(selectionStore.currentSelection).not.toHaveProperty('unrelatedField');
    expect(selectionStore.currentSelection).not.toHaveProperty('userId');
    expect(useUiStore().themeMode).toBe('dark');
  });

  // Verifies stale split responses cannot overwrite a newer overview request.
  it('ignores stale split overview responses', async () => {
    const store = createStore();
    let resolveFirst;
    // Holds the first overview until a newer request has completed.
    const firstResponse = new Promise(resolve => {
      resolveFirst = resolve;
    });
    fetchOverviewLite
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce({
        data: { categories: [{ id: 2, feeds: [] }] }
      });
    // Keeps background count refreshes from replacing the structure under test.
    fetchOverviewCounts.mockReturnValue(new Promise(() => {}));

    const firstRequest = store.fetchOverviewSplit();
    await store.fetchOverviewSplit();
    resolveFirst({
      data: { categories: [{ id: 1, feeds: [] }] }
    });
    await firstRequest;

    expect(store.categories.map(category => category.id)).toEqual([2]);
  });

  // Verifies Briefing filters normalize periods and update only active Briefing searches.
  it('builds Briefing searches with allowed periods and preferences', () => {
    createStore();
    const store = useSelectionStore();

    store.setSelectedStatus('briefing');
    expect(store.currentSelection.search).toBe('briefing:true @lastweek sort:recommended');
    expect(store.currentSelection.sort).toBe('recommended');
    expect(store.currentSelection.grouping).toBe('event');

    store.setBriefingFilters({
      selectionPeriod: '24h',
      includeOnlyUnreadArticles: true,
      markAsReadOnScroll: true,
      prioritizeHighTrust: true
    });
    expect(store.briefingSelectionPeriod).toBe('24h');
    expect(store.briefingMarkAsReadOnScroll).toBe(true);
    expect(store.currentSelection.search)
      .toBe('briefing:true unread:true @today sort:recommended');

    store.setBriefingSelectionPeriod('invalid');
    expect(store.briefingSelectionPeriod).toBe('7d');
    expect(store.currentSelection.search)
      .toBe('briefing:true unread:true @lastweek sort:recommended');

    const revision = store.currentSelection.briefingRevision;
    store.refreshBriefingSelection();
    expect(store.currentSelection.briefingRevision).toBe(revision + 1);

    store.setSelectedStatus('unread');
    store.refreshBriefingSelection();
    expect(store.currentSelection.briefingRevision).toBe(revision + 1);
  });

  // Verifies read transitions reconcile global, category, and feed counts without going negative.
  it('increases and decreases read counts with zero clamping', () => {
    const store = createStore();
    store.updateOverview(createOverview());
    const article = {
      feedId: 10,
      feed: { categoryId: 1 }
    };

    store.increaseReadCount(article);
    expect(store).toMatchObject({ unreadCount: 4, readCount: 5 });
    expect(store.categories[0]).toMatchObject({
      unreadCount: 4,
      readCount: 5
    });
    expect(store.categories[0].feeds[0]).toMatchObject({
      unreadCount: 4,
      readCount: 5
    });

    store.decreaseReadCount(article);
    expect(store).toMatchObject({ unreadCount: 5, readCount: 4 });

    useOverviewStore().$patch({ unreadCount: 0, readCount: 0 });
    store.categories[0].unreadCount = 0;
    store.categories[0].readCount = 0;
    store.categories[0].feeds[0].unreadCount = 0;
    store.categories[0].feeds[0].readCount = 0;
    store.increaseReadCount(article);
    store.decreaseReadCount(article);
    expect(store).toMatchObject({ unreadCount: 0, readCount: 0 });
  });

  // Verifies Smart Folder counts respond immediately and stale responses cannot undo the change.
  it('decrements the active Smart Folder and debounces an authoritative count refresh', async () => {
    vi.useFakeTimers();
    const staleCounts = deferred();
    fetchSmartFolderCounts
      .mockReturnValueOnce(staleCounts.promise)
      .mockResolvedValueOnce({
        data: { smartFolders: [{ id: 7, ArticleCount: 2 }] }
      });
    const store = createStore();
    const selectionStore = useSelectionStore();
    store.smartFolders = [{ id: 7, ArticleCount: 5 }];
    selectionStore.setSmartFolder({
      id: '7',
      query: 'unread:true',
      markAsReadOnScroll: true
    });

    const staleRequest = store.fetchSmartFolderCounts();
    expect(store.decreaseActiveSmartFolderCount()).toBe(true);
    expect(store.smartFolders[0].ArticleCount).toBe(4);

    staleCounts.resolve({
      data: { smartFolders: [{ id: 7, ArticleCount: 9 }] }
    });
    expect(await staleRequest).toBe(false);
    expect(store.smartFolders[0].ArticleCount).toBe(4);

    await vi.advanceTimersByTimeAsync(500);

    expect(fetchSmartFolderCounts).toHaveBeenCalledTimes(2);
    expect(store.smartFolders[0].ArticleCount).toBe(2);
  });

  it('clamps active Smart Folder counts and ignores non-folder selections', () => {
    vi.useFakeTimers();
    const store = createStore();
    const selectionStore = useSelectionStore();
    store.smartFolders = [{ id: 7, ArticleCount: 0 }];

    expect(store.decreaseActiveSmartFolderCount()).toBe(false);
    selectionStore.setSmartFolder({ id: 7, query: 'unread:true' });
    expect(store.decreaseActiveSmartFolderCount()).toBe(true);
    expect(store.smartFolders[0].ArticleCount).toBe(0);
  });

  it('still refreshes active Smart Folder counts while folder structure is unavailable', async () => {
    vi.useFakeTimers();
    fetchSmartFolderCounts.mockResolvedValue({
      data: { smartFolders: [{ id: 7, ArticleCount: 0 }] }
    });
    const store = createStore();
    const selectionStore = useSelectionStore();
    selectionStore.setSmartFolder({ id: 7, query: 'unread:true' });

    expect(store.decreaseActiveSmartFolderCount()).toBe(false);
    await vi.advanceTimersByTimeAsync(500);

    expect(fetchSmartFolderCounts).toHaveBeenCalledOnce();
  });

  it('coalesces repeated Smart Folder decrements into one trailing refresh', async () => {
    vi.useFakeTimers();
    fetchSmartFolderCounts.mockResolvedValue({
      data: { smartFolders: [{ id: 7, ArticleCount: 1 }] }
    });
    const store = createStore();
    const selectionStore = useSelectionStore();
    store.smartFolders = [{ id: 7, ArticleCount: 3 }];
    selectionStore.setSmartFolder({ id: 7, query: 'unread:true' });

    store.decreaseActiveSmartFolderCount();
    await vi.advanceTimersByTimeAsync(300);
    store.decreaseActiveSmartFolderCount();

    expect(store.smartFolders[0].ArticleCount).toBe(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchSmartFolderCounts).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSmartFolderCounts).toHaveBeenCalledOnce();
  });

  it('cancels a scheduled Smart Folder count refresh during session reset', async () => {
    vi.useFakeTimers();
    const store = createStore();
    const selectionStore = useSelectionStore();
    store.smartFolders = [{ id: 7, ArticleCount: 3 }];
    selectionStore.setSmartFolder({ id: 7, query: 'unread:true' });

    store.decreaseActiveSmartFolderCount();
    store.resetSessionState();
    await vi.advanceTimersByTimeAsync(500);

    expect(fetchSmartFolderCounts).not.toHaveBeenCalled();
    expect(store.smartFolders).toEqual([]);
  });

  // Verifies scroll-reading reconciles the displayed unread-only Briefing group once.
  it('decrements briefing counts only for an active unread-only Briefing', () => {
    const store = createStore();
    const selectionStore = useSelectionStore();
    store.updateOverview(createOverview({ briefingIncludeOnlyUnreadArticles: true }));
    selectionStore.currentSelection.status = 'briefing';
    const article = {
      feedId: 10,
      feed: { categoryId: 1 }
    };

    expect(store.decreaseBriefingCount(article)).toBe(true);
    expect(store.briefingCount).toBe(1);
    expect(store.categories[0].briefingCount).toBe(1);
    expect(store.categories[0].feeds[0].briefingCount).toBe(1);

    selectionStore.briefingIncludeOnlyUnreadArticles = false;

    expect(store.decreaseBriefingCount(article)).toBe(false);
    expect(store.briefingCount).toBe(1);
    expect(store.categories[0].briefingCount).toBe(1);
    expect(store.categories[0].feeds[0].briefingCount).toBe(1);
  });

  // Verifies global read counts survive missing ownership while mixed IDs reconcile nested counts.
  it('handles missing ownership and mixed identifier types safely', () => {
    const store = createStore();
    store.updateOverview(createOverview());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    store.increaseReadCount({
      feedId: 10,
      feed: { categoryId: 999 }
    });
    expect(store).toMatchObject({ unreadCount: 4, readCount: 5 });

    store.decreaseReadCount({
      feedId: 999,
      feed: { categoryId: 1 }
    });
    expect(store).toMatchObject({ unreadCount: 5, readCount: 4 });
    expect(store.categories[0]).toMatchObject({ unreadCount: 6, readCount: 3 });

    store.increaseReadCount({
      feedId: '10',
      Feed: { categoryId: '1' }
    });
    expect(store.categories[0]).toMatchObject({ unreadCount: 5, readCount: 4 });
    expect(store.categories[0].feeds[0]).toMatchObject({ unreadCount: 4, readCount: 5 });

    store.applyFavoriteDelta({
      categoryId: '1',
      feedId: '10',
      delta: 2
    });

    expect(warn).toHaveBeenCalledTimes(2);
    expect(store.favoriteCount).toBe(5);
    expect(store.categories[0].favoriteCount).toBe(5);
    expect(store.categories[0].feeds[0].favoriteCount).toBe(5);
  });

  // Verifies compatibility favorite actions clamp totals and error state can be reset.
  it('clamps favorite wrappers and manages fatal errors', () => {
    const store = createStore();

    store.decreaseFavoriteCount();
    expect(store.favoriteCount).toBe(0);
    store.increaseFavoriteCount();
    expect(store.favoriteCount).toBe(1);

    const uiStore = useUiStore();
    const error = new Error('fatal');
    uiStore.setFatalError(error);
    expect(uiStore.fatalError).toBe(error);
    uiStore.clearFatalError();
    expect(uiStore.fatalError).toBeNull();
  });

  // Verifies overview API failures reject without partially replacing existing state.
  it('preserves state when full overview loading fails', async () => {
    const store = createStore();
    useOverviewStore().$patch({
      unreadCount: 9,
      categories: [{ id: 8, feeds: [] }]
    });
    fetchOverview.mockRejectedValue(new Error('offline'));

    await expect(store.fetchOverview()).rejects.toThrow('offline');

    expect(store.unreadCount).toBe(9);
    expect(store.categories.map(category => category.id)).toEqual([8]);
  });
});
