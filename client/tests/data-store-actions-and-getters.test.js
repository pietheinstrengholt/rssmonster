import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';
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

// This function creates a fresh Pinia graph for focused store action tests.
const createStores = () => {
  setActivePinia(createPinia());
  return {
    overviewStore: useOverviewStore(),
    selectionStore: useSelectionStore(),
    uiStore: useUiStore()
  };
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
        includeDevelopingEvents: 1,
        markAsReadOnScroll: 0
      }
    });
    const { selectionStore, uiStore } = createStores();

    await selectionStore.fetchSettings();
    expect(uiStore.themeMode).toBe('dark');
    expect(selectionStore.currentSelection).toMatchObject({
      sort: 'quality',
      grouping: 'event',
      includeDevelopingEvents: true,
      markAsReadOnScroll: false
    });

    uiStore.setThemeMode('light');
    selectionStore.setCurrentSelection({ sort: 'invalid', grouping: 'invalid' });
    expect(uiStore.themeMode).toBe('light');
    expect(selectionStore.currentSelection).toMatchObject({
      sort: 'desc',
      grouping: 'none',
      includeDevelopingEvents: true,
      markAsReadOnScroll: false
    });
  });

  // Verifies changing the event representative mode invalidates its scoped Top Tags.
  it('refreshes Top Tags when event grouping switches developing articles', async () => {
    const { selectionStore } = createStores();
    selectionStore.setCurrentSelection({ grouping: 'event' });
    await flushPromises();
    fetchTopTags.mockClear();

    selectionStore.setCurrentSelection({ includeDevelopingEvents: true });
    await flushPromises();

    expect(fetchTopTags).toHaveBeenCalledOnce();
    expect(fetchTopTags).toHaveBeenCalledWith({
      grouping: 'event',
      includeDevelopingEvents: true,
      status: 'unread'
    });
  });

  // Verifies sort changes remove supported query tokens while preserving other search terms.
  it('normalizes sort selections and removes embedded sort tokens', () => {
    const { selectionStore: store } = createStores();

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

  // Verifies filter resets use the store-owned defaults without resetting user preferences.
  it('resets article filters while preserving selection preferences', () => {
    const { selectionStore: store } = createStores();
    store.setCurrentSelection({
      status: 'favorite',
      categoryId: 4,
      feedId: 9,
      search: 'science',
      tag: 'vue',
      smartFolderId: 3,
      minAdvertisementScore: 0.8,
      minSentimentScore: 0.6,
      minQualityScore: 0.7,
      sort: 'quality',
      grouping: 'event',
      viewMode: 'reader',
      AIEnabled: true,
      AssistantEnabled: true,
      includeDevelopingEvents: false,
      markAsReadOnScroll: true
    });

    store.resetArticleFilters();

    expect(store.currentSelection).toEqual({
      status: 'unread',
      categoryId: '%',
      feedId: '%',
      search: null,
      tag: null,
      smartFolderId: null,
      minAdvertisementScore: 0,
      minSentimentScore: 0,
      minQualityScore: 0,
      sort: 'desc',
      grouping: 'none',
      viewMode: 'reader',
      AIEnabled: true,
      AssistantEnabled: true,
      includeDevelopingEvents: false,
      markAsReadOnScroll: true,
      briefingRevision: 0
    });
  });

  // Verifies compatibility selection actions and smart-folder query construction.
  it('applies category, feed, and smart-folder selections', () => {
    const { selectionStore: store, uiStore } = createStores();
    uiStore.$patch({ chatAssistantOpen: true });

    store.applySelection({ status: 'read' }, { closeChat: false });
    expect(uiStore.chatAssistantOpen).toBe(true);

    store.setSelectedCategoryId(4);
    store.setSelectedFeedId(9);
    store.setCurrentSelection({ grouping: 'topic', includeDevelopingEvents: true });
    expect(store.currentSelection).toMatchObject({
      categoryId: '4',
      feedId: '9'
    });

    store.setSmartFolder({
      id: 3,
      query: 'science',
      limitCount: 15,
      markAsReadOnScroll: true
    });
    expect(store.currentSelection).toMatchObject({
      categoryId: '%',
      feedId: '%',
      status: 'unread',
      sort: 'desc',
      grouping: 'none',
      includeDevelopingEvents: false,
      smartFolderId: 3,
      search: 'science limit:15'
    });
    expect(store.activeSmartFolderMarkAsReadOnScroll).toBe(true);
    expect(store.effectiveMarkAsReadOnScroll).toBe(true);

    store.setSmartFolder({ id: 4, query: 'history', limitCount: 0 });
    expect(store.currentSelection.search).toBe('history');
    expect(store.effectiveMarkAsReadOnScroll).toBe(false);
    store.setSmartFolder(null);
    expect(store.currentSelection).toMatchObject({
      smartFolderId: null,
      search: null
    });
    expect(store.activeSmartFolderMarkAsReadOnScroll).toBe(false);
  });

  // Verifies collection-specific preferences do not overwrite the durable unread preference.
  it('resolves effective scrolling behavior by active collection', () => {
    const { selectionStore: store } = createStores();
    store.setCurrentSelection({ markAsReadOnScroll: false });

    store.setSmartFolder({
      id: 3,
      query: 'unread:true',
      markAsReadOnScroll: true
    });
    expect(store.effectiveMarkAsReadOnScroll).toBe(true);
    expect(store.currentSelection.markAsReadOnScroll).toBe(false);

    store.selectCategory(4);
    expect(store.effectiveMarkAsReadOnScroll).toBe(false);

    store.setBriefingFilters({
      includeOnlyUnreadArticles: true,
      markAsReadOnScroll: true
    });
    store.setSelectedStatus('briefing');
    expect(store.effectiveMarkAsReadOnScroll).toBe(true);
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
    const { overviewStore: store, selectionStore } = createStores();
    selectionStore.setCurrentSelection({ grouping: 'topic' });
    await flushPromises();
    expect(fetchTopTags).toHaveBeenCalledWith({
      grouping: 'topic',
      includeDevelopingEvents: false,
      status: 'unread'
    });
    expect(store.topTags).toEqual(['vue']);

    await store.fetchSmartFolders();
    await flushPromises();
    expect(store.smartFolders).toEqual([
      { id: 1, ArticleCount: 8 },
      { id: 2, ArticleCount: 0 }
    ]);

    await store.fetchTopTags();
    expect(store.topTags).toEqual([]);
  });

  // Verifies background fetch failures remain non-fatal and retain published structure.
  it('handles background overview and smart-folder count failures', async () => {
    fetchOverviewLite.mockResolvedValue({
      data: { categories: [{ id: 1 }] }
    });
    fetchOverviewCounts.mockRejectedValue(new Error('counts offline'));
    fetchSmartFolders.mockResolvedValue({
      data: { smartFolders: [{ id: 2 }] }
    });
    fetchSmartFolderCounts.mockRejectedValue(new Error('folder counts offline'));
    const { overviewStore: store } = createStores();

    await store.fetchOverviewSplit();
    await store.fetchSmartFolders();
    await flushPromises();

    expect(store.categories[0]).toMatchObject({ id: 1, feeds: [] });
    expect(store.smartFolders).toEqual([{ id: 2, ArticleCount: 0 }]);
    expect(store.overviewCountsStatus).toBe('error');
    expect(store.overviewCountsError).toMatchObject({ message: 'counts offline' });
    expect(store.smartFolderCountsStatus).toBe('error');
    expect(store.smartFolderCountsError).toMatchObject({ message: 'folder counts offline' });
  });

  // Verifies a slower initial request cannot publish structure after a newer request starts.
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
    const { overviewStore: store } = createStores();

    const initialRequest = store.fetchOverviewSplit({ initial: true });
    await store.fetchOverviewSplit();
    resolveSettings({
      data: { themeMode: 'dark', grouping: 'topic' }
    });
    await initialRequest;

    expect(fetchOverviewLite).toHaveBeenCalledTimes(2);
    expect(store.categories[0].id).toBe(2);
  });

  // Verifies direct count refreshes reset deltas and swallow recoverable API failures.
  it('refreshes overview counts and preserves state on failure', async () => {
    fetchOverviewCounts
      .mockResolvedValueOnce({
        data: createCounts({ unreadCount: 7 })
      })
      .mockRejectedValueOnce(new Error('offline'));
    const { overviewStore, selectionStore: store } = createStores();
    overviewStore.$patch({ unreadCount: 2, unreadsSinceLastUpdate: 5 });

    await store.refreshOverviewCounts();
    expect(fetchOverviewCounts).toHaveBeenCalledWith(store.currentSelection);
    expect(overviewStore.unreadCount).toBe(7);
    expect(overviewStore.unreadsSinceLastUpdate).toBe(0);

    await store.refreshOverviewCounts();
    expect(overviewStore.unreadCount).toBe(7);
    expect(overviewStore.overviewCountsStatus).toBe('error');
    expect(overviewStore.overviewCountsError).toMatchObject({ message: 'offline' });
  });

  // Verifies grouping normalization survives a recoverable overview refresh failure.
  it('normalizes grouping and handles refresh failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { selectionStore: store, overviewStore } = createStores();
    vi.spyOn(overviewStore, 'fetchOverviewSplit')
      .mockRejectedValue(new Error('grouping offline'));

    store.setGrouping('unsupported');
    await flushPromises();

    expect(store.currentSelection.grouping).toBe('none');
    expect(overviewStore.fetchOverviewSplit).toHaveBeenCalledWith({
      forceUpdate: true
    });
    expect(warn).toHaveBeenCalledWith(
      'Grouping refresh failed',
      expect.objectContaining({ message: 'grouping offline' })
    );
    warn.mockRestore();
  });

  // Verifies score and modal actions update only their owned state.
  it('updates score filters and UI flags', () => {
    const {
      selectionStore,
      uiStore
    } = createStores();

    expect(uiStore.showModal).toBe('');
    selectionStore.setMinAdvertisementScore(0.2);
    selectionStore.setMinSentimentScore(0.3);
    selectionStore.setMinQualityScore(0.4);
    uiStore.setShowModal(true);
    uiStore.setMobileSearchOpen(true);

    expect(selectionStore.currentSelection).toMatchObject({
      minAdvertisementScore: 0.2,
      minSentimentScore: 0.3,
      minQualityScore: 0.4
    });
    expect(uiStore.showModal).toBe(true);
    expect(uiStore.mobileSearchOpen).toBe(true);
  });

  // Verifies replacement and same-category feed updates preserve normalized contracts.
  it('replaces existing categories and feeds and rejects invalid destinations', () => {
    const { overviewStore: store } = createStores();

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
    const { overviewStore: store } = createStores();
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
    const {
      overviewStore,
      selectionStore,
      uiStore
    } = createStores();
    overviewStore.$patch({
      briefingCount: 6,
      unreadCount: 5,
      readCount: 4,
      favoriteCount: 3,
      hotCount: 2,
      clickedCount: 1,
      topTags: ['rss'],
      unreadsSinceLastUpdate: -2.8,
      categories: [{
        id: 7,
        feeds: [{ id: 8, feedName: 'Selected' }]
      }]
    });
    uiStore.$patch({
      chatAssistantOpen: true,
      showModal: true
    });
    selectionStore.$patch({
      currentSelection: {
        ...selectionStore.currentSelection,
        categoryId: '7',
        feedId: '8'
      }
    });

    expect(selectionStore.currentSelection.categoryId).toBe('7');
    expect(overviewStore.categories[0].id).toBe(7);
    expect([
      overviewStore.briefingCount,
      overviewStore.unreadCount,
      overviewStore.readCount,
      overviewStore.favoriteCount,
      overviewStore.hotCount,
      overviewStore.clickedCount
    ]).toEqual([6, 5, 4, 3, 2, 1]);
    expect(overviewStore.topTags).toEqual(['rss']);
    expect(uiStore.chatAssistantOpen).toBe(true);
    expect(uiStore.showModal).toBe(true);
    expect(overviewStore.normalizedUnreadsSinceLastUpdate).toBe(2);
    expect(overviewStore.selectedCategory?.id).toBe(7);
    expect(overviewStore.selectedFeedDetails?.feed.feedName).toBe('Selected');

    selectionStore.applySelection({ categoryId: '%', feedId: 'missing' });
    expect(overviewStore.selectedCategory).toBeNull();
    expect(overviewStore.selectedFeedDetails).toBeNull();
    selectionStore.applySelection({ categoryId: '7', feedId: '999' });
    expect(overviewStore.selectedFeedDetails).toBeNull();
  });
});
