import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import { fetchArticlePage, fetchArticleRecommendations } from '../src/api/articles.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles.js', () => ({
  fetchArticleDetails: vi.fn(),
  fetchArticleIds: vi.fn(),
  fetchArticlePage: vi.fn(),
  fetchArticleRecommendations: vi.fn(),
  markAllAsRead: vi.fn(),
  markArticleSeen: vi.fn(),
  markArticlesAsRead: vi.fn(),
  markArticleUnread: vi.fn(),
  markAsFavorite: vi.fn(),
  markManyAsFavorite: vi.fn(),
  markManyClicked: vi.fn()
}));

// This function creates the article selection store required by each feed view.
const createStore = () => createFocusedStores({
  overview: {
    categories: [],
    smartFolders: [],
    unreadCount: 0
  },
  selection: {
    currentSelection: {
      categoryId: '%',
      feedId: '%',
      grouping: 'none',
      search: null,
      smartFolderId: null,
      sort: 'desc',
      status: 'unread',
      tag: null,
      viewMode: 'full'
    }
  }
});

// This function mounts the feed with named stubs so view changes remain observable.
const mountArticleFeed = () => {
  const stores = createStore();
  return shallowMount(ArticleFeed, {
    attachTo: document.body,
    global: {
      plugins: [stores.pinia],
      stubs: {
      ArticleListView: {
        name: 'ArticleListView',
        template: '<div class="article-list-view-stub"></div>'
      },
      ArticleReaderLayout: {
        name: 'ArticleReaderLayout',
        template: '<div class="article-reader-layout-stub"></div>'
      },
      SmartFoldersGridOverview: {
        name: 'SmartFoldersGridOverview',
        template: '<div class="smart-folders-overview-stub"></div>'
      }
      }
    }
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchArticlePage.mockResolvedValue({
    data: {
      paginationVersion: 1,
      totalCount: 0,
      sourceCount: 0,
      snapshot: { snapshotMaxArticleId: 0 },
      page: { itemIds: [], articles: [], hasMore: false, nextCursor: null }
    }
  });
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })));
});

