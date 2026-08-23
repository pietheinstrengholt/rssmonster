import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppError from '../src/components/shared/AppError.vue';
import DesktopToolbar from '../src/components/shell/DesktopToolbar.vue';
import MobileMenuOverlay from '../src/components/shell/MobileMenuOverlay.vue';
import MobileToolbar from '../src/components/shell/MobileToolbar.vue';
import Sidebar from '../src/components/sidebar/Sidebar.vue';
import { markAllAsRead } from '../src/api/articles';
import { updateCategoryOrder } from '../src/api/manager';
import { useAuthStore } from '../src/store/auth.js';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';

const pushMocks = vi.hoisted(() => ({
  getState: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn()
}));

vi.mock('../src/services/pushNotifications.js', () => ({
  getPushNotificationState: pushMocks.getState,
  subscribeToPushNotifications: pushMocks.subscribe,
  unsubscribeFromPushNotifications: pushMocks.unsubscribe
}));

vi.mock('../src/api/articles', () => ({
  markAllAsRead: vi.fn()
}));

vi.mock('../src/api/manager', () => ({
  fetchOverview: vi.fn(),
  fetchOverviewCounts: vi.fn().mockResolvedValue({ data: {} }),
  fetchOverviewLite: vi.fn().mockResolvedValue({ data: {} }),
  updateCategoryOrder: vi.fn()
}));

vi.mock('../src/api/settings', () => ({
  saveThemeMode: vi.fn()
}));

// This function creates the shared selection and action contract used by navigation components.
function createStore() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const authStore = useAuthStore(pinia);
  const overviewStore = useOverviewStore(pinia);
  const selectionStore = useSelectionStore(pinia);
  const uiStore = useUiStore(pinia);

  overviewStore.$patch({
    briefingCount: 5,
    categories: [{
      id: 10,
      name: 'Technology',
      unreadCount: 4,
      readCount: 2,
      feeds: []
    }],
    clickedCount: 1,
    favoriteCount: 2,
    hotCount: 3,
    readCount: 8,
    smartFolders: [{ id: 20, name: 'Research', ArticleCount: 6 }],
    topTags: [
      { name: 'one', count: 6 },
      { name: 'two', count: 5 },
      { name: 'three', count: 4 },
      { name: 'four', count: 3 },
      { name: 'five', count: 2 },
      { name: 'six', count: 1 }
    ],
    unreadCount: 12,
    unreadsSinceLastUpdate: 0
  });
  selectionStore.$patch({
    currentSelection: {
      ...selectionStore.currentSelection,
      AIEnabled: true,
      AssistantEnabled: true,
      categoryId: '%',
      feedId: '%',
      grouping: 'none',
      smartFolderId: null,
      sort: 'desc',
      status: 'unread',
      tag: null,
      viewMode: 'full'
    }
  });
  uiStore.$patch({
    chatAssistantOpen: false,
    searchQuery: '',
    themeMode: 'system'
  });

  overviewStore.fetchSmartFolders = vi.fn().mockResolvedValue({});
  overviewStore.fetchTopTags = vi.fn().mockResolvedValue({});

  [
    [overviewStore, 'applyCategoryOrder'],
    [selectionStore, 'selectCategory'],
    [selectionStore, 'selectFeed'],
    [selectionStore, 'setGrouping'],
    [selectionStore, 'setSelectedSearch'],
    [selectionStore, 'setSelectedSort'],
    [selectionStore, 'setSelectedStatus'],
    [selectionStore, 'setSmartFolder'],
    [selectionStore, 'setTag'],
    [selectionStore, 'setViewMode'],
    [uiStore, 'setChatAssistantOpen'],
    [uiStore, 'setMobileSearchOpen'],
    [uiStore, 'setSearchQuery'],
    [uiStore, 'setShowModal'],
    [uiStore, 'setThemeMode']
  ].forEach(([store, action]) => vi.spyOn(store, action));

  return {
    authStore,
    overviewStore,
    pinia,
    selectionStore,
    uiStore
  };
}

// This function mounts a toolbar with the production store-facing behavior intact.
function mountToolbar(component, store) {
  const options = {
    global: {
      plugins: [store.pinia],
      stubs: { Settings: true }
    }
  };

  return component === DesktopToolbar
    ? shallowMount(component, options)
    : mount(component, options);
}

