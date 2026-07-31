import { config, mount } from '@vue/test-utils';
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
  openFeedRefreshEvents: vi.fn(),
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
  config.global.plugins = [pinia];
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
      feeds: [{
        id: 101,
        categoryId: 10,
        feedName: 'Example feed',
        status: 'active',
        briefingCount: 2,
        unreadCount: 3
      }]
    }, {
      id: 20,
      name: 'News',
      briefingCount: 1,
      unreadCount: 5,
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

  return { authStore, overviewStore, selectionStore, uiStore };
};

// This function mounts the sidebar with a slot-compatible draggable boundary.
const mountSidebar = () => mount(Sidebar, {
  global: {
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
  it('renders the selected status count for categories and feeds', async () => {
    const stores = initializeStores();
    const wrapper = mountSidebar();

    stores.selectionStore.$patch({
      currentSelection: {
        ...stores.selectionStore.currentSelection,
        status: 'briefing'
      }
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[id="10"] .sidebar-category-header .sidebar-count').text()).toBe('3');
    expect(wrapper.get('[id="101"] .sidebar-count').text()).toBe('2');

    stores.selectionStore.$patch({
      currentSelection: {
        ...stores.selectionStore.currentSelection,
        status: 'unread'
      }
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[id="10"] .sidebar-category-header .sidebar-count').text()).toBe('8');
    expect(wrapper.get('[id="101"] .sidebar-count').text()).toBe('3');
  });

  it('renders navigation counts and forwards category and feed selections', async () => {
    const stores = initializeStores();
    const wrapper = mountSidebar();

    expect(wrapper.find('.sidebar-smart-folders').text()).toContain('Research');
    expect(wrapper.find('.sidebar-smart-folders').text()).toContain('11');
    expect(wrapper.find('.sidebar-status-filters').text()).toContain('Unread13');
    expect(wrapper.find('.sidebar-tags').text()).toContain('Javascript');
    expect(wrapper.find('.sidebar-categories').text()).toContain('Technology');
    expect(wrapper.find('.sidebar-categories').text()).toContain('Example feed');

    await wrapper.find('[id="10"] .sidebar-category-header').trigger('click');
    await wrapper.find('[id="101"]').trigger('click');

    expect(stores.selectionStore.selectCategory).toHaveBeenCalledWith(10);
    expect(stores.selectionStore.selectFeed).toHaveBeenCalledWith(101, 10);
  });

  it('retains management actions and persists the reordered category IDs', async () => {
    const stores = initializeStores();
    const wrapper = mountSidebar();
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
    const wrapper = mountSidebar();

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
        stubs: {
          BootstrapIcon: true
        }
      }
    });

    await action.trigger('click');
    await nav.trigger('click');
    await group.find('.sidebar-category-header').trigger('click');
    await group.findComponent(SidebarFeedItem).trigger('click');

    expect(action.emitted('select')).toEqual([[]]);
    expect(nav.emitted('select')).toEqual([[]]);
    expect(nav.text()).toContain('1.2K');
    expect(group.emitted('select-category')).toEqual([[category]]);
    expect(group.emitted('select-feed')).toEqual([[feed]]);
  });
});
