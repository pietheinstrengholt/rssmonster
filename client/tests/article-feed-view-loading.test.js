import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import { fetchArticleIds, fetchArticleRecommendations } from '../src/api/articles.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles.js', () => ({
  fetchArticleDetails: vi.fn(),
  fetchArticleIds: vi.fn(),
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
  fetchArticleIds.mockResolvedValue({
    data: {
      firstPage: [],
      itemIds: [],
      sourceCount: 0
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
});