// This function mounts the sidebar while keeping drag rendering deterministic.
function mountSidebar(store) {
  return mount(Sidebar, {
    global: {
      plugins: [store.pinia],
      stubs: {
        draggable: {
          props: ['modelValue'],
          template: '<div><slot name="item" v-for="item in modelValue" :key="item.id" :element="item" /></div>'
        }
      }
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  pushMocks.getState.mockReset().mockResolvedValue({
    available: false,
    permission: 'unsupported',
    publicKey: null,
    reason: 'unsupported',
    subscribed: false
  });
  pushMocks.subscribe.mockReset().mockResolvedValue(null);
  pushMocks.unsubscribe.mockReset().mockResolvedValue(false);
  vi.useFakeTimers();
});

afterEach(() => {
  document.body.classList.remove('mobile-options-open');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fatal application error presentation', () => {
  it.each([
    ['offline', 'You are offline', 'Cannot reach the RSSMonster backend.', true],
    ['unauthorized', 'Session expired', 'Please log in again.', false],
    ['overview', 'Could not load RSSMonster', 'The server returned an error', true],
    ['unexpected', 'RSSMonster is unavailable', 'Reload the page', false]
  ])('maps %s failures to recovery copy and retry availability', async (type, title, message, retry) => {
    const wrapper = mount(AppError, { props: { type } });

    expect(wrapper.get('h1').text()).toBe(title);
    expect(wrapper.get('p').text()).toContain(message);
    expect(wrapper.find('button').exists()).toBe(retry);
    expect(wrapper.attributes('role')).toBe('alert');

    if (retry) {
      expect(wrapper.get('.app-error__guidance').text()).toBeTruthy();
      await wrapper.get('button').trigger('click');
      expect(wrapper.emitted('retry')).toHaveLength(1);
    }
  });
});

describe('desktop toolbar interactions', () => {
  it('validates and debounces search while exposing responsive copy', async () => {
    const store = createStore();
    const wrapper = mountToolbar(DesktopToolbar, store);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    window.dispatchEvent(new Event('resize'));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.toolbar-search-input').attributes('placeholder')).toBe('Search');

    await wrapper.get('.toolbar-search-button').trigger('click');
    expect(wrapper.classes()).not.toContain('toolbar-search-open');
    expect(wrapper.get('.toolbar-search').classes()).toContain('toolbar-search-open');

    await wrapper.get('.toolbar-search-input').setValue('tag:science');
    await vi.advanceTimersByTimeAsync(300);
    expect(store.selectionStore.setSelectedSearch).toHaveBeenCalledWith('tag:science');

    store.selectionStore.setSelectedSearch.mockClear();
    await wrapper.get('.toolbar-search-input').setValue('titel:science');
    await vi.advanceTimersByTimeAsync(300);
    expect(store.selectionStore.setSelectedSearch).not.toHaveBeenCalled();
    expect(wrapper.get('.toolbar-search').classes()).toContain('toolbar-search-invalid');

    await wrapper.get('.toolbar-search-button').trigger('click');
    expect(wrapper.get('.toolbar-search').classes()).not.toContain('toolbar-search-open');
  });

  it('routes dropdown, grouping, chat, focus, and theme synchronization actions', async () => {
    const store = createStore();
    const wrapper = mountToolbar(DesktopToolbar, store);

    wrapper.vm.dropdownOptionClicked('viewMode', 'minimal');
    wrapper.vm.dropdownOptionClicked('sort', 'asc');
    wrapper.vm.dropdownOptionClicked('grouping', 'none');
    wrapper.vm.dropdownOptionClicked('grouping', 'event');
    wrapper.vm.dropdownOptionClicked('unknown', 'ignored');
    wrapper.vm.handleForceReload();
    wrapper.vm.chatAssistant();

    expect(store.selectionStore.setViewMode).toHaveBeenCalledWith('minimal');
    expect(store.selectionStore.setSelectedSort).toHaveBeenCalledWith('asc');
    expect(store.selectionStore.setGrouping).toHaveBeenCalledTimes(1);
    expect(store.selectionStore.setGrouping).toHaveBeenCalledWith('event');
    expect(store.uiStore.setSearchQuery).toHaveBeenCalledWith(null);
    expect(store.uiStore.setChatAssistantOpen).toHaveBeenCalledWith(true);
    expect(wrapper.emitted('forceReload')).toHaveLength(1);

    window.dispatchEvent(new Event('rssmonster:focus-search'));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.toolbar-search').classes()).toContain('toolbar-search-open');

    store.uiStore.themeMode = 'dark';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.selectedThemeMode).toBe('dark');
  });
});

describe('mobile toolbar interactions', () => {
  it('opens, applies, clears, and leaves shell transitions to its owner', async () => {
    const store = createStore();
    const wrapper = mountToolbar(MobileToolbar, store);

    await wrapper.get('.mobile-search-toggle').trigger('click');
    expect(wrapper.find('.mobile-search-panel').exists()).toBe(true);
    expect(store.uiStore.setMobileSearchOpen).toHaveBeenCalledWith(true);

    await wrapper.get('.mobile-search-input').setValue('rss');
    expect(store.selectionStore.setSelectedSearch).toHaveBeenCalledWith('rss');
    await wrapper.get('.mobile-search-input').trigger('keyup.enter');
    expect(wrapper.find('.mobile-search-panel').exists()).toBe(false);

    store.uiStore.searchQuery = '   ';
    wrapper.vm.performSearch();
    expect(store.selectionStore.setSelectedSearch).toHaveBeenCalledTimes(2);

    wrapper.vm.toggleSearch();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    window.dispatchEvent(new Event('resize'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.mobile-search-panel').exists()).toBe(true);
    wrapper.unmount();
    expect(store.uiStore.setMobileSearchOpen).toHaveBeenLastCalledWith(false);
  });

  it('forwards mobile navigation and computes safe counts and labels', async () => {
    const store = createStore();
    const wrapper = mountToolbar(MobileToolbar, store);

    await wrapper.get('.mobile-settings-button').trigger('click');
    expect(wrapper.vm.getCategoryCount({ unreadCount: 4 })).toBe(4);
    wrapper.vm.setGrouping('none');
    wrapper.vm.setGrouping('topic');
    window.dispatchEvent(new Event('rssmonster:focus-search'));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('mobile')).toEqual([['mobile']]);
    expect(store.selectionStore.setGrouping).toHaveBeenCalledOnce();
    expect(store.selectionStore.setGrouping).toHaveBeenCalledWith('topic');
    expect(wrapper.find('.mobile-search-panel').exists()).toBe(true);
    expect(wrapper.vm.getStatusCount()).toBe(12);
    expect(wrapper.vm.getCategoryCount({})).toBe(0);
    expect(wrapper.vm.capitalize('briefing')).toBe('Briefing');
    expect(wrapper.vm.capitalize(null)).toBe('');
  });
});

describe('mobile options menu actions', () => {
  it('forwards category, view, refresh, feed, chat, and close actions', async () => {
    const store = createStore();
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
    const wrapper = mount(MobileMenuOverlay, {
      props: { mobile: true },
      global: {
        plugins: [store.pinia]
      }
    });

    expect(document.body.classList.contains('mobile-options-open')).toBe(true);
    await wrapper.get('.options-row.category').trigger('click');
    await wrapper.findAll('.options-view-card')[3].trigger('click');
    await wrapper.get('.options-action-button--refresh').trigger('click');
    await wrapper.get('.options-action-button--add').trigger('click');
    await wrapper.get('#chat-options-heading').element.closest('section').querySelector('button').click();
    await wrapper.get('.mobile-close-button').trigger('click');
    await vi.advanceTimersByTimeAsync(150);

    expect(store.selectionStore.selectCategory).toHaveBeenCalledWith('%');
    expect(store.selectionStore.setViewMode).toHaveBeenCalledWith('minimal');
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('NewFeed');
    expect(store.uiStore.setChatAssistantOpen).toHaveBeenCalledWith(true);
    expect(wrapper.emitted('refresh')).toHaveLength(1);
    expect(wrapper.emitted('mobile')).toHaveLength(4);

    await wrapper.setProps({ mobile: false });
    expect(document.body.classList.contains('mobile-options-open')).toBe(false);
  });

  it('reports unsupported and failed notification permission requests', async () => {
    const store = createStore();
    const wrapper = mount(MobileMenuOverlay, {
      props: { mobile: true },
      global: {
        plugins: [store.pinia]
      }
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Notifications unavailable');
    expect(wrapper.vm.notificationPermission).toBe('unsupported');

    const error = new Error('browser failure');
    pushMocks.getState.mockResolvedValue({
      available: true,
      permission: 'default',
      publicKey: 'test-public-key',
      reason: null,
      subscribed: false
    });
    pushMocks.subscribe.mockRejectedValueOnce(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await wrapper.vm.syncNotificationPermission();
    await wrapper.vm.subscribeNotifications();

    expect(pushMocks.subscribe).toHaveBeenCalledWith('test-public-key');
    expect(wrapper.text()).toContain('Could not request notification permission');
    expect(console.error).toHaveBeenCalledWith(
      'Error requesting browser notification permission:',
      error
    );
  });
});

describe('sidebar navigation helpers', () => {
  it('covers selection, count, and filtering behavior', () => {
    const store = createStore();
    const wrapper = mountSidebar(store);

    expect(wrapper.vm.topTagsDisplay).toHaveLength(5);
    expect(wrapper.vm.visibleStatusFilters).toHaveLength(6);
    expect(wrapper.vm.getStatusCount('unread')).toBe(12);
    expect(wrapper.vm.getItemStatusCount({ unreadCount: 7 })).toBe(7);
    expect(wrapper.vm.getItemStatusCount({})).toBeNull();

    wrapper.vm.loadType('refresh');
    wrapper.vm.loadType('unread');
    store.selectionStore.currentSelection.smartFolderId = 20;
    wrapper.vm.loadType('unread');
    wrapper.vm.loadType('read');
    wrapper.vm.loadCategory({ id: 10 });
    wrapper.vm.loadFeed({ id: 11, categoryId: 10 });
    wrapper.vm.loadAll();
    wrapper.vm.selectTag('one');
    store.selectionStore.currentSelection.tag = 'one';
    wrapper.vm.selectTag('one');
    wrapper.vm.selectSmartFolder({ id: 20 });
    wrapper.vm.selectSmartFolder({ id: 21 });

    expect(wrapper.emitted('forceReload')).toHaveLength(1);
    expect(store.selectionStore.setSelectedStatus).toHaveBeenCalledTimes(2);
    expect(store.selectionStore.selectCategory).toHaveBeenNthCalledWith(1, 10);
    expect(store.selectionStore.selectCategory).toHaveBeenNthCalledWith(2, '%');
    expect(store.selectionStore.selectFeed).toHaveBeenCalledWith(11, 10);
    expect(store.selectionStore.setTag).toHaveBeenNthCalledWith(1, 'one');
    expect(store.selectionStore.setTag).toHaveBeenNthCalledWith(2, '');
    expect(store.selectionStore.setSmartFolder).toHaveBeenCalledWith({ id: 21 });

  });

  it('marks selections read through the sidebar action', async () => {
    const store = createStore();
    const wrapper = mountSidebar(store);
    markAllAsRead.mockResolvedValue({});

    await wrapper.vm.markAsRead({ status: 'unread' });
    expect(markAllAsRead).toHaveBeenCalledWith({ status: 'unread' });
    expect(wrapper.emitted('forceReload')).toHaveLength(1);
    expect(wrapper.vm.markingAsRead).toBe(false);

  });

  it('reports read and category-order failures without corrupting local state', async () => {
    const store = createStore();
    const wrapper = mountSidebar(store);
    const readError = new Error('read failed');
    const orderError = new Error('order failed');
    markAllAsRead.mockRejectedValue(readError);
    updateCategoryOrder.mockRejectedValue(orderError);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await wrapper.vm.markAsRead({ status: 'unread' });
    wrapper.vm.updateSortOrder();
    await flushPromises();

    expect(wrapper.vm.markingAsRead).toBe(false);
    expect(updateCategoryOrder).toHaveBeenCalledWith([10]);
    expect(console.error).toHaveBeenCalledWith(
      'Error marking the current selection as read:',
      readError
    );
    expect(console.error).toHaveBeenCalledWith('Error saving category order:', orderError);
  });
});
