import { flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import { fetchArticleIds, fetchArticlePage, fetchNewerArticleCount } from '../src/api/articles.js';
import { createFocusedStores } from './helpers/focusedStores.js';
import { loadUnreadBaseline, saveUnreadBaseline, newerUnreadSelection } from '../src/services/unreadBaseline.js';

vi.mock('../src/api/articles.js', () => ({
  fetchArticleIds: vi.fn(), fetchArticlePage: vi.fn(), fetchNewerArticleCount: vi.fn(),
  fetchArticleDetails: vi.fn(), markArticleSeen: vi.fn(), markArticleUnread: vi.fn(),
  markAsFavorite: vi.fn(), markManyClicked: vi.fn(), markManyAsFavorite: vi.fn(),
  markAllAsRead: vi.fn(), markArticlesAsRead: vi.fn()
}));

let wrapper;
let stores;
const result = ids => ({ data: { itemIds: ids, firstPage: ids.map(id => ({ id, title: `Article ${id}`, status: 'unread' })) } });
const mountFeed = async () => {
  stores = createFocusedStores({ auth: { userId: 42 }, selection: { currentSelection: {
    status: 'unread', sort: 'recommended', search: 'title:Science', categoryId: '3', feedId: '4'
  } } });
  wrapper = shallowMount(ArticleFeed, { global: { plugins: [stores.pinia], stubs: {
    BootstrapIcon: true,
    ArticleListView: { props: ['articles'], template: '<section><p v-for="article in articles" :key="article.id">{{ article.title }}</p></section>' }
  } } });
  await flushPromises();
};
const button = label => wrapper.findAll('button').find(item => item.text() === label);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  fetchArticleIds.mockResolvedValue(result([104, 101, 103]));
  fetchNewerArticleCount.mockResolvedValue({ data: { newerArticleCount: 3 } });
});
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });

describe('new unread articles', () => {
  it('keeps the maximum full-list baseline through polling and new-only, then advances on full refresh', async () => {
    await mountFeed();
    const selection = { ...stores.selectionStore.currentSelection };
    expect(loadUnreadBaseline(42, selection)).toBe(104);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    await wrapper.vm.checkForNewerArticles();
    await flushPromises();
    expect(wrapper.text()).toContain('3 new articles since your last visit');
    expect(loadUnreadBaseline(42, selection)).toBe(104);

    fetchArticleIds.mockResolvedValueOnce(result([107, 105, 106]));
    await button('Show new only').trigger('click');
    await flushPromises();
    expect(fetchArticleIds).toHaveBeenLastCalledWith(expect.objectContaining({
      categoryId: '3', feedId: '4', status: 'unread', sort: 'recommended',
      search: 'title:Science unread:true read:false id:>104', persistSettings: false
    }));
    expect(wrapper.text()).toContain('Article 107');
    expect(wrapper.text()).not.toContain('Article 101');
    expect(stores.selectionStore.currentSelection).toEqual(selection);
    expect(loadUnreadBaseline(42, selection)).toBe(104);

    fetchArticleIds.mockResolvedValueOnce(result([101, 107, 104, 105, 106]));
    await button('Show full list').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Article 101');
    expect(loadUnreadBaseline(42, selection)).toBe(107);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('returns to the normal list when arrivals disappear before loading', async () => {
    await mountFeed();
    await wrapper.vm.checkForNewerArticles();
    fetchArticleIds.mockResolvedValueOnce(result([])).mockResolvedValueOnce(result([104, 101]));
    await button('Show new only').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Article 101');
    expect(wrapper.vm.showingNewOnly).toBe(false);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('loads the full list safely without a baseline and preserves it on failed refresh', async () => {
    await mountFeed();
    wrapper.vm.highestLoadedUnreadArticleId = null;
    await wrapper.vm.showNewArticles();
    expect(fetchArticleIds).toHaveBeenLastCalledWith(stores.selectionStore.currentSelection);
    fetchArticleIds.mockRejectedValueOnce(new Error('offline'));
    await wrapper.vm.showFullUnreadList();
    expect(loadUnreadBaseline(42, stores.selectionStore.currentSelection)).toBe(104);
    expect(wrapper.text()).toContain('Article 101');
  });

  it('uses the full unread maximum beyond the first cursor page and keeps the filter for continuation', async () => {
    await mountFeed();
    const selection = { ...stores.selectionStore.currentSelection, sort: 'asc', search: null };
    stores.selectionStore.currentSelection = selection;
    fetchArticlePage.mockResolvedValueOnce({ data: {
      paginationVersion: 1, totalCount: 30,
      snapshot: { snapshotMaxArticleId: 999, highestUnreadArticleId: 107 },
      page: { itemIds: [101], articles: [{ id: 101 }], hasMore: true, nextCursor: 'first' }
    } });
    await flushPromises();
    expect(loadUnreadBaseline(42, selection)).toBe(107);
    fetchArticlePage.mockResolvedValue({ data: {
      paginationVersion: 1, totalCount: 2, snapshot: { snapshotMaxArticleId: 1000, highestUnreadArticleId: 109 },
      page: { itemIds: [108], articles: [{ id: 108 }], hasMore: true, nextCursor: 'new' }
    } });
    await wrapper.vm.showNewArticles();
    await wrapper.vm.getContent();
    expect(fetchArticlePage).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'unread:true read:false id:>107' }), expect.objectContaining({ cursor: 'new' }));
    expect(loadUnreadBaseline(42, selection)).toBe(107);
  });

  it('isolates persisted baselines by account and scope and rejects invalid IDs', () => {
    const selection = { feedId: 1 };
    saveUnreadBaseline(1, selection, 104);
    expect(loadUnreadBaseline(1, selection)).toBe(104);
    expect(loadUnreadBaseline(2, selection)).toBeNull();
    expect(loadUnreadBaseline(1, { feedId: 2 })).toBeNull();
    for (const invalid of [null, -1, NaN, '104', 1.5]) expect(newerUnreadSelection(selection, invalid)).toBeNull();
  });
});
