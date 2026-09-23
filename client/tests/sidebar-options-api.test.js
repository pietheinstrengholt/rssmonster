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

    await wrapper.find('[id="10"] .sidebar-category-header').trigger('click');
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

  it('renders sidebar navigation rows as native keyboard controls', () => {
    const feed = { id: 101, categoryId: 10, feedName: 'Example feed', status: 'active' };
    const category = { id: 10, name: 'Technology', feeds: [feed] };
    const nav = mount(SidebarNavItem, {
      props: { icon: 'rss', title: 'Unread', selected: true },
      global: { stubs: { BootstrapIcon: true } }
    });
    const group = mount(SidebarCategoryGroup, {
      props: {
        category,
        countResolver: () => 3,
        selectedCategoryId: 10,
        selectedFeedId: '%'
      },
      global: { stubs: { BootstrapIcon: true } }
    });
    const categoryHeader = group.get('.sidebar-category-header');
    const feedRow = group.get('.sidebar-feed');

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
