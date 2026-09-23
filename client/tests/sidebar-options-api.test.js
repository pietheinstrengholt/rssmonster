import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/components/sidebar/Sidebar.vue';
import SidebarActionButton from '../src/components/sidebar/SidebarActionButton.vue';
import SidebarCategoryGroup from '../src/components/sidebar/SidebarCategoryGroup.vue';
import SidebarFeedItem from '../src/components/sidebar/SidebarFeedItem.vue';
import SidebarNavItem from '../src/components/sidebar/SidebarNavItem.vue';
import { updateCategoryOrder } from '../src/api/manager';
import { useAuthStore } from '../src/store/auth.js';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';

vi.mock('../src/api/manager', () => ({
  updateCategoryOrder: vi.fn().mockResolvedValue({ status: 200 })
}));

vi.mock('../src/api/articles', () => ({
  markAllAsRead: vi.fn()
}));

vi.mock('../src/api/crawl', () => ({
  triggerCrawl: vi.fn()
}));

vi.mock('../src/api/feeds', () => ({
  startFeedRefresh: vi.fn()
}));

// This function creates the complete store contract used by sidebar behavior tests.
const createStore = () => ({
  pinia: createPinia()
});

// This function initializes the split Pinia stores with representative sidebar data.
const initializeStores = () => {
  const { pinia } = createStore();
  setActivePinia(pinia);
  const authStore = useAuthStore(pinia);
  const overviewStore = useOverviewStore(pinia);
  const selectionStore = useSelectionStore(pinia);
  const uiStore = useUiStore(pinia);

  overviewStore.$patch({
    briefingCount: 4,
    categories: [{
      id: 10,
      name: 'Technology',
      briefingCount: 3,
      unreadCount: 8,
      readCount: 101,
      hotCount: 4,
      feeds: [{
        id: 101,
        categoryId: 10,
        feedName: 'Example feed',
        status: 'active',
        briefingCount: 2,
        unreadCount: 3,
        readCount: 20,
        hotCount: 2
      }]
    }, {
      id: 20,
      name: 'News',
      briefingCount: 1,
      unreadCount: 5,
      hotCount: 2,
      feeds: []
    }],
    clickedCount: 1,
    smartFolders: [{
      id: 30,
      name: 'Research',
      ArticleCount: 11,
      query: 'tag:research'
    }],
    topTags: [{
      name: 'javascript',
      count: 7
    }],
    unreadCount: 13,
    unreadsSinceLastUpdate: 0
  });
  selectionStore.$patch({
    currentSelection: {
      ...selectionStore.currentSelection,
      AIEnabled: true,
      categoryId: 10,
      feedId: '%',
      smartFolderId: null,
      status: 'unread',
      tag: null
    }
  });
  overviewStore.favoriteCount = 2;
  overviewStore.hotCount = 6;
  overviewStore.readCount = 9;
  vi.spyOn(overviewStore, 'fetchSmartFolders').mockResolvedValue({});
  vi.spyOn(overviewStore, 'fetchTopTags').mockResolvedValue({});
  vi.spyOn(overviewStore, 'applyCategoryOrder');
  vi.spyOn(selectionStore, 'selectCategory').mockImplementation(() => {});
  vi.spyOn(selectionStore, 'selectFeed').mockImplementation(() => {});
  vi.spyOn(selectionStore, 'setSelectedStatus').mockImplementation(() => {});
  vi.spyOn(selectionStore, 'setSmartFolder').mockImplementation(() => {});
  vi.spyOn(selectionStore, 'setTag').mockImplementation(() => {});
  vi.spyOn(uiStore, 'setShowModal');

  return { authStore, overviewStore, pinia, selectionStore, uiStore };
};

