import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../src/store/data.js';
import { fetchSettings } from '../src/api/settings';
import {
  fetchOverviewCounts,
  fetchOverviewLite
} from '../src/api/manager';
import {
  fetchSmartFolderCounts,
  fetchSmartFolders
} from '../src/api/smartfolders';
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
  fetchSmartFolderCounts: vi.fn(),
  fetchSmartFolders: vi.fn()
}));

vi.mock('../src/api/tags', () => ({
  fetchTopTags: vi.fn()
}));

// This function creates a fresh real Pinia data store for action and getter tests.
const createStore = () => {
  setActivePinia(createPinia());
  return useStore();
};

// This function builds a complete count response for background refresh tests.
const createCounts = (overrides = {}) => ({
  briefingCount: 1,
  unreadCount: 4,
  readCount: 3,
  favoriteCount: 2,
  hotCount: 1,
  clickedCount: 1,
  categories: [],
  ...overrides
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('data store remaining actions and getters', () => {
  // Verifies settings and explicit selection changes normalize persisted values.
  it('normalizes settings, selections, and theme changes', async () => {
    fetchSettings.mockResolvedValue({
      data: {
        themeMode: 'dark',
        sort: 'QUALITY',
        grouping: 'event',
        includeDevelopingEvents: 1
      }
    });
    const store = createStore();

    await store.fetchSettings();
    expect(store.themeMode).toBe('dark');
    expect(store.currentSelection).toMatchObject({
      sort: 'quality',
      grouping: 'event',
      includeDevelopingEvents: true
    });
    expect(store.includeDevelopingEvents).toBe(true);

    store.setThemeMode('light');
    store.setCurrentSelection({ sort: 'invalid', grouping: 'invalid' });
    expect(store.themeMode).toBe('light');
    expect(store.currentSelection).toMatchObject({
      sort: 'desc',
      grouping: 'none',
      includeDevelopingEvents: true
    });
  });

  // Verifies sort changes remove supported query tokens while preserving other search terms.
  it('normalizes sort selections and removes embedded sort tokens', () => {
    const store = createStore();

    store.setSelectedSearch('author:ada, sort:quality; unread:true');
    store.setSelectedSort('ATTENTION');
    expect(store.currentSelection).toMatchObject({
      sort: 'attention',
      search: 'author:ada, unread:true'
    });

    store.setSelectedSearch('sort:trust');
    store.setSelectedSort('unknown');
    expect(store.currentSelection).toMatchObject({
      sort: 'desc',
      search: null
    });

    store.setSelectedSearch('plain words');
    store.setSelectedSort('asc');
    expect(store.currentSelection.search).toBe('plain words');
  });

  // Verifies compatibility selection actions and smart-folder query construction.
  it('applies category, feed, and smart-folder selections', () => {
    const store = createStore();
    store.$patch({ chatAssistantOpen: true });

    store.applySelection({ status: 'read' }, { closeChat: false });
    expect(store.chatAssistantOpen).toBe(true);

    store.setSelectedCategoryId(4);
    store.setSelectedFeedId(9);
    expect(store.currentSelection).toMatchObject({
      categoryId: '4',
      feedId: '9'
    });

    store.setSmartFolder({ id: 3, query: 'science', limitCount: 15 });
    expect(store.currentSelection).toMatchObject({
      categoryId: '%',
      feedId: '%',
      status: 'unread',
      sort: 'desc',
      smartFolderId: 3,
      search: 'science limit:15'
    });

    store.setSmartFolder({ id: 4, query: 'history', limitCount: 0 });
    expect(store.currentSelection.search).toBe('history');
    store.setSmartFolder(null);
    expect(store.currentSelection).toMatchObject({
      smartFolderId: null,
      search: null
    });
  });

  // Verifies lightweight data fetchers provide defaults and forward grouping context.
  it('fetches smart folders and top tags with empty-response defaults', async () => {
    fetchSmartFolders.mockResolvedValue({
      data: {
        smartFolders: [
          { id: 1, ArticleCount: 5 },
          { id: 2 }
        ]
      }
    });
    fetchSmartFolderCounts.mockResolvedValue({
      data: {
        smartFolders: [
          { id: 1, ArticleCount: 8 },
          { id: 2 }
        ]
      }
    });
    fetchTopTags
      .mockResolvedValueOnce({ data: { tags: ['vue'] } })
      .mockResolvedValueOnce({ data: {} });
    const store = createStore();
    store.setCurrentSelection({ grouping: 'topic' });

    await store.fetchSmartFolders();
    await flushPromises();
    expect(store.smartFolders).toEqual([
      { id: 1, ArticleCount: 8 },
      { id: 2, ArticleCount: 0 }
    ]);

    await store.fetchTopTags();
    expect(fetchTopTags).toHaveBeenCalledWith({ grouping: 'topic' });
    expect(store.topTags).toEqual(['vue']);
    await store.fetchTopTags();
    expect(store.topTags).toEqual([]);
  });

  // Verifies background fetch failures remain non-fatal and retain published structure.
  it('handles background overview and smart-folder count failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchOverviewLite.mockResolvedValue({
      data: { categories: [{ id: 1 }] }
    });
    fetchOverviewCounts.mockRejectedValue(new Error('counts offline'));
    fetchSmartFolders.mockResolvedValue({
      data: { smartFolders: [{ id: 2 }] }
    });
    fetchSmartFolderCounts.mockRejectedValue(new Error('folder counts offline'));
    const store = createStore();

    await store.fetchOverviewSplit();
    await store.fetchSmartFolders();
    await flushPromises();

    expect(store.categories[0]).toMatchObject({ id: 1, feeds: [] });
    expect(store.smartFolders).toEqual([{ id: 2, ArticleCount: 0 }]);
    expect(warn).toHaveBeenCalledWith(
      'Overview counts refresh failed',
      expect.objectContaining({ message: 'counts offline' })
    );
    expect(warn).toHaveBeenCalledWith(
      'Smart folder counts refresh failed',
      expect.objectContaining({ message: 'folder counts offline' })
    );
    warn.mockRestore();
  });

  // Verifies a slower initial settings request cannot start an obsolete overview fetch.
  it('stops an initial split overview after a newer request starts', async () => {
    let resolveSettings;
    // Holds settings so a newer overview request can supersede the initial request.
    fetchSettings.mockReturnValue(new Promise(resolve => {
      resolveSettings = resolve;
    }));
    fetchOverviewLite.mockResolvedValue({
      data: { categories: [{ id: 2 }] }
    });
    fetchOverviewCounts.mockReturnValue(new Promise(() => {}));
    const store = createStore();

    const initialRequest = store.fetchOverviewSplit({ initial: true });
    await store.fetchOverviewSplit();
    resolveSettings({
      data: { themeMode: 'dark', grouping: 'topic' }
    });
    await initialRequest;

    expect(fetchOverviewLite).toHaveBeenCalledOnce();
    expect(store.categories[0].id).toBe(2);
  });

  // Verifies direct count refreshes reset deltas and swallow recoverable API failures.
  it('refreshes overview counts and preserves state on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchOverviewCounts
      .mockResolvedValueOnce({
        data: createCounts({ unreadCount: 7 })
      })
      .mockRejectedValueOnce(new Error('offline'));
    const store = createStore();
    store.$patch({ unreadCount: 2, unreadsSinceLastUpdate: 5 });

    await store.refreshOverviewCounts();
    expect(fetchOverviewCounts).toHaveBeenCalledWith(store.currentSelection);
    expect(store.unreadCount).toBe(7);
    expect(store.unreadsSinceLastUpdate).toBe(0);

    await store.refreshOverviewCounts();
    expect(store.unreadCount).toBe(7);
    expect(warn).toHaveBeenCalledWith(
      'Overview counts refresh failed',
      expect.objectContaining({ message: 'offline' })
    );
    warn.mockRestore();
  });

  // Verifies grouping normalization survives a recoverable overview refresh failure.
  it('normalizes grouping and handles refresh failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createStore();
    vi.spyOn(store, 'fetchOverviewSplit')
      .mockRejectedValue(new Error('grouping offline'));

    store.setGrouping('unsupported');
    await flushPromises();

    expect(store.currentSelection.grouping).toBe('none');
    expect(store.fetchOverviewSplit).toHaveBeenCalledWith({
      forceUpdate: true
    });
    expect(warn).toHaveBeenCalledWith(
      'Grouping refresh failed',
      expect.objectContaining({ message: 'grouping offline' })
    );
    warn.mockRestore();
  });

  // Verifies score, view, counter, and modal actions update only their owned state.
  it('updates score filters, counters, and UI flags', () => {
    const store = createStore();

    store.setMinAdvertisementScore(0.2);
    store.setMinSentimentScore(0.3);
    store.setMinQualityScore(0.4);
    store.increaseRefreshCategories();
    store.setShowModal(true);
    store.setMobileSearchOpen(true);

    expect(store.currentSelection).toMatchObject({
      minAdvertisementScore: 0.2,
      minSentimentScore: 0.3,
      minQualityScore: 0.4
    });
    expect(store.refreshCategories).toBe(1);
    expect(store.showModal).toBe(true);
    expect(store.mobileSearchOpen).toBe(true);
  });

  // Verifies replacement and same-category feed updates preserve normalized contracts.
  it('replaces existing categories and feeds and rejects invalid destinations', () => {
    const store = createStore();

    store.addCategory({ id: 1, name: 'Old' });
    store.addCategory({ id: '1', name: 'New', feeds: [{ id: 10 }] });
    expect(store.categories).toHaveLength(1);
    expect(store.categories[0].name).toBe('New');

    store.addFeed(1, { id: '10', feedName: 'Replacement', errorCount: -1 });
    expect(store.categories[0].feeds).toHaveLength(1);
    expect(store.categories[0].feeds[0]).toMatchObject({
      feedName: 'Replacement',
      errorCount: 0
    });

    expect(store.updateFeed({
      id: 10,
      categoryId: 1,
      feedName: 'Updated'
    })).toBe(true);
    expect(store.categories[0].feeds[0].feedName).toBe('Updated');
    expect(store.updateFeed({ id: 10, categoryId: 999 })).toBe(false);
    expect(store.moveFeed(10, 1, { feedName: 'Moved in place' })).toBe(true);
    expect(store.categories[0].feeds[0].feedName).toBe('Moved in place');
  });

  // Verifies no-op favorite changes and missing read-count owners do not mutate totals.
  it('ignores no-op favorite deltas and missing read-count ownership', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createStore();
    store.addCategory({ id: 1, feeds: [] });

    store.applyFavoriteDelta({ categoryId: 1, feedId: 2, delta: 0 });
    store.applyFavoriteDelta({ categoryId: 999, feedId: 2, delta: 1 });
    store.increaseReadCount({
      feedId: 999,
      feed: { categoryId: 1 }
    });
    store.decreaseReadCount({
      feedId: 999,
      feed: { categoryId: 999 }
    });

    expect(store.favoriteCount).toBe(1);
    expect(store.categories[0].favoriteCount).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  // Verifies getters expose stored state and safely resolve selected domain objects.
  it('returns counts, UI state, and selected category and feed details', () => {
    const store = createStore();
    store.$patch({
      briefingCount: 6,
      unreadCount: 5,
      readCount: 4,
      favoriteCount: 3,
      hotCount: 2,
      clickedCount: 1,
      topTags: ['rss'],
      chatAssistantOpen: true,
      showModal: true,
      unreadsSinceLastUpdate: -2.8,
      categories: [{
        id: 7,
        feeds: [{ id: 8, feedName: 'Selected' }]
      }],
      currentSelection: {
        ...store.currentSelection,
        categoryId: '7',
        feedId: '8'
      }
    });

    expect(store.getCurrentSelection).toBe(store.currentSelection);
    expect(store.getCategories).toBe(store.categories);
    expect([
      store.getBriefingCount,
      store.getUnreadCount,
      store.getReadCount,
      store.getFavoriteCount,
      store.getHotCount,
      store.getClickedCount
    ]).toEqual([6, 5, 4, 3, 2, 1]);
    expect(store.getTopTags).toEqual(['rss']);
    expect(store.getChatAssistantOpen).toBe(true);
    expect(store.getShowModal).toBe(true);
    expect(store.getUnreadsSinceLastUpdate).toBe(2);
    expect(store.getSelectedCategory?.id).toBe(7);
    expect(store.getSelectedFeedDetails?.feed.feedName).toBe('Selected');

    store.applySelection({ categoryId: '%', feedId: 'missing' });
    expect(store.getSelectedCategory).toBeNull();
    expect(store.getSelectedFeedDetails).toBeNull();
    store.applySelection({ categoryId: '7', feedId: '999' });
    expect(store.getSelectedFeedDetails).toBeNull();
  });
});
