import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../src/store/data.js';
import { fetchSettings } from '../src/api/settings';
import {
  fetchOverview,
  fetchOverviewCounts,
  fetchOverviewLite
} from '../src/api/manager';

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

// Creates a fresh real Pinia data store for overview and count tests.
const createStore = () => {
  setActivePinia(createPinia());
  return useStore();
};

// Builds a complete overview response with optionally overridden fields.
const createOverview = (overrides = {}) => ({
  briefingCount: 2,
  briefingSelectionPeriod: '7d',
  briefingIncludeOnlyUnreadArticles: false,
  briefingPrioritizeHighTrust: false,
  unreadCount: 5,
  readCount: 4,
  favoriteCount: 3,
  hotCount: 2,
  clickedCount: 1,
  categories: [{
    id: 1,
    unreadCount: 5,
    readCount: 4,
    favoriteCount: 3,
    feeds: [{
      id: 10,
      categoryId: 1,
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
    expect(store.themeMode).toBe('dark');
    expect(store.categories[0].feeds[0]).toMatchObject({
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
    store.$patch({ unreadCount: 3, unreadsSinceLastUpdate: 8 });

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
          feeds: [{ id: 20, unreadCount: -4 }]
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
      unreadCount: 11,
      readCount: 0,
      favoriteCount: 0,
      errorCount: 0
    });
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
    const store = createStore();

    store.setSelectedStatus('briefing');
    expect(store.currentSelection.search).toBe('briefing:true @lastweek');

    store.setBriefingFilters({
      selectionPeriod: '24h',
      includeOnlyUnreadArticles: true,
      prioritizeHighTrust: true
    });
    expect(store.briefingSelectionPeriod).toBe('24h');
    expect(store.currentSelection.search)
      .toBe('briefing:true unread:true @today sort:trust');

    store.setBriefingSelectionPeriod('invalid');
    expect(store.briefingSelectionPeriod).toBe('7d');
    expect(store.currentSelection.search)
      .toBe('briefing:true unread:true @lastweek sort:trust');

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

    store.$patch({ unreadCount: 0, readCount: 0 });
    store.categories[0].unreadCount = 0;
    store.categories[0].readCount = 0;
    store.categories[0].feeds[0].unreadCount = 0;
    store.categories[0].feeds[0].readCount = 0;
    store.increaseReadCount(article);
    store.decreaseReadCount(article);
    expect(store).toMatchObject({ unreadCount: 0, readCount: 0 });
  });

  // Verifies missing read-count ownership is ignored while mixed IDs work for favorite counts.
  it('handles missing ownership and mixed identifier types safely', () => {
    const store = createStore();
    store.updateOverview(createOverview());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    store.increaseReadCount({
      feedId: 10,
      feed: { categoryId: 999 }
    });
    store.decreaseReadCount({
      feedId: 999,
      feed: { categoryId: 1 }
    });
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

    const error = new Error('fatal');
    store.setFatalError(error);
    expect(store.fatalError).toBe(error);
    store.clearFatalError();
    expect(store.fatalError).toBeNull();
  });

  // Verifies overview API failures reject without partially replacing existing state.
  it('preserves state when full overview loading fails', async () => {
    const store = createStore();
    store.$patch({ unreadCount: 9, categories: [{ id: 8, feeds: [] }] });
    fetchOverview.mockRejectedValue(new Error('offline'));

    await expect(store.fetchOverview()).rejects.toThrow('offline');

    expect(store.unreadCount).toBe(9);
    expect(store.categories.map(category => category.id)).toEqual([8]);
  });
});
