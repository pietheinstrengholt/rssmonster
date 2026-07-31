import { createPinia, setActivePinia } from 'pinia';
import { nextTick, watch } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';

vi.mock('../src/api/settings', () => ({
  fetchSettings: vi.fn()
}));
vi.mock('../src/api/smartfolders', () => ({
  fetchSmartFolders: vi.fn(),
  fetchSmartFolderCounts: vi.fn()
}));
vi.mock('../src/api/tags', () => ({
  fetchTopTags: vi.fn()
}));
vi.mock('../src/api/manager', () => ({
  fetchOverview: vi.fn(),
  fetchOverviewLite: vi.fn(),
  fetchOverviewCounts: vi.fn()
}));

// This function creates a fresh real Pinia overview store for each domain-state test.
const createStore = () => {
  setActivePinia(createPinia());
  return useOverviewStore();
};

describe('data store domain reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes, updates, reorders, and removes categories', () => {
    const store = createStore();
    useOverviewStore().$patch({
      unreadCount: 2,
      readCount: 1,
      favoriteCount: 1,
      hotCount: 2,
      clickedCount: 1
    });

    store.addCategory({ id: 1, name: 'One' });
    store.addCategory({
      id: 2,
      name: 'Two',
      unreadCount: 2,
      readCount: 1,
      favoriteCount: 1,
      hotCount: 2,
      clickedCount: 1
    });

    expect(store.categories[0]).toMatchObject({
      unreadCount: 0,
      readCount: 0,
      favoriteCount: 0,
      hotCount: 0,
      clickedCount: 0,
      feeds: []
    });
    expect(store.updateCategory('1', { name: 'First', iconName: 'rss' })).toBe(true);
    expect(store.updateCategory('missing', { name: 'Missing' })).toBe(false);
    expect(store.categories[0]).toMatchObject({ name: 'First', iconName: 'rss' });

    store.applyCategoryOrder(['2', 1]);
    expect(store.categories.map(category => category.id)).toEqual([2, 1]);

    expect(store.removeCategory('2')).toBe(true);
    expect(store.removeCategory('missing')).toBe(false);
    expect(store.categories.map(category => category.id)).toEqual([1]);
    expect(store.unreadCount).toBe(0);
    expect(store.readCount).toBe(0);
    expect(store.favoriteCount).toBe(0);
    expect(store.hotCount).toBe(0);
    expect(store.clickedCount).toBe(0);
  });

  it('adds, updates, and atomically moves normalized feeds across mixed ID types', () => {
    const store = createStore();
    store.addCategory({
      id: 1,
      name: 'One',
      unreadCount: 3,
      readCount: 2,
      favoriteCount: 1,
      hotCount: 2,
      clickedCount: 1
    });
    store.addCategory({ id: 2, name: 'Two' });

    expect(store.addFeed('1', {
      id: 10,
      categoryId: 1,
      feedName: 'Original',
      unreadCount: 3,
      readCount: 2,
      favoriteCount: 1,
      hotCount: 2,
      clickedCount: 1
    })).toBe(true);
    expect(store.addFeed('missing', { id: 99 })).toBe(false);
    expect(store.categories[0].feeds[0]).toMatchObject({ errorCount: 0 });

    expect(store.updateFeed({
      id: '10',
      categoryId: '2',
      feedName: 'Moved'
    })).toBe(true);
    expect(store.categories[0]).toMatchObject({
      unreadCount: 0,
      readCount: 0,
      favoriteCount: 0,
      hotCount: 0,
      clickedCount: 0,
      feeds: []
    });
    expect(store.categories[1]).toMatchObject({
      unreadCount: 3,
      readCount: 2,
      favoriteCount: 1,
      hotCount: 2,
      clickedCount: 1
    });
    expect(store.categories[1].feeds[0]).toMatchObject({
      id: '10',
      categoryId: '2',
      feedName: 'Moved'
    });
    expect(store.updateFeed({ id: 'missing', categoryId: 2 })).toBe(false);
    expect(store.moveFeed('10', '1')).toBe(true);
    expect(store.categories[0].feeds[0].id).toBe('10');
    expect(store.moveFeed('missing', 2)).toBe(false);
  });

  it('removes feeds and clamps category and global counts at zero', () => {
    const store = createStore();
    useOverviewStore().$patch({
      unreadCount: 1,
      readCount: 0,
      favoriteCount: 1,
      hotCount: 1,
      clickedCount: 1
    });
    store.addCategory({
      id: 1,
      unreadCount: 1,
      readCount: 0,
      favoriteCount: 1,
      hotCount: 1,
      clickedCount: 1,
      feeds: [{
        id: 10,
        unreadCount: 3,
        readCount: 2,
        favoriteCount: 4,
        hotCount: 2,
        clickedCount: 3
      }]
    });

    expect(store.removeFeed('10')).toBe(true);
    expect(store.removeFeed('10')).toBe(false);
    expect(store.categories[0]).toMatchObject({
      unreadCount: 0,
      readCount: 0,
      favoriteCount: 0,
      hotCount: 0,
      clickedCount: 0,
      feeds: []
    });
    expect(store.unreadCount).toBe(0);
    expect(store.readCount).toBe(0);
    expect(store.favoriteCount).toBe(0);
    expect(store.hotCount).toBe(0);
    expect(store.clickedCount).toBe(0);
  });

  it('applies favorite mark, unmark, and bulk deltas exactly once per transition', () => {
    const store = createStore();
    useOverviewStore().$patch({ favoriteCount: 0 });
    store.addCategory({
      id: 1,
      feeds: [{ id: 10 }]
    });

    store.applyFavoriteDelta({ categoryId: '1', feedId: '10', delta: 1 });
    store.applyFavoriteDelta({ categoryId: 1, feedId: 10, delta: 2 });
    expect(store.favoriteCount).toBe(3);
    expect(store.categories[0].favoriteCount).toBe(3);
    expect(store.categories[0].feeds[0].favoriteCount).toBe(3);

    store.applyFavoriteDelta({ categoryId: 1, feedId: 10, delta: -1 });
    store.applyFavoriteDelta({ categoryId: 1, feedId: 10, delta: -10 });
    expect(store.favoriteCount).toBe(0);
    expect(store.categories[0].favoriteCount).toBe(0);
    expect(store.categories[0].feeds[0].favoriteCount).toBe(0);
  });

  it('reconciles read transitions across global, category, and feed counters', () => {
    const store = createStore();
    store.$patch({
      unreadCount: 2,
      readCount: 1
    });
    store.addCategory({
      id: 1,
      unreadCount: 2,
      readCount: 1,
      feeds: [{
        id: 10,
        unreadCount: 2,
        readCount: 1
      }]
    });
    const article = {
      feedId: 10,
      feed: { categoryId: 1 }
    };

    store.increaseReadCount(article);
    expect(store).toMatchObject({ unreadCount: 1, readCount: 2 });
    expect(store.categories[0]).toMatchObject({ unreadCount: 1, readCount: 2 });
    expect(store.categories[0].feeds[0]).toMatchObject({ unreadCount: 1, readCount: 2 });

    store.decreaseReadCount(article);
    expect(store).toMatchObject({ unreadCount: 2, readCount: 1 });
    expect(store.categories[0]).toMatchObject({ unreadCount: 2, readCount: 1 });
    expect(store.categories[0].feeds[0]).toMatchObject({ unreadCount: 2, readCount: 1 });
  });

  it('enforces selection and UI invariants through compound actions', async () => {
    createStore();
    const selectionStore = useSelectionStore();
    const uiStore = useUiStore();
    uiStore.$patch({
      chatAssistantOpen: true,
      searchQuery: 'draft'
    });
    selectionStore.$patch({
      currentSelection: {
        ...selectionStore.currentSelection,
        categoryId: '1',
        feedId: '10',
        tag: 'vue',
        search: 'old',
        smartFolderId: 5
      }
    });

    let selectionTransitions = 0;
    const stop = watch(
      () => selectionStore.currentSelection,
      () => {
        selectionTransitions += 1;
      },
      { deep: true }
    );

    selectionStore.selectCategory(2);
    await nextTick();
    expect(selectionTransitions).toBe(1);
    expect(selectionStore.currentSelection).toMatchObject({
      categoryId: '2',
      feedId: '%',
      tag: null,
      search: null,
      smartFolderId: null
    });
    expect(uiStore.chatAssistantOpen).toBe(false);

    selectionStore.selectFeed(20, 2);
    expect(selectionStore.currentSelection).toMatchObject({ categoryId: '2', feedId: '20' });

    selectionStore.setTag('pinia');
    expect(selectionStore.currentSelection).toMatchObject({
      categoryId: '%',
      feedId: '%',
      tag: 'pinia',
      search: null,
      smartFolderId: null
    });

    selectionStore.setSelectedSearch('author:test');
    expect(selectionStore.currentSelection).toMatchObject({ search: 'author:test', tag: null });
    selectionStore.setViewMode('reader');
    expect(selectionStore.currentSelection.viewMode).toBe('reader');
    uiStore.setShowModal('Settings');
    uiStore.setSearchQuery('local input');
    uiStore.setChatAssistantOpen(true);
    uiStore.setMobileSearchOpen(true);
    uiStore.setFatalError(new Error('Unrecoverable'));
    uiStore.clearFatalError();
    expect(uiStore.showModal).toBe('Settings');
    expect(uiStore.searchQuery).toBe('local input');
    expect(uiStore.chatAssistantOpen).toBe(true);
    expect(uiStore.mobileSearchOpen).toBe(true);
    expect(uiStore.fatalError).toBeNull();
    stop();
  });
});