describe('ArticleFeed view loading', () => {
  it('does not request recommendations in expanded or mobile Reader layouts', async () => {
    const wrapper = mountArticleFeed();
    await flushPromises();

    wrapper.vm.selectionStore.currentSelection.viewMode = 'reader';
    await flushPromises();

    expect(wrapper.find('.article-list-view-stub').exists()).toBe(true);
    expect(wrapper.find('.article-reader-layout-stub').exists()).toBe(false);
    expect(fetchArticleRecommendations).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('switches among the eager list and lazy reader and Smart Folder views', async () => {
    const wrapper = mountArticleFeed();
    await flushPromises();

    expect(wrapper.find('.article-list-view-stub').exists()).toBe(true);
    expect(wrapper.find('.article-reader-layout-stub').exists()).toBe(false);
    expect(wrapper.find('.smart-folders-overview-stub').exists()).toBe(false);

    wrapper.vm.isDesktopReaderWidth = true;
    wrapper.vm.selectionStore.currentSelection.viewMode = 'reader';
    await flushPromises();

    expect(wrapper.find('.article-list-view-stub').exists()).toBe(false);
    expect(wrapper.find('.article-reader-layout-stub').exists()).toBe(true);

    await wrapper.setData({ showSmartFoldersOverview: true });
    await flushPromises();

    expect(wrapper.find('.article-reader-layout-stub').exists()).toBe(false);
    expect(wrapper.find('.smart-folders-overview-stub').exists()).toBe(true);

    wrapper.unmount();
  });

  it('reconnects observers once when a Reader breakpoint transition changes the layout', async () => {
    const mediaQuery = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));
    const wrapper = mountArticleFeed();
    await flushPromises();
    const observeArticles = vi.spyOn(wrapper.vm, 'observeArticles');
    const observeLoadMoreSentinel = vi.spyOn(wrapper.vm, 'observeLoadMoreSentinel');

    wrapper.vm.selectionStore.setCurrentSelection({ viewMode: 'reader' });
    await flushPromises();
    observeArticles.mockClear();
    observeLoadMoreSentinel.mockClear();

    const mediaQueryChange = mediaQuery.addEventListener.mock.calls[0][1];
    mediaQueryChange({ matches: true });
    await flushPromises();

    expect(observeArticles).toHaveBeenCalledOnce();
    expect(observeLoadMoreSentinel).toHaveBeenCalledOnce();
    expect(wrapper.find('.article-reader-layout-stub').exists()).toBe(true);
    wrapper.unmount();
  });

  it('does not reconnect observers when the Reader breakpoint changes outside Reader mode', async () => {
    const mediaQuery = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));
    const wrapper = mountArticleFeed();
    await flushPromises();
    const observeArticles = vi.spyOn(wrapper.vm, 'observeArticles');
    const observeLoadMoreSentinel = vi.spyOn(wrapper.vm, 'observeLoadMoreSentinel');

    const mediaQueryChange = mediaQuery.addEventListener.mock.calls[0][1];
    mediaQueryChange({ matches: true });
    await flushPromises();

    expect(observeArticles).not.toHaveBeenCalled();
    expect(observeLoadMoreSentinel).not.toHaveBeenCalled();
    expect(wrapper.find('.article-list-view-stub').exists()).toBe(true);
    wrapper.unmount();
  });

  it('reconnects observers once when the view mode changes at Reader width', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })));
    const wrapper = mountArticleFeed();
    await flushPromises();
    const observeArticles = vi.spyOn(wrapper.vm, 'observeArticles');
    const observeLoadMoreSentinel = vi.spyOn(wrapper.vm, 'observeLoadMoreSentinel');

    wrapper.vm.selectionStore.setCurrentSelection({ viewMode: 'reader' });
    await flushPromises();

    expect(observeArticles).toHaveBeenCalledOnce();
    expect(observeLoadMoreSentinel).toHaveBeenCalledOnce();
    expect(wrapper.find('.article-reader-layout-stub').exists()).toBe(true);
    wrapper.unmount();
  });

  it('scrolls to the top without reloading IDs for a view-mode change', async () => {
    const wrapper = mountArticleFeed();
    await flushPromises();
    const initialFetchCount = fetchArticlePage.mock.calls.length;
    const scrollArticleListToTop = vi.spyOn(wrapper.vm, 'scrollArticleListToTop');

    wrapper.vm.selectionStore.setCurrentSelection({ viewMode: 'summarized' });
    await flushPromises();

    expect(fetchArticlePage).toHaveBeenCalledTimes(initialFetchCount);
    expect(scrollArticleListToTop).toHaveBeenCalled();

    wrapper.unmount();
  });

  it('reloads IDs once with the new grouping and scrolls to the top', async () => {
    const wrapper = mountArticleFeed();
    await flushPromises();
    const initialFetchCount = fetchArticlePage.mock.calls.length;
    const scrollArticleListToTop = vi.spyOn(wrapper.vm, 'scrollArticleListToTop');

    wrapper.vm.selectionStore.setCurrentSelection({ grouping: 'event' });
    await flushPromises();

    expect(fetchArticlePage).toHaveBeenCalledTimes(initialFetchCount + 1);
    expect(fetchArticlePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ grouping: 'event' }),
      expect.objectContaining({ pageSize: 20 })
    );
    expect(scrollArticleListToTop).toHaveBeenCalled();

    wrapper.unmount();
  });

  it.each([
    ['AI capability', { AIEnabled: true }],
    ['mark-as-read behavior', { markAsReadOnScroll: false }]
  ])('does not reload IDs or scroll for an %s change', async (_label, selection) => {
    const wrapper = mountArticleFeed();
    await flushPromises();
    const initialFetchCount = fetchArticlePage.mock.calls.length;
    const scrollArticleListToTop = vi.spyOn(wrapper.vm, 'scrollArticleListToTop');

    wrapper.vm.selectionStore.setCurrentSelection(selection);
    await flushPromises();

    expect(fetchArticlePage).toHaveBeenCalledTimes(initialFetchCount);
    expect(scrollArticleListToTop).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('reloads IDs and scrolls when article status changes', async () => {
    const wrapper = mountArticleFeed();
    await flushPromises();
    const initialFetchCount = fetchArticlePage.mock.calls.length;
    const scrollArticleListToTop = vi.spyOn(wrapper.vm, 'scrollArticleListToTop');

    wrapper.vm.selectionStore.setCurrentSelection({ status: 'favorite' });
    await flushPromises();

    expect(fetchArticlePage).toHaveBeenCalledTimes(initialFetchCount + 1);
    expect(fetchArticlePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'favorite' }),
      expect.objectContaining({ pageSize: 20 })
    );
    expect(scrollArticleListToTop).toHaveBeenCalled();

    wrapper.unmount();
  });
});
