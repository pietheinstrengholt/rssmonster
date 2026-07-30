import { createPinia, setActivePinia } from 'pinia';
import { nextTick, watch } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../src/store/data';

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

// This function creates a fresh real Pinia data store for each domain-state test.
const createStore = () => {
  setActivePinia(createPinia());
  return useStore();
};

describe('data store domain reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes, updates, reorders, and removes categories', () => {
    const store = createStore();
    store.$patch({ unreadCount: 2, readCount: 1, favoriteCount: 1 });

    store.addCategory({ id: 1, name: 'One' });
    store.addCategory({
      id: 2,
      name: 'Two',
      unreadCount: 2,
      readCount: 1,
      favoriteCount: 1
    });

    expect(store.categories[0]).toMatchObject({
      unreadCount: 0,
      readCount: 0,
      favoriteCount: 0,
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
  });

  it('adds, updates, and atomically moves normalized feeds across mixed ID types', () => {
    const store = createStore();
    store.addCategory({ id: 1, name: 'One', unreadCount: 3, readCount: 2, favoriteCount: 1 });
    store.addCategory({ id: 2, name: 'Two' });

    expect(store.addFeed('1', {
      id: 10,
      categoryId: 1,
      feedName: 'Original',
      unreadCount: 3,
      readCount: 2,
      favoriteCount: 1
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
      feeds: []
    });
    expect(store.categories[1]).toMatchObject({
      unreadCount: 3,
      readCount: 2,
      favoriteCount: 1
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
    store.$patch({ unreadCount: 1, readCount: 0, favoriteCount: 1 });
    store.addCategory({
      id: 1,
      unreadCount: 1,
      readCount: 0,
      favoriteCount: 1,
      feeds: [{
        id: 10,
        unreadCount: 3,
        readCount: 2,
        favoriteCount: 4
      }]
    });

    expect(store.removeFeed('10')).toBe(true);
    expect(store.removeFeed('10')).toBe(false);
    expect(store.categories[0]).toMatchObject({
      unreadCount: 0,
      readCount: 0,
      favoriteCount: 0,
      feeds: []
    });
    expect(store.unreadCount).toBe(0);
    expect(store.readCount).toBe(0);
    expect(store.favoriteCount).toBe(0);
  });

  it('applies favorite mark, unmark, and bulk deltas exactly once per transition', () => {
    const store = createStore();
    store.$patch({ favoriteCount: 0 });
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

  it('enforces selection and UI invariants through compound actions', async () => {
    const store = createStore();
    store.$patch({
      chatAssistantOpen: true,
      searchQuery: 'draft',
      currentSelection: {
        ...store.currentSelection,
        categoryId: '1',
        feedId: '10',
        tag: 'vue',
        search: 'old',
        smartFolderId: 5
      }
    });

    let selectionTransitions = 0;
    const stop = watch(
      () => store.currentSelection,
      () => {
        selectionTransitions += 1;
      },
      { deep: true }
    );

    store.selectCategory(2);
    await nextTick();
    expect(selectionTransitions).toBe(1);
    expect(store.currentSelection).toMatchObject({
      categoryId: '2',
      feedId: '%',
      tag: null,
      search: null,
      smartFolderId: null
    });
    expect(store.chatAssistantOpen).toBe(false);

    store.selectFeed(20, 2);
    expect(store.currentSelection).toMatchObject({ categoryId: '2', feedId: '20' });

    store.setTag('pinia');
    expect(store.currentSelection).toMatchObject({
      categoryId: '%',
      feedId: '%',
      tag: 'pinia',
      search: null,
      smartFolderId: null
    });

    store.setSelectedSearch('author:test');
    expect(store.currentSelection).toMatchObject({ search: 'author:test', tag: null });
    store.setViewMode('reader');
    expect(store.currentSelection.viewMode).toBe('reader');
    store.setSearchQuery('local input');
    store.setChatAssistantOpen(true);
    expect(store.searchQuery).toBe('local input');
    expect(store.chatAssistantOpen).toBe(true);
    stop();
  });
});
