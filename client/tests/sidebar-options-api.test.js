import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/components/Sidebar.vue';
import SidebarActionButton from '../src/components/sidebar/SidebarActionButton.vue';
import SidebarCategoryGroup from '../src/components/sidebar/SidebarCategoryGroup.vue';
import SidebarFeedItem from '../src/components/sidebar/SidebarFeedItem.vue';
import SidebarNavItem from '../src/components/sidebar/SidebarNavItem.vue';
import Cookies from 'js-cookie';
import { setAuthToken } from '../src/api/client';
import { updateCategoryOrder } from '../src/api/manager';

vi.mock('js-cookie', () => ({
  default: {
    get: vi.fn(),
    remove: vi.fn()
  }
}));

vi.mock('../src/api/client', () => ({
  setAuthToken: vi.fn()
}));

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
  auth: {
    setRole: vi.fn(),
    setToken: vi.fn()
  },
  data: reactive({
    briefingCount: 4,
    categories: [{
      id: 10,
      name: 'Technology',
      unreadCount: 8,
      feeds: [{
        id: 101,
        categoryId: 10,
        feedName: 'Example feed',
        status: 'active',
        unreadCount: 3
      }]
    }, {
      id: 20,
      name: 'News',
      unreadCount: 5,
      feeds: []
    }],
    clickedCount: 1,
    currentSelection: {
      AIEnabled: true,
      categoryId: 10,
      feedId: '%',
      smartFolderId: null,
      status: 'unread',
      tag: null
    },
    favoriteCount: 2,
    fetchSmartFolders: vi.fn().mockResolvedValue({}),
    fetchTopTags: vi.fn().mockResolvedValue({}),
    hotCount: 6,
    readCount: 9,
    selectCategory: vi.fn(),
    selectFeed: vi.fn(),
    setSelectedStatus: vi.fn(),
    setShowModal: vi.fn(),
    setSmartFolder: vi.fn(),
    setTag: vi.fn(),
    applyCategoryOrder: vi.fn(function applyCategoryOrder(categories) {
      this.categories = categories;
    }),
    smartFolders: [{
      id: 30,
      name: 'Research',
      ArticleCount: 11
    }],
    topTags: [{
      name: 'javascript',
      count: 7
    }],
    unreadCount: 13,
    unreadsSinceLastUpdate: 0
  })
});

// This function mounts the sidebar with a slot-compatible draggable boundary.
const mountSidebar = store => mount(Sidebar, {
  global: {
    mocks: {
      $store: store
    },
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
  it('renders navigation counts and forwards category and feed selections', async () => {
    const store = createStore();
    const wrapper = mountSidebar(store);

    expect(wrapper.find('.sidebar-smart-folders').text()).toContain('Research');
    expect(wrapper.find('.sidebar-smart-folders').text()).toContain('11');
    expect(wrapper.find('.sidebar-status-filters').text()).toContain('Unread13');
    expect(wrapper.find('.sidebar-tags').text()).toContain('Javascript');
    expect(wrapper.find('.sidebar-categories').text()).toContain('Technology');
    expect(wrapper.find('.sidebar-categories').text()).toContain('Example feed');

    await wrapper.find('[id="10"] .sidebar-category-header').trigger('click');
    await wrapper.find('[id="101"]').trigger('click');

    expect(store.data.selectCategory).toHaveBeenCalledWith(10);
    expect(store.data.selectFeed).toHaveBeenCalledWith(101, 10);
  });

  it('retains management actions and persists the reordered category IDs', async () => {
    const store = createStore();
    const wrapper = mountSidebar(store);
    const reordered = [...store.data.categories].reverse();
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });

    await wrapper.find('.sidebar-add-button').trigger('click');
    expect(store.data.setShowModal).toHaveBeenCalledWith('NewCategory');

    wrapper.vm.applyCategoryOrder(reordered);

    expect(store.data.applyCategoryOrder).toHaveBeenCalledWith(reordered);
    expect(updateCategoryOrder).toHaveBeenCalledWith([20, 10]);

    store.data.currentSelection.categoryId = '%';
    store.data.currentSelection.feedId = '%';
    await wrapper.vm.$nextTick();
    await wrapper.find('.sidebar-cleanup-button').trigger('click');
    await wrapper.find('.sidebar-logout-button').trigger('click');

    expect(store.data.setShowModal).toHaveBeenCalledWith('Cleanup');
    expect(setAuthToken).toHaveBeenCalledWith(null);
    expect(store.auth.setToken).toHaveBeenCalledWith(null);
    expect(store.auth.setRole).toHaveBeenCalledWith(null);
    expect(Cookies.remove).toHaveBeenCalledWith('token');
    expect(reload).toHaveBeenCalledOnce();
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