// This function mounts the sidebar with a slot-compatible draggable boundary.
const mountSidebar = pinia => mount(Sidebar, {
  global: {
    plugins: [pinia],
    stubs: {
      BootstrapIcon: true,
      draggable: {
        props: ['modelValue'],
        template: '<div class="draggable-stub"><slot name="item" v-for="item in modelValue" :key="item.id" :element="item" /></div>'
      }
    }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Options API sidebar contracts', () => {
  // This verifies category and feed badges remain available while switching article statuses.
  it('renders selection/total counts for categories and feeds', async () => {
    const stores = initializeStores();
    const wrapper = mountSidebar(stores.pinia);

    stores.selectionStore.$patch({
      currentSelection: {
        ...stores.selectionStore.currentSelection,
        status: 'briefing'
      }
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[id="10"] .sidebar-category-header .sidebar-count').text()).toBe('3/109');
    expect(wrapper.get('[id="101"] .sidebar-count').text()).toBe('2/23');
    expect(wrapper.find('.sidebar-tags').text()).toContain('Top tags in Daily briefing');

    stores.selectionStore.$patch({
      currentSelection: {
        ...stores.selectionStore.currentSelection,
        status: 'unread'
      }
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[id="10"] .sidebar-category-header .sidebar-count').text()).toBe('8/109');
    expect(wrapper.get('[id="101"] .sidebar-count').text()).toBe('3/23');

    stores.selectionStore.$patch({
      currentSelection: {
        ...stores.selectionStore.currentSelection,
        status: 'hot'
      }
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.sidebar-all-categories-item .sidebar-count').text()).toBe('6/22');
    expect(wrapper.get('[id="10"] .sidebar-category-header .sidebar-count').text()).toBe('4/109');
    expect(wrapper.get('[id="101"] .sidebar-count').text()).toBe('2/23');
  });

  it('updates read counts without changing totals and formats empty and large counts', async () => {
    const stores = initializeStores();
    const wrapper = mountSidebar(stores.pinia);
    stores.selectionStore.currentSelection.status = 'read';
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[id="10"] .sidebar-category-header').text()).toContain('101/109');
    expect(wrapper.get('[id="101"]').text()).toContain('20/23');

    stores.overviewStore.increaseReadCount({ feedId: 101, feed: { categoryId: 10 } });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[id="10"] .sidebar-category-header').text()).toContain('102/109');
    expect(wrapper.get('[id="101"]').text()).toContain('21/23');

    stores.overviewStore.categories[0].readCount = 1200;
    stores.overviewStore.categories[0].unreadCount = 300;
    stores.overviewStore.categories[0].feeds[0].readCount = 0;
    stores.overviewStore.categories[0].feeds[0].unreadCount = 0;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[id="10"] .sidebar-category-header').text()).toContain('1.2K/1.5K');
    expect(wrapper.get('[id="101"] .sidebar-count').text()).toBe('0');
    wrapper.unmount();
  });

  it.each([
    [0, 0, '0'],
    [4, 0, '4'],
    [0, 4, '0/4'],
    [3, 4, '3/7']
  ])('shows unread %i and read %i as %s throughout Categories', (unreadCount, readCount, expected) => {
    const stores = initializeStores();
    const category = stores.overviewStore.categories[0];
    for (const item of [stores.overviewStore, category, category.feeds[0]]) {
      Object.assign(item, { unreadCount, readCount });
    }
    const wrapper = mountSidebar(stores.pinia);

    expect(wrapper.get('.sidebar-all-categories-item .sidebar-count').text()).toBe(expected);
    expect(wrapper.get('[id="10"] .sidebar-category-header .sidebar-count').text()).toBe(expected);
    expect(wrapper.get('[id="101"] .sidebar-count').text()).toBe(expected);
    wrapper.unmount();
  });

  it.each([
    [false, false, 0, 0, '0'],
    [false, true, 3, 4, '3'],
    [true, false, 0, 0, '0/0'],
    [true, false, 4, 0, '4/4'],
    [true, true, 4, 0, '4'],
    [true, true, 0, 4, '0/4']
  ])('respects total=%s and declutter=%s for %i unread and %i read', async (showTotalCount, declutterCounts, unreadCount, readCount, expected) => {
    const stores = initializeStores();
    const wrapper = mountSidebar(stores.pinia);
    const category = stores.overviewStore.categories[0];
    for (const item of [stores.overviewStore, category, category.feeds[0]]) {
      Object.assign(item, { unreadCount, readCount });
    }
    stores.uiStore.setSidebarSettings({ showTotalCount, declutterCounts });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.sidebar-all-categories-item .sidebar-count').text()).toBe(expected);
    expect(wrapper.get('[id="10"] .sidebar-category-header .sidebar-count').text()).toBe(expected);
    expect(wrapper.get('[id="101"] .sidebar-count').text()).toBe(expected);
    wrapper.unmount();
  });

  it('hides zero counts across sections using the current selection and keeps matching children', async () => {
    const stores = initializeStores();
    const category = stores.overviewStore.categories[0];
    category.unreadCount = 0;
    category.readCount = 5;
    category.feeds.push({ id: 102, categoryId: 10, feedName: 'Read-only feed', unreadCount: 0, readCount: 5 });
    stores.overviewStore.categories[1].unreadCount = 0;
    stores.overviewStore.categories[1].readCount = 0;
    stores.overviewStore.smartFolders.push({ id: 31, name: 'Empty folder', ArticleCount: 0 });
    stores.overviewStore.topTags.unshift({ name: 'empty', count: 0 });
    stores.overviewStore.clickedCount = 0;
    const wrapper = mountSidebar(stores.pinia);
    expect(wrapper.find('[id="102"]').exists()).toBe(true);
    expect(wrapper.find('[id="20"]').exists()).toBe(true);
    expect(wrapper.get('.sidebar-smart-folders').text()).toContain('Empty folder');
    expect(wrapper.get('.sidebar-tags').text()).toContain('Empty');

    stores.uiStore.setSidebarSettings({ showTotalCount: true, declutterCounts: true, hideZeroCountItems: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[id="10"]').exists()).toBe(true);
    expect(wrapper.find('[id="101"]').exists()).toBe(true);
    expect(wrapper.find('[id="102"]').exists()).toBe(false);
    expect(wrapper.find('[id="20"]').exists()).toBe(false);
    expect(wrapper.get('.sidebar-smart-folders').text()).not.toContain('Empty folder');
    expect(wrapper.get('.sidebar-smart-folders').text()).toContain('Research');
    expect(wrapper.get('.sidebar-tags').text()).not.toContain('Empty');
    expect(wrapper.get('.sidebar-tags').text()).toContain('Javascript');
    expect(wrapper.get('.sidebar-status-filters').text()).toContain('Clicked0');

    category.feeds[0].unreadCount = 0;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[id="10"]').exists()).toBe(false);
    category.feeds[0].unreadCount = 3;

    stores.selectionStore.currentSelection.status = 'read';
    category.feeds[0].readCount = 0;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[id="101"]').exists()).toBe(false);
    expect(wrapper.find('[id="102"]').exists()).toBe(true);

    stores.uiStore.sidebarSettings.hideZeroCountItems = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[id="101"]').exists()).toBe(true);
    expect(wrapper.find('[id="20"]').exists()).toBe(true);
    expect(stores.overviewStore.categories[0].feeds).toHaveLength(2);
    wrapper.unmount();
  });

  it('hides empty sections while keeping All feeds filters and settings available', async () => {
    const stores = initializeStores();
    stores.uiStore.sidebarSettings.hideZeroCountItems = true;
    stores.overviewStore.categories = [{ id: 10, name: 'Empty category', unreadCount: 0, feeds: [] }];
    stores.overviewStore.unreadCount = 0;
    stores.overviewStore.smartFolders = [{ id: 30, name: 'Empty folder', ArticleCount: 0 }];
    stores.overviewStore.topTags = [{ name: 'empty', count: 0 }];
    const wrapper = mountSidebar(stores.pinia);
    expect(wrapper.find('.sidebar-smart-folders').exists()).toBe(false);
    expect(wrapper.find('.sidebar-tags').exists()).toBe(false);
    expect(wrapper.find('[id="10"]').exists()).toBe(false);
    expect(wrapper.find('.sidebar-all-categories-item').exists()).toBe(false);
    expect(wrapper.get('.sidebar-status-filters').text()).toContain('Unread0');
    expect(wrapper.get('button[aria-label="Sidebar configuration settings"]').exists()).toBe(true);

    stores.overviewStore.smartFolders[0].ArticleCount = undefined;
    stores.overviewStore.categories[0].unreadCount = undefined;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.sidebar-smart-folders').text()).toContain('Empty folder');
    expect(wrapper.find('[id="10"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('reorders visible categories without dropping hidden categories or feeds', async () => {
    const stores = initializeStores();
    stores.uiStore.sidebarSettings.hideZeroCountItems = true;
    stores.overviewStore.categories.splice(1, 0, { id: 15, name: 'Hidden', unreadCount: 0, feeds: [] });
    stores.overviewStore.categories[0].feeds.push({ id: 102, categoryId: 10, feedName: 'Hidden feed', unreadCount: 0 });
    const wrapper = mountSidebar(stores.pinia);
    await wrapper.get('.sidebar-category-reorder-button').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.draggable-stub').exists()).toBe(true));
    const draggable = wrapper.getComponent('.draggable-stub');
    expect(draggable.props('modelValue').map(category => category.id)).toEqual([10, 20]);
    expect(wrapper.find('[id="102"]').exists()).toBe(false);
    draggable.vm.$emit('update:modelValue', [...draggable.props('modelValue')].reverse());
    await wrapper.vm.$nextTick();
    expect(stores.overviewStore.categories.map(category => category.id)).toEqual([20, 15, 10]);
    expect(stores.overviewStore.categories[2].feeds).toHaveLength(2);
    expect(updateCategoryOrder).toHaveBeenCalledWith([20, 15, 10]);
    stores.uiStore.sidebarSettings.hideZeroCountItems = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[id="15"]').exists()).toBe(true);
    expect(wrapper.find('[id="102"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it.each([30, 60, 90])('groups feeds inactive for %i days using receipt dates and subscription age', async days => {
    const now = Date.parse('2026-09-23T12:00:00Z');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const ago = value => new Date(now - value * 86400000).toISOString();
    const stores = initializeStores();
    stores.overviewStore.categories[0].feeds = [
      { id: 101, categoryId: 10, feedName: 'Active feed', lastArticleReceivedAt: ago(days - 1), unreadCount: 1, readCount: 0 },
      { id: 102, categoryId: 10, feedName: 'Inactive receipt', lastArticleReceivedAt: ago(days), lastSuccessAt: ago(0), unreadCount: 0, readCount: 4 },
      { id: 103, categoryId: 10, feedName: 'Never received', lastArticleReceivedAt: null, createdAt: ago(days + 1), unreadCount: 0, readCount: 0 },
      { id: 104, categoryId: 10, feedName: 'New subscription', lastArticleReceivedAt: null, createdAt: ago(1), unreadCount: 1, readCount: 0 },
      { id: 105, categoryId: 10, feedName: 'Unknown activity', unreadCount: 1, readCount: 0 }
    ];
    const wrapper = mountSidebar(stores.pinia);
    expect(wrapper.find('[id="102"]').exists()).toBe(true);
    expect(wrapper.find('[id="inactive-feeds"]').exists()).toBe(false);

    stores.uiStore.setSidebarSettings({
      showTotalCount: true, declutterCounts: true, hideZeroCountItems: true,
      automaticallyHideInactiveFeeds: true, inactiveFeedDays: days
    });
    await wrapper.vm.$nextTick();
    const inactiveButton = wrapper.get('[id="inactive-feeds"] button');
    expect(inactiveButton.text()).toBe('Inactive feeds');
    expect(inactiveButton.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[id="102"]').exists()).toBe(false);
    for (const id of [101, 104, 105]) expect(wrapper.find(`[id="${id}"]`).exists()).toBe(true);

    await inactiveButton.trigger('click');
    expect(inactiveButton.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[id="inactive-feeds"]').text()).toContain('Inactive receipt');
    expect(wrapper.get('[id="inactive-feeds"]').text()).toContain('Never received');
    expect(stores.selectionStore.selectCategory).not.toHaveBeenCalled();
    await wrapper.get('[id="102"]').trigger('click');
    expect(stores.selectionStore.selectFeed).toHaveBeenCalledWith(102, 10);

    stores.overviewStore.categories[0].feeds[1].lastArticleReceivedAt = ago(0);
    stores.overviewStore.categories[0].feeds[1].unreadCount = 1;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[id="10"]').text()).toContain('Inactive receipt');
    expect(wrapper.get('[id="inactive-feeds"]').text()).not.toContain('Inactive receipt');

    stores.uiStore.sidebarSettings.automaticallyHideInactiveFeeds = false;
    stores.uiStore.sidebarSettings.hideZeroCountItems = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[id="inactive-feeds"]').exists()).toBe(false);
    expect(wrapper.get('[id="10"]').text()).toContain('Never received');
    expect(stores.overviewStore.categories[0].feeds).toHaveLength(5);
    wrapper.unmount();
    clock.mockRestore();
  });

  it('hides empty categories while grouping inactive feeds and restores them without modifying stored data', async () => {
    const stores = initializeStores();
    const ago = days => new Date(Date.now() - days * 86400000).toISOString();
    stores.overviewStore.categories[0].feeds[0].lastArticleReceivedAt = ago(45);
    stores.overviewStore.categories.push({ id: 30, name: 'Mixed', unreadCount: 4, feeds: [
      { id: 301, categoryId: 30, feedName: 'Active mixed', lastArticleReceivedAt: ago(1), unreadCount: 1 },
      { id: 302, categoryId: 30, feedName: 'Inactive mixed', lastArticleReceivedAt: ago(100), unreadCount: 3 }
    ] });
    const original = JSON.parse(JSON.stringify(stores.overviewStore.categories));
    const wrapper = mountSidebar(stores.pinia);
    stores.uiStore.sidebarSettings.automaticallyHideInactiveFeeds = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[id="10"]').exists()).toBe(false);
    expect(wrapper.find('[id="20"]').exists()).toBe(false);
    expect(wrapper.find('[id="30"]').exists()).toBe(true);
    await wrapper.get('[id="inactive-feeds"] button').trigger('click');
    expect(wrapper.get('[id="inactive-feeds"]').text()).toContain('Example feed');
    expect(wrapper.get('[id="inactive-feeds"]').text()).toContain('Inactive mixed');
    expect(wrapper.findAll('button').some(button => button.text() === 'Reorder')).toBe(false);
    stores.uiStore.sidebarSettings.inactiveFeedDays = 60;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[id="10"]').exists()).toBe(true);
    stores.uiStore.sidebarSettings.inactiveFeedDays = 30;
    stores.overviewStore.categories[0].feeds[0].lastArticleReceivedAt = ago(1);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[id="10"]').exists()).toBe(true);
    stores.overviewStore.categories[0].feeds[0].lastArticleReceivedAt = original[0].feeds[0].lastArticleReceivedAt;
    stores.uiStore.sidebarSettings.automaticallyHideInactiveFeeds = false;
    await wrapper.vm.$nextTick();
    for (const id of [10, 20, 30]) expect(wrapper.find(`[id="${id}"]`).exists()).toBe(true);
    expect(stores.overviewStore.categories).toEqual(original);
    expect(updateCategoryOrder).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('preserves hidden category positions when reordering active categories', async () => {
    const stores = initializeStores();
    stores.overviewStore.categories[0].feeds[0].lastArticleReceivedAt = '2000-01-01';
    stores.overviewStore.categories[1].feeds = [{ id: 201, categoryId: 20, feedName: 'Active news', unreadCount: 1 }];
    stores.overviewStore.categories.push({ id: 30, name: 'Other', feeds: [{ id: 301, categoryId: 30, feedName: 'Active other', unreadCount: 1 }] });
    stores.uiStore.sidebarSettings.automaticallyHideInactiveFeeds = true;
    const wrapper = mountSidebar(stores.pinia);
    await wrapper.findAll('button').find(button => button.text() === 'Reorder').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.draggable-stub').exists()).toBe(true));
    const draggable = wrapper.getComponent('.draggable-stub');
    expect(draggable.props('modelValue').map(category => category.id)).toEqual([20, 30]);
    draggable.vm.$emit('update:modelValue', [...draggable.props('modelValue')].reverse());
    await wrapper.vm.$nextTick();
    expect(updateCategoryOrder).toHaveBeenCalledWith([10, 30, 20]);
    expect(stores.overviewStore.categories[0].feeds).toHaveLength(1);
    stores.uiStore.sidebarSettings.automaticallyHideInactiveFeeds = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.findAllComponents(SidebarCategoryGroup).map(group => group.get('button').text().replace(/[0-9/]+$/, '').trim())).toEqual(['Technology', 'Other', 'News']);
    wrapper.unmount();
  });

  it('moves feeds when the inactivity threshold changes and keeps the group outside category reordering', async () => {
    const stores = initializeStores();
    const ago = days => new Date(Date.now() - days * 86400000).toISOString();
    stores.overviewStore.categories[1].feeds = [{ id: 201, categoryId: 20, feedName: 'Active news', unreadCount: 1 }];
    stores.overviewStore.categories[0].feeds[0].lastArticleReceivedAt = ago(45);
    stores.overviewStore.categories[0].feeds.push({ id: 102, categoryId: 10, feedName: 'Very old feed', lastArticleReceivedAt: ago(100), unreadCount: 1 });
    stores.uiStore.sidebarSettings.automaticallyHideInactiveFeeds = true;
    const wrapper = mountSidebar(stores.pinia);
    await wrapper.get('[id="inactive-feeds"] button').trigger('click');
    expect(wrapper.get('[id="inactive-feeds"]').text()).toContain('Example feed');
    stores.uiStore.sidebarSettings.inactiveFeedDays = 60;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[id="10"]').text()).toContain('Example feed');
    expect(wrapper.get('[id="inactive-feeds"]').text()).not.toContain('Example feed');
    await wrapper.get('.sidebar-category-reorder-button').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.draggable-stub').exists()).toBe(true));
    const draggable = wrapper.getComponent('.draggable-stub');
    expect(draggable.props('modelValue').map(category => category.id)).toEqual([10, 20]);
    draggable.vm.$emit('update:modelValue', [...draggable.props('modelValue')].reverse());
    await wrapper.vm.$nextTick();
    expect(updateCategoryOrder).toHaveBeenCalledWith([20, 10]);
    expect(stores.overviewStore.categories[1].feeds).toHaveLength(2);
    expect(wrapper.get('[id="inactive-feeds"]').text()).toContain('Very old feed');
    wrapper.unmount();
  });

  it.each([
    ['manual', ['Zulu', 'Alpha', 'Beta'], ['Technology', 'News']],
    ['name', ['Alpha', 'Beta', 'Zulu'], ['News', 'Technology']],
    ['selectedCount', ['Alpha', 'Beta', 'Zulu'], ['Technology', 'News']],
    ['totalCount', ['Beta', 'Zulu', 'Alpha'], ['Technology', 'News']],
    ['recentlyActive', ['Alpha', 'Zulu', 'Beta'], ['News', 'Technology']]
  ])('sorts categories and feeds by %s without changing manual order', async (sortOrder, feeds, categories) => {
    const stores = initializeStores();
    stores.overviewStore.categories[0].feeds = [
      { id: 101, categoryId: 10, feedName: 'Zulu', unreadCount: 2, readCount: 20, favoriteCount: 9, lastArticleReceivedAt: '2026-01-01' },
      { id: 102, categoryId: 10, feedName: 'Alpha', unreadCount: 12, readCount: 0, favoriteCount: 0, lastArticleReceivedAt: '2026-01-03' },
      { id: 103, categoryId: 10, feedName: 'Beta', unreadCount: 12, readCount: 100, favoriteCount: 1 }
    ];
    stores.overviewStore.categories[1].feeds = [{ id: 201, categoryId: 20, feedName: 'Other', lastArticleReceivedAt: '2026-01-04' }];
    stores.overviewStore.categories[0].favoriteCount = 10;
    stores.overviewStore.categories[1].favoriteCount = 20;
    const original = JSON.parse(JSON.stringify(stores.overviewStore.categories));
    stores.uiStore.sidebarSettings.sortOrder = sortOrder;
    // Sorting uses raw counts even when total badges are hidden.
    stores.uiStore.sidebarSettings.showTotalCount = false;
    const wrapper = mountSidebar(stores.pinia);
    const feedNames = () => wrapper.findAllComponents(SidebarFeedItem).map(item => item.text().replace(/[0-9/]+$/, '').trim());
    const categoryNames = () => wrapper.findAllComponents(SidebarCategoryGroup).map(item => item.get('button').text().replace(/[0-9/]+$/, '').trim());
    expect(feedNames()).toEqual(feeds);
    expect(categoryNames()).toEqual(categories);
    expect(wrapper.findAll('button').some(button => button.text() === 'Reorder')).toBe(sortOrder === 'manual');
    if (sortOrder === 'selectedCount') {
      stores.selectionStore.currentSelection.status = 'favorite';
      await wrapper.vm.$nextTick();
      expect(feedNames()).toEqual(['Zulu', 'Beta', 'Alpha']);
      expect(categoryNames()).toEqual(['News', 'Technology']);
      stores.overviewStore.categories[0].feeds[1].favoriteCount = 99;
      await wrapper.vm.$nextTick();
      expect(feedNames()).toEqual(['Alpha', 'Zulu', 'Beta']);
      stores.overviewStore.categories[0].feeds[1].favoriteCount = 0;
    }
    stores.uiStore.sidebarSettings.sortOrder = 'manual';
    await wrapper.vm.$nextTick();
    expect(feedNames()).toEqual(['Zulu', 'Alpha', 'Beta']);
    expect(categoryNames()).toEqual(['Technology', 'News']);
    expect(stores.overviewStore.categories).toEqual(original);
    expect(updateCategoryOrder).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('exits reordering when automatic sorting is saved and keeps inactive feeds last', async () => {
    const stores = initializeStores();
    stores.overviewStore.categories[0].feeds = [
      { id: 101, categoryId: 10, feedName: 'Zulu inactive', lastArticleReceivedAt: '2000-01-01', unreadCount: 0 },
      { id: 102, categoryId: 10, feedName: 'Alpha inactive', lastArticleReceivedAt: '2000-01-01', unreadCount: 0 }
    ];
    stores.overviewStore.categories[0].feeds.push({ id: 103, categoryId: 10, feedName: 'Active technology', unreadCount: 1 });
    stores.overviewStore.categories[1].feeds = [{ id: 201, categoryId: 20, feedName: 'Active news', unreadCount: 1 }];
    stores.uiStore.sidebarSettings.automaticallyHideInactiveFeeds = true;
    stores.uiStore.sidebarSettings.hideZeroCountItems = true;
    const wrapper = mountSidebar(stores.pinia);
    await wrapper.findAll('button').find(button => button.text() === 'Reorder').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.draggable-stub').exists()).toBe(true));
    stores.uiStore.sidebarSettings.sortOrder = 'name';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.draggable-stub').exists()).toBe(false);
    expect(wrapper.findAll('button').some(button => ['Reorder', 'Done'].includes(button.text()))).toBe(false);
    expect(wrapper.findAllComponents(SidebarCategoryGroup).at(-1).get('button').text()).toBe('Inactive feeds');
    await wrapper.get('[id="inactive-feeds"] button').trigger('click');
    expect(wrapper.get('[id="inactive-feeds"]').findAllComponents(SidebarFeedItem).map(feed => feed.text())).toEqual(['Alpha inactive0', 'Zulu inactive0']);
    stores.uiStore.sidebarSettings.sortOrder = 'manual';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.draggable-stub').exists()).toBe(false);
    expect(wrapper.findAll('button').some(button => button.text() === 'Reorder')).toBe(true);
    expect(updateCategoryOrder).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each(['normal', 'reordering', 'inactive'])('toggles feed icons in %s lists without hiding names or counts', async mode => {
    const stores = initializeStores();
    stores.overviewStore.categories[0].feeds[0].favicon = '/example-favicon.png';
    stores.overviewStore.categories[0].feeds.push({ id: 102, categoryId: 10, feedName: 'No favicon', unreadCount: 2 });
    if (mode === 'inactive') {
      stores.uiStore.sidebarSettings.automaticallyHideInactiveFeeds = true;
      stores.overviewStore.categories[0].feeds.forEach(feed => { feed.lastArticleReceivedAt = '2000-01-01'; });
    }
    const wrapper = mountSidebar(stores.pinia);
    if (mode === 'reordering') {
      await wrapper.findAll('button').find(button => button.text() === 'Reorder').trigger('click');
      await vi.waitFor(() => expect(wrapper.find('.draggable-stub').exists()).toBe(true));
    } else if (mode === 'inactive') {
      await wrapper.get('[id="inactive-feeds"] button').trigger('click');
    }
    expect(wrapper.get('[id="101"] img').attributes('src')).toBe('/example-favicon.png');
    expect(wrapper.get('[id="102"] bootstrap-icon-stub').attributes('icon')).toBe('rss-fill');
    stores.uiStore.sidebarSettings.showFeedFavicons = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[id="101"]').find('img').exists()).toBe(false);
    expect(wrapper.get('[id="102"]').find('bootstrap-icon-stub').exists()).toBe(false);
    expect(wrapper.get('[id="101"]').text()).toBe('Example feed3/23');
    expect(wrapper.get('[id="102"]').text()).toBe('No favicon2');
    expect(wrapper.get(`[id="${mode === 'inactive' ? 'inactive-feeds' : '10'}"] button`).find('bootstrap-icon-stub').exists()).toBe(true);
    await wrapper.get('[id="101"]').trigger('click');
    expect(stores.selectionStore.selectFeed).toHaveBeenCalledWith(101, 10);
    stores.uiStore.sidebarSettings.showFeedFavicons = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[id="101"]').find('img').exists()).toBe(true);
    expect(wrapper.get('[id="102"]').find('bootstrap-icon-stub').exists()).toBe(true);
    wrapper.unmount();
  });

  it.each(['manual', 'name', 'selectedCount', 'totalCount', 'recentlyActive'])('dynamic sorting overrides %s and follows status changes', async sortOrder => {
    const stores = initializeStores();
    stores.overviewStore.categories[0].feeds = [
      { id: 101, categoryId: 10, feedName: 'Alpha', unreadCount: 1, readCount: 100, favoriteCount: 20, hotCount: 0, lastArticleReceivedAt: '2026-01-02' },
      { id: 102, categoryId: 10, feedName: 'Zulu', unreadCount: 9, readCount: 0, favoriteCount: 1, hotCount: 30, lastArticleReceivedAt: '2026-01-01' }
    ];
    stores.overviewStore.categories[0].favoriteCount = 21;
    stores.overviewStore.categories[1].favoriteCount = 30;
    stores.uiStore.sidebarSettings.sortOrder = sortOrder;
    const wrapper = mountSidebar(stores.pinia);
    const feedNames = () => wrapper.findAllComponents(SidebarFeedItem).map(item => item.text().replace(/[0-9/]+$/, '').trim());
    const initial = feedNames();
    if (sortOrder === 'manual') {
      await wrapper.findAll('button').find(button => button.text() === 'Reorder').trigger('click');
      await vi.waitFor(() => expect(wrapper.find('.draggable-stub').exists()).toBe(true));
    }
    stores.uiStore.sidebarSettings.sortByCurrentSelection = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.draggable-stub').exists()).toBe(false);
    expect(wrapper.findAll('button').some(button => ['Reorder', 'Done'].includes(button.text()))).toBe(false);
    expect(feedNames()).toEqual(['Zulu', 'Alpha']);
    stores.selectionStore.currentSelection.status = 'favorite';
    await wrapper.vm.$nextTick();
    expect(feedNames()).toEqual(['Alpha', 'Zulu']);
    expect(wrapper.findAllComponents(SidebarCategoryGroup).map(item => item.get('button').text().replace(/[0-9/]+$/, '').trim())).toEqual(['News', 'Technology']);
    stores.selectionStore.currentSelection.status = 'hot';
    await wrapper.vm.$nextTick();
    expect(feedNames()).toEqual(['Zulu', 'Alpha']);
    stores.overviewStore.categories[0].feeds[0].hotCount = 40;
    await wrapper.vm.$nextTick();
    expect(feedNames()).toEqual(['Alpha', 'Zulu']);
    stores.uiStore.sidebarSettings.sortByCurrentSelection = false;
    stores.selectionStore.currentSelection.status = 'unread';
    await wrapper.vm.$nextTick();
    expect(feedNames()).toEqual(initial);
    expect(stores.uiStore.sidebarSettings.sortOrder).toBe(sortOrder);
    expect(wrapper.findAll('button').some(button => button.text() === 'Reorder')).toBe(sortOrder === 'manual');
    expect(updateCategoryOrder).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('omits Pinned when no feeds or categories are pinned', () => {
    const stores = initializeStores();
    stores.overviewStore.smartFolders[0].pinned = true;
    stores.overviewStore.topTags[0].pinned = true;
    const wrapper = mountSidebar(stores.pinia);
    expect(wrapper.find('section[aria-label="Pinned"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each(['feed', 'category'])('shows a pinned %s shortcut above Smart Folders without moving its original', async kind => {
    const stores = initializeStores();
    const category = stores.overviewStore.categories[0];
    const item = kind === 'feed' ? category.feeds[0] : category;
    item.pinned = true;
    const wrapper = mountSidebar(stores.pinia);
    const section = wrapper.get('section[aria-label="Pinned"]');
    expect(section.text()).toContain('Pinned');
    expect(section.get('bootstrap-icon-stub').attributes('icon')).toBe('pin-angle-fill');
    const shortcut = wrapper.get(`[id="pinned-${kind}-${item.id}"]`);
    expect(shortcut.text()).toContain(kind === 'feed' ? item.feedName : item.name);
    expect(wrapper.get(`[id="${item.id}"]`).text()).toContain(kind === 'feed' ? item.feedName : item.name);
    expect(section.findAll('button:not([aria-haspopup])')).toHaveLength(1);
    const action = wrapper.findAll('button').find(button => button.text() === 'Mark as read');
    expect(action.element.compareDocumentPosition(section.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.element.compareDocumentPosition(wrapper.get('.sidebar-smart-folders').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    item.pinned = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('section[aria-label="Pinned"]').exists()).toBe(false);
    expect(wrapper.find(`[id="${item.id}"]`).exists()).toBe(true);
    wrapper.unmount();
  });

  it('uses normal navigation and selected state for both shortcut types', async () => {
    const stores = initializeStores();
    stores.overviewStore.categories[0].pinned = true;
    stores.overviewStore.categories[0].feeds[0].pinned = true;
    stores.selectionStore.selectFeed.mockRestore();
    stores.selectionStore.selectCategory.mockRestore();
    vi.spyOn(stores.selectionStore, 'selectFeed');
    vi.spyOn(stores.selectionStore, 'selectCategory');
    const wrapper = mountSidebar(stores.pinia);
    expect(wrapper.get('[id="pinned-category-10"] button').attributes('aria-current')).toBe('page');
    expect(wrapper.get('[id="10"] button').attributes('aria-current')).toBe('page');
    await wrapper.get('[id="pinned-feed-101"]').trigger('click');
    expect(stores.selectionStore.selectFeed).toHaveBeenCalledWith(101, 10);
    expect(wrapper.get('[id="pinned-feed-101"]').attributes('aria-current')).toBe('page');
    expect(wrapper.get('[id="101"]').attributes('aria-current')).toBe('page');
    expect(wrapper.get('[id="pinned-category-10"] button').attributes('aria-current')).toBeUndefined();
    await wrapper.get('[id="pinned-category-10"] button').trigger('click');
    expect(stores.selectionStore.selectCategory).toHaveBeenCalledWith(10);
    expect(wrapper.get('[id="pinned-category-10"] button').attributes('aria-current')).toBe('page');
    expect(wrapper.get('[id="pinned-feed-101"]').attributes('aria-current')).toBeUndefined();
    // A category shortcut is a single row, even when its original category is expanded.
    expect(wrapper.get('[id="pinned-category-10"]').findAll('button:not([aria-haspopup])')).toHaveLength(1);
    expect(wrapper.get('[id="101"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shares contextual counts and count formatting with original rows', async () => {
    const stores = initializeStores();
    const category = stores.overviewStore.categories[0];
    const feed = category.feeds[0];
    category.pinned = feed.pinned = true;
    category.favoriteCount = 7;
    feed.favoriteCount = 2;
    const wrapper = mountSidebar(stores.pinia);
    for (const status of ['unread', 'favorite', 'briefing', 'hot']) {
      stores.selectionStore.currentSelection.status = status;
      for (const showTotalCount of [true, false]) {
        stores.uiStore.sidebarSettings.showTotalCount = showTotalCount;
        await wrapper.vm.$nextTick();
        expect(wrapper.get('[id="pinned-category-10"] button').text()).toBe(wrapper.get('[id="10"] button').text());
        expect(wrapper.get('[id="pinned-feed-101"]').text()).toBe(wrapper.get('[id="101"]').text());
        expect(wrapper.get('[id="pinned-feed-101"]').text()).toContain(String(feed[`${status}Count`]));
      }
    }
    stores.selectionStore.currentSelection.status = 'unread';
    stores.uiStore.sidebarSettings.showTotalCount = true;
    feed.readCount = 0;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[id="pinned-feed-101"]').text()).toBe('Example feed3');
    stores.uiStore.sidebarSettings.declutterCounts = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[id="pinned-feed-101"]').text()).toBe('Example feed3/3');
    feed.unreadCount = 4;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[id="pinned-feed-101"]').text()).toBe('Example feed4/4');
    wrapper.unmount();
  });

  it('orders categories before feeds using the existing sidebar order', async () => {
    const stores = initializeStores();
    stores.overviewStore.categories.forEach(category => { category.pinned = true; });
    stores.overviewStore.categories[0].feeds[0].pinned = true;
    stores.overviewStore.categories[1].feeds = [{ id: 201, categoryId: 20, feedName: 'News feed', pinned: true, unreadCount: 1 }];
    const wrapper = mountSidebar(stores.pinia);
    const labels = () => wrapper.get('section[aria-label="Pinned"]').findAll('button:not([aria-haspopup])').map(button => button.text().replace(/[0-9/]+$/, '').trim());
    expect(labels()).toEqual(['Technology', 'News', 'Example feed', 'News feed']);
    stores.uiStore.sidebarSettings.sortOrder = 'name';
    await wrapper.vm.$nextTick();
    expect(labels()).toEqual(['News', 'Technology', 'News feed', 'Example feed']);
    expect(stores.overviewStore.categories.map(category => category.id)).toEqual([10, 20]);
    wrapper.unmount();
  });

  it('keeps pinned shortcuts available when normal lists filter an item', async () => {
    const stores = initializeStores();
    const category = stores.overviewStore.categories[0];
    const feed = category.feeds[0];
    category.pinned = feed.pinned = true;
    feed.lastArticleReceivedAt = '2000-01-01';
    feed.favicon = '/pinned-feed.png';
    stores.uiStore.sidebarSettings.automaticallyHideInactiveFeeds = true;
    stores.uiStore.sidebarSettings.hideZeroCountItems = true;
    feed.unreadCount = category.unreadCount = 0;
    const wrapper = mountSidebar(stores.pinia);
    expect(wrapper.find('[id="10"]').exists()).toBe(false);
    expect(wrapper.get('[id="pinned-category-10"]').text()).toContain('Technology0');
    expect(wrapper.get('[id="pinned-feed-101"] img').attributes('src')).toBe('/pinned-feed.png');
    await wrapper.get('[id="inactive-feeds"] button').trigger('click');
    expect(wrapper.get('[id="101"]').text()).toBe(wrapper.get('[id="pinned-feed-101"]').text());
    stores.uiStore.sidebarSettings.showFeedFavicons = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[id="pinned-feed-101"]').find('img').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens sidebar settings independently of Reorder', async () => {
    const stores = initializeStores();
    const wrapper = mountSidebar(stores.pinia);

    await wrapper.get('button[aria-label="Sidebar configuration settings"]').trigger('click');

    expect(stores.uiStore.setShowModal).toHaveBeenCalledWith('SidebarConfiguration');
    expect(wrapper.get('.sidebar-category-reorder-button').attributes('aria-pressed')).toBe('false');
    wrapper.unmount();
  });

  it('renders navigation counts and forwards category and feed selections', async () => {
    const stores = initializeStores();
    const wrapper = mountSidebar(stores.pinia);

    expect(wrapper.find('.sidebar-smart-folders').text()).toContain('Research');
    expect(wrapper.find('.sidebar-smart-folders').text()).toContain('11');
    expect(wrapper.find('.sidebar-status-filters').text()).toContain('Unread13');
    expect(wrapper.find('.sidebar-tags').text()).toContain('Top tags in Unread');
    expect(wrapper.find('.sidebar-tags').text()).toContain('Javascript');
    expect(wrapper.find('.sidebar-categories').text()).toContain('Technology');
    expect(wrapper.find('.sidebar-categories').text()).toContain('Example feed');

    await wrapper.find('[id="10"] .sidebar-category-select').trigger('click');
    await wrapper.find('[id="101"]').trigger('click');

    expect(stores.selectionStore.selectCategory).toHaveBeenCalledWith(10);
    expect(stores.selectionStore.selectFeed).toHaveBeenCalledWith(101, 10);
  });

  it('retains management actions and persists the reordered category IDs', async () => {
    const stores = initializeStores();
    const wrapper = mountSidebar(stores.pinia);
    const reordered = [...stores.overviewStore.categories].reverse();

    await wrapper.find('.sidebar-add-button').trigger('click');
    expect(stores.uiStore.setShowModal).toHaveBeenCalledWith('NewCategory');

    wrapper.vm.applyCategoryOrder(reordered);

    expect(stores.overviewStore.applyCategoryOrder).toHaveBeenCalledWith(reordered);
    expect(updateCategoryOrder).toHaveBeenCalledWith([20, 10]);

    stores.selectionStore.currentSelection.categoryId = '%';
    stores.selectionStore.currentSelection.feedId = '%';
    await wrapper.vm.$nextTick();
    await wrapper.find('.sidebar-cleanup-button').trigger('click');
    await wrapper.find('.sidebar-logout-button').trigger('click');

    expect(stores.uiStore.setShowModal).toHaveBeenCalledWith('Cleanup');
    expect(wrapper.emitted('logout')).toHaveLength(1);
  });

  it('keeps All categories fixed above the categories in normal and reorder modes', async () => {
    const stores = initializeStores();
    const wrapper = mountSidebar(stores.pinia);

    stores.overviewStore.unreadCount = 450;
    stores.selectionStore.currentSelection.categoryId = '%';
    await wrapper.vm.$nextTick();

    const section = wrapper.get('.sidebar-categories');
    const allCategories = section.get('.sidebar-all-categories-item');
    expect(section.findAll('.sidebar-section-title').map(heading => heading.text())).toEqual(['Categories']);
    expect(section.get('.sidebar-category-heading').element.nextElementSibling).toBe(allCategories.element);
    expect(allCategories.get('.sidebar-item-title').text()).toBe('All categories');
    expect(allCategories.get('.sidebar-count').text()).toBe('450/459');
    expect(allCategories.classes()).toContain('selected');
    expect(allCategories.attributes('aria-current')).toBe('page');
    await allCategories.trigger('click');
    expect(stores.selectionStore.selectCategory).toHaveBeenCalledWith('%');

    expect(wrapper.find('.draggable-stub').exists()).toBe(false);
    expect(wrapper.findAll('.sidebar-category-list > [id]')).toHaveLength(2);

    await wrapper.get('.sidebar-category-reorder-button').trigger('click');
    await vi.waitFor(() => expect(wrapper.vm.categoryReordering).toBe(true));

    expect(wrapper.get('.sidebar-category-reorder-button').text()).toContain('Done');
    expect(wrapper.find('.draggable-stub').exists()).toBe(true);
    const draggable = wrapper.get('.draggable-stub');
    expect(allCategories.element.nextElementSibling).toBe(draggable.element);
    expect(draggable.find('.sidebar-all-categories-item').exists()).toBe(false);
    expect(draggable.findAll('.sidebar-category').map(category => category.attributes('id'))).toEqual(['10', '20']);

    wrapper.getComponent('.draggable-stub').vm.$emit('update:modelValue', [...stores.overviewStore.categories].reverse());
    await wrapper.vm.$nextTick();
    expect(updateCategoryOrder).toHaveBeenCalledWith([20, 10]);
    expect(draggable.findAll('.sidebar-category').map(category => category.attributes('id'))).toEqual(['20', '10']);
    expect(section.findAll('.sidebar-all-categories-item')).toHaveLength(1);
    expect(allCategories.element.nextElementSibling).toBe(draggable.element);


    await wrapper.get('.sidebar-category-reorder-button').trigger('click');

    expect(wrapper.vm.categoryReordering).toBe(false);
    expect(wrapper.find('.draggable-stub').exists()).toBe(false);
    expect(wrapper.findAll('.sidebar-category-list > [id]')).toHaveLength(2);
  });

  // Verifies recoverable resource failures remain visible beside cached sidebar data.
  it('presents resource-specific retries without hiding cached navigation', async () => {
    const stores = initializeStores();
    stores.overviewStore.$patch({
      overviewCountsStatus: 'error',
      smartFoldersStatus: 'success',
      smartFolderCountsStatus: 'error',
      topTagsStatus: 'error'
    });
    vi.spyOn(stores.overviewStore, 'refreshOverviewCounts').mockResolvedValue(false);
    vi.spyOn(stores.overviewStore, 'fetchSmartFolderCounts').mockResolvedValue(false);
    const wrapper = mountSidebar(stores.pinia);

    expect(wrapper.text()).toContain('Counts could not refresh.');
    expect(wrapper.text()).toContain('Smart Folder counts may be outdated.');
    expect(wrapper.text()).toContain('Top tags could not refresh.');
    expect(wrapper.text()).toContain('Research');
    expect(wrapper.text()).toContain('Javascript');

    const retryButtons = wrapper.findAll('.sidebar-resource-error button');
    await Promise.all(retryButtons.map(button => button.trigger('click')));

    expect(stores.overviewStore.refreshOverviewCounts).toHaveBeenCalledOnce();
    expect(stores.overviewStore.fetchSmartFolderCounts).toHaveBeenCalledOnce();
    expect(stores.overviewStore.fetchTopTags).toHaveBeenCalledOnce();
  });

  it('keeps leaf component event payloads and formatted counts unchanged', async () => {
    const feed = {
      id: 101,
      categoryId: 10,
      feedName: 'Example feed',
      status: 'active'
    };
    const category = {
      id: 10,
      name: 'Technology',
      feeds: [feed]
    };
    const action = mount(SidebarActionButton, {
      props: {
        icon: 'plus',
        label: 'Add'
      },
      global: {
        stubs: {
          BootstrapIcon: true
        }
      }
    });
    const nav = mount(SidebarNavItem, {
      props: {
        count: 1200,
        icon: 'rss',
        title: 'Unread'
      },
      global: {
        stubs: {
          BootstrapIcon: true
        }
      }
    });
    const group = mount(SidebarCategoryGroup, {
      props: {
        category,
        count: 1200,
        countResolver: () => 3,
        selectedCategoryId: 10,
        selectedFeedId: '%'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          BootstrapIcon: true
        }
      }
    });

    await action.trigger('click');
    await nav.trigger('click');
    await group.find('.sidebar-category-select').trigger('click');
    await group.findComponent(SidebarFeedItem).get('button:not([aria-haspopup])').trigger('click');

    expect(action.emitted('select')).toEqual([[]]);
    expect(nav.emitted('select')).toEqual([[]]);
    expect(nav.text()).toContain('1.2K');
    expect(group.emitted('select-category')).toEqual([[category]]);
    expect(group.emitted('select-feed')).toEqual([[feed]]);
  });

  it('renders sidebar navigation rows as native keyboard controls', () => {
    const feed = { id: 101, categoryId: 10, feedName: 'Example feed', status: 'active' };
    const category = { id: 10, name: 'Technology', feeds: [feed] };
    const nav = mount(SidebarNavItem, {
      props: { icon: 'rss', title: 'Unread', selected: true },
      global: { plugins: [createPinia()], stubs: { BootstrapIcon: true } }
    });
    const group = mount(SidebarCategoryGroup, {
      props: {
        category,
        countResolver: () => 3,
        selectedCategoryId: 10,
        selectedFeedId: '%'
      },
      global: { plugins: [createPinia()], stubs: { BootstrapIcon: true } }
    });
    const categoryHeader = group.get('.sidebar-category-select');
    const feedRow = group.get('.sidebar-feed-select');

    expect(nav.element.tagName).toBe('BUTTON');
    expect(categoryHeader.element.tagName).toBe('BUTTON');
    expect(feedRow.element.tagName).toBe('BUTTON');
    expect(nav.attributes()).toMatchObject({ type: 'button', 'aria-current': 'page' });
    expect(categoryHeader.attributes()).toMatchObject({ type: 'button', 'aria-current': 'page' });
    expect(feedRow.attributes('type')).toBe('button');
  });

  // This verifies loading sidebar actions expose their busy state and suppress duplicate selection.
  it('keeps loading sidebar actions accessible and non-interactive', async () => {
    const action = mount(SidebarActionButton, {
      props: {
        icon: 'arrow-repeat',
        label: 'Refresh feeds',
        variant: 'sidebar-button sidebar-button-refresh',
        loading: true
      }
    });

    expect(action.element.tagName).toBe('BUTTON');
    expect(action.attributes('aria-busy')).toBe('true');
    expect(action.attributes()).toHaveProperty('disabled');
    expect(action.classes()).toContain('sidebar-button-refresh');
    expect(action.findAll('.app-icon--control')).toHaveLength(2);
    expect(action.findAll('[aria-hidden="true"]')).toHaveLength(2);
    expect(action.get('.spinner .bi--animation-spin').exists()).toBe(true);

    await action.trigger('click');

    expect(action.emitted('select')).toBeUndefined();
  });
});
