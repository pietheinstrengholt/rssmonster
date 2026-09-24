import { flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import { fetchArticleIds, fetchArticlePage, fetchNewerArticleCount, markAllAsRead } from '../src/api/articles.js';
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
const mountFeed = async (selection = {}, realList = false) => {
  stores = createFocusedStores({ auth: { userId: 42 }, selection: { currentSelection: {
    status: 'unread', sort: 'recommended', search: 'title:Science', categoryId: '3', feedId: '4', ...selection
  } } });
  wrapper = shallowMount(ArticleFeed, { global: { plugins: [stores.pinia], stubs: {
    BootstrapIcon: true,
    NewArticlesBanner: false,
    ArticleEndState: false,
    ArticleEmptyState: false,
    UnreadSelectionContext: false,
    AppDropdown: false,
    ArticleListView: realList ? false : { props: ['articles'], template: '<section><slot name="before-context" :reader-mode="false" /><p v-for="article in articles" :key="article.id">{{ article.title }}</p></section>' }
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
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('new unread articles', () => {
  it('returns to all unread articles after completing the new-only list', async () => {
    await mountFeed({}, true);
    await wrapper.vm.checkForNewerArticles();
    await flushPromises();
    fetchArticleIds.mockResolvedValueOnce(result([107, 105, 106]));
    await button('Show new only').trigger('click');
    await flushPromises();

    markAllAsRead.mockResolvedValueOnce({ data: { updatedCount: 3 } });
    fetchArticleIds.mockResolvedValueOnce(result([]));
    await button('Mark 3 as read').trigger('click');
    await flushPromises();
    expect(button('View unread articles')).toBeDefined();

    fetchArticleIds.mockResolvedValueOnce(result([104, 101, 103]));
    await button('View unread articles').trigger('click');
    await flushPromises();
    expect(fetchArticleIds).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'unread', categoryId: '3', feedId: '4', search: 'title:Science'
    }));
    expect(button('View unread articles')).toBeUndefined();
    expect(wrapper.findComponent({ name: 'ArticleListView' }).props('articles').map(article => article.id)).toEqual([104, 101, 103]);
  });

  it('dismisses the arrivals banner without changing articles, selection or the baseline', async () => {
    await mountFeed();
    await wrapper.vm.checkForNewerArticles();
    await flushPromises();
    const selection = { ...stores.selectionStore.currentSelection };
    const requests = fetchArticleIds.mock.calls.length;
    expect(wrapper.text()).toContain('3 new articles since your last visit');

    await wrapper.get('button[aria-label="Dismiss new articles banner"]').trigger('click');

    expect(wrapper.text()).not.toContain('new articles since your last visit');
    expect(button('Show new only')).toBeUndefined();
    expect(button('Show full list')).toBeUndefined();
    expect(wrapper.text()).toContain('Article 101');
    expect(stores.selectionStore.currentSelection).toEqual(selection);
    expect(loadUnreadBaseline(42, selection)).toBe(104);
    expect(fetchArticleIds).toHaveBeenCalledTimes(requests);

    await wrapper.vm.checkForNewerArticles();
    await flushPromises();
    expect(wrapper.text()).not.toContain('new articles since your last visit');
  });

  it.each([5, 1, 0])('shows a fresh message after the backend count changes to %s', async count => {
    await mountFeed();
    await wrapper.vm.checkForNewerArticles();
    await flushPromises();
    await wrapper.get('button[aria-label="Dismiss new articles banner"]').trigger('click');

    fetchNewerArticleCount.mockResolvedValueOnce({ data: { newerArticleCount: count } });
    await wrapper.vm.checkForNewerArticles();
    await flushPromises();

    if (count > 0) {
      expect(wrapper.text()).toContain(`${count} ${count === 1 ? 'new article' : 'new articles'} since your last visit`);
      expect(button('Show new only')).toBeDefined();
    } else {
      expect(wrapper.find('button[aria-label="Dismiss new articles banner"]').exists()).toBe(false);
      await wrapper.vm.checkForNewerArticles();
      await flushPromises();
      expect(wrapper.text()).toContain('3 new articles since your last visit');
    }
  });

  it('does not preserve dismissal when the page is recreated', async () => {
    await mountFeed();
    await wrapper.vm.checkForNewerArticles();
    await flushPromises();
    await wrapper.get('button[aria-label="Dismiss new articles banner"]').trigger('click');
    wrapper.unmount();

    await mountFeed();
    await wrapper.vm.checkForNewerArticles();
    await flushPromises();
    expect(wrapper.text()).toContain('3 new articles since your last visit');
  });

  it('replaces Yesterday with 7d and back through the controls and article query', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date(2026, 8, 21, 16).getTime();
    vi.setSystemTime(now);
    fetchArticleIds.mockResolvedValue({ data: { ...result([104, 101, 103]).data, sourceCount: 1 } });
    await mountFeed({}, true);
    const selectYesterday = async () => {
      await wrapper.get('[aria-label^="Article date range:"]').trigger('click');
      await wrapper.findAll('[role="menuitemradio"]').find(item => item.text().replace('✓', '').trim() === 'Yesterday').trigger('click');
      await flushPromises();
    };
    await selectYesterday();
    await button('7d').trigger('click');
    await flushPromises();
    expect(wrapper.get('[aria-label="Article date range: All"]').text()).toBe('All');
    expect(fetchArticleIds).toHaveBeenLastCalledWith(expect.objectContaining({
      publishedAfter: new Date(now - 168 * 3600000).toISOString(),
      publishedBefore: new Date(now + 1).toISOString(),
      status: 'unread', categoryId: '3', feedId: '4', search: 'title:Science'
    }));
    await selectYesterday();
    expect(button('7d').attributes('aria-pressed')).toBe('false');
    expect(fetchArticleIds).toHaveBeenLastCalledWith(expect.objectContaining({
      publishedAfter: new Date(2026, 8, 20).toISOString(),
      publishedBefore: new Date(2026, 8, 21).toISOString()
    }));
  });

  it.each(['24h', '3d', '7d', 'yesterday', 'custom'])('counts and marks only the 40 articles in the %s collection', async filter => {
    const ids = Array.from({ length: 40 }, (_, index) => index + 101);
    const page = (itemIds, hasMore) => ({ data: {
      paginationVersion: 1, totalCount: 40, sourceCount: 1,
      snapshot: { highestUnreadArticleId: 140, snapshotMaxArticleId: 140 },
      page: { itemIds, articles: itemIds.map(id => ({ id, status: 'unread' })), hasMore, nextCursor: hasMore ? 'next-page' : null }
    } });
    fetchArticlePage.mockResolvedValue(page(ids.slice(0, 20), true));
    await mountFeed({ sort: 'desc', grouping: 'event' }, true);
    stores.overviewStore.categories = [{ id: 3, unreadCount: 473, feeds: [{ id: 4, unreadCount: 473 }] }];
    stores.overviewStore.fetchOverviewSplit = vi.fn().mockResolvedValue();
    stores.overviewStore.fetchSmartFolderCounts = vi.fn().mockResolvedValue();
    if (filter === 'custom') stores.selectionStore.setDateRange(filter, { start: '2026-09-20', end: '2026-09-21' });
    else if (filter === 'yesterday') stores.selectionStore.setDateRange(filter);
    else stores.selectionStore.setAgeCutoff(filter);
    await flushPromises();
    fetchArticlePage.mockResolvedValueOnce(page(ids.slice(20), false));
    await wrapper.vm.getContent();
    await flushPromises();
    expect(wrapper.text()).toContain('40 unread articles were reviewed.');
    expect(button('Mark 40 as read')).toBeDefined();
    expect(button('Mark 473 as read')).toBeUndefined();
    fetchArticlePage.mockResolvedValueOnce(page([], false));
    await button('Mark 40 as read').trigger('click');
    await flushPromises();
    expect(markAllAsRead).toHaveBeenCalledWith(expect.objectContaining({
      publishedAfter: expect.any(String), publishedBefore: expect.any(String), grouping: 'none'
    }), ids);
  });

  it('shows and marks only four new articles when the feed has 473 unread articles', async () => {
    await mountFeed({}, true);
    stores.overviewStore.categories = [{ id: 3, unreadCount: 473, feeds: [{ id: 4, unreadCount: 473 }] }];
    stores.overviewStore.fetchOverviewSplit = vi.fn().mockResolvedValue();
    fetchArticleIds.mockResolvedValueOnce(result([105, 106, 107, 108]));
    await wrapper.vm.showNewArticles();
    await flushPromises();
    expect(wrapper.text()).toContain('4 unread articles were reviewed.');
    expect(button('Mark 4 as read')).toBeDefined();
    expect(button('Mark 473 as read')).toBeUndefined();
    expect(wrapper.text()).not.toContain('473 unread articles were reviewed.');
    fetchNewerArticleCount.mockResolvedValueOnce({ data: { newerArticleCount: 8 } });
    await wrapper.vm.checkForNewerArticles();
    await flushPromises();
    expect(button('Mark 4 as read')).toBeDefined();
    fetchArticleIds.mockResolvedValueOnce(result([]));
    await button('Mark 4 as read').trigger('click');
    await flushPromises();
    expect(markAllAsRead).toHaveBeenCalledWith(expect.objectContaining({
      search: 'title:Science unread:true read:false id:>104', grouping: 'none'
    }), [105, 106, 107, 108]);
  });

  it.each([['24h', 24], ['3d', 72], ['7d', 168]])('adds the %s cutoff while preserving the full selection and baseline', async (value, hours) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-22T12:00:00Z'));
    await mountFeed();
    const selection = { ...stores.selectionStore.currentSelection };
    fetchArticleIds.mockResolvedValue(result([107]));
    stores.selectionStore.setAgeCutoff(value);
    await flushPromises();
    expect(fetchArticleIds).toHaveBeenLastCalledWith({ ...selection, publishedAfter: new Date(Date.now() - hours * 3600000).toISOString(), publishedBefore: new Date(Date.now() + 1).toISOString() });
    expect(wrapper.text()).not.toContain('Article 101');
    expect(loadUnreadBaseline(42, selection)).toBe(104);
    stores.selectionStore.setAgeCutoff('all');
    await flushPromises();
    expect(fetchArticleIds).toHaveBeenLastCalledWith(selection);
  });

  it('preserves smart-folder expressions, Event grouping and score filters', async () => {
    await mountFeed({ smartFolderId: 7, grouping: 'event', includeDevelopingEvents: true, minQualityScore: 40, search: 'tag:Science @2026-09-21 grouping:event limit:50' });
    const selection = { ...stores.selectionStore.currentSelection };
    stores.selectionStore.setAgeCutoff('3d');
    await flushPromises();
    expect(fetchArticleIds).toHaveBeenLastCalledWith({ ...selection, publishedAfter: expect.any(String), publishedBefore: expect.any(String) });
    expect(stores.selectionStore.currentSelection).toEqual(selection);
  });

  it('keeps new-only mode and rejects stale cutoff responses', async () => {
    await mountFeed();
    fetchArticleIds.mockResolvedValueOnce(result([107]));
    await wrapper.vm.showNewArticles();
    let resolveOld;
    fetchArticleIds.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    stores.selectionStore.setAgeCutoff('24h');
    await flushPromises();
    fetchArticleIds.mockResolvedValueOnce(result([109]));
    stores.selectionStore.setAgeCutoff('3d');
    await flushPromises();
    resolveOld(result([108]));
    await flushPromises();
    expect(wrapper.text()).toContain('Article 109');
    expect(wrapper.text()).not.toContain('Article 108');
    expect(fetchArticleIds).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'title:Science unread:true read:false id:>104', publishedAfter: expect.any(String) }));
    expect(loadUnreadBaseline(42, stores.selectionStore.currentSelection)).toBe(104);
    expect(wrapper.vm.showingNewOnly).toBe(true);
  });

  it('resets cursor pagination and keeps a fixed cutoff for subsequent pages', async () => {
    await mountFeed();
    const page = cursor => ({ data: {
      paginationVersion: 1, totalCount: 30,
      snapshot: { highestUnreadArticleId: 104 },
      page: { itemIds: [104], articles: [{ id: 104 }], hasMore: true, nextCursor: cursor }
    } });
    fetchArticlePage.mockResolvedValue(page('old-page'));
    stores.selectionStore.setCurrentSelection({ sort: 'desc' });
    await flushPromises();
    fetchArticlePage.mockResolvedValue(page('age-page'));
    stores.selectionStore.setAgeCutoff('7d');
    await flushPromises();
    const cutoff = fetchArticlePage.mock.lastCall[0].publishedAfter;
    expect(fetchArticlePage.mock.lastCall[1]).toEqual({ pageSize: wrapper.vm.fetchCount });
    await wrapper.vm.getContent();
    expect(fetchArticlePage).toHaveBeenLastCalledWith(expect.objectContaining({ publishedAfter: cutoff }), expect.objectContaining({ cursor: 'age-page' }));
  });

  it('switches age and calendar filters with new-only and rejects stale calendar responses', async () => {
    await mountFeed();
    fetchArticleIds.mockResolvedValueOnce(result([107]));
    await wrapper.vm.showNewArticles();
    stores.selectionStore.setAgeCutoff('7d');
    await flushPromises();
    let resolveOld;
    fetchArticleIds.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    stores.selectionStore.setDateRange('today');
    await flushPromises();
    expect(stores.selectionStore.ageCutoff).toBe('all');
    fetchArticleIds.mockResolvedValueOnce(result([109]));
    stores.selectionStore.setDateRange('yesterday');
    await flushPromises();
    resolveOld(result([108]));
    await flushPromises();
    expect(wrapper.text()).toContain('Article 109');
    expect(wrapper.text()).not.toContain('Article 108');
    expect(fetchArticleIds).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'unread', categoryId: '3', feedId: '4', sort: 'recommended',
      search: 'title:Science unread:true read:false id:>104',
      publishedAfter: expect.any(String), publishedBefore: expect.any(String)
    }));
    expect(loadUnreadBaseline(42, stores.selectionStore.currentSelection)).toBe(104);
    expect(wrapper.vm.showingNewOnly).toBe(true);
  });

  it('resets the cursor on calendar changes and reuses both bounds on subsequent pages', async () => {
    await mountFeed();
    const page = cursor => ({ data: {
      paginationVersion: 1, totalCount: 30, snapshot: { highestUnreadArticleId: 104 },
      page: { itemIds: [104], articles: [{ id: 104 }], hasMore: true, nextCursor: cursor }
    } });
    fetchArticlePage.mockResolvedValue(page('old-page'));
    stores.selectionStore.setCurrentSelection({ sort: 'asc', smartFolderId: 7, grouping: 'event' });
    await flushPromises();
    fetchArticlePage.mockResolvedValue(page('calendar-page'));
    stores.selectionStore.setDateRange('this-month');
    await flushPromises();
    const query = fetchArticlePage.mock.lastCall[0];
    expect(query).toMatchObject({ smartFolderId: 7, grouping: 'event', sort: 'asc', search: 'title:Science', publishedAfter: expect.any(String), publishedBefore: expect.any(String) });
    expect(fetchArticlePage.mock.lastCall[1]).toEqual({ pageSize: wrapper.vm.fetchCount });
    await wrapper.vm.getContent();
    expect(fetchArticlePage).toHaveBeenLastCalledWith(query, expect.objectContaining({ cursor: 'calendar-page' }));
    stores.selectionStore.setDateRange('all');
    await flushPromises();
    expect(fetchArticlePage.mock.lastCall[0]).not.toHaveProperty('publishedAfter');
    expect(fetchArticlePage.mock.lastCall[0]).not.toHaveProperty('publishedBefore');
  });

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
