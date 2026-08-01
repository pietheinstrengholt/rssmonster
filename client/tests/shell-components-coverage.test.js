import { config, flushPromises, mount, shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopToolbar from '../src/components/shell/DesktopToolbar.vue';
import MobileMenuOverlay from '../src/components/shell/MobileMenuOverlay.vue';
import MobileToolbar from '../src/components/shell/MobileToolbar.vue';
import { saveThemeMode } from '../src/api/settings.js';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';

// This mock prevents the toolbar's lazy Settings import from outliving the test environment.
vi.mock('../src/components/settings/Settings.vue', () => ({
  __esModule: true,
  default: {
    name: 'Settings',
    emits: ['close', 'forceReload'],
    template: '<button class="settings-stub" @click="$emit(\'forceReload\')">Settings</button>'
  }
}));

vi.mock('../src/api/settings.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    saveThemeMode: vi.fn()
  };
});

// This function creates isolated domain stores for toolbar and mobile-menu behavior.
const createStores = ({ AIEnabled = true } = {}) => {
  const pinia = createPinia();
  setActivePinia(pinia);
  config.global.plugins = [pinia];
  const selectionStore = useSelectionStore(pinia);
  const overviewStore = useOverviewStore(pinia);
  const uiStore = useUiStore(pinia);

  selectionStore.$patch({
    currentSelection: {
      ...selectionStore.currentSelection,
      AIEnabled,
      categoryId: '%',
      grouping: 'none',
      smartFolderId: null,
      sort: 'desc',
      status: 'unread',
      viewMode: 'full'
    }
  });
  overviewStore.$patch({
    briefingCount: 8,
    categories: [{
      id: 10,
      name: 'Technology',
      unreadCount: 4
    }],
    clickedCount: 3,
    favoriteCount: 2,
    hotCount: 1,
    readCount: 9,
    smartFolders: [{
      id: 20,
      name: 'Research',
      ArticleCount: 6,
      query: 'tag:research'
    }],
    unreadCount: 12
  });
  uiStore.$patch({
    chatAssistantOpen: false,
    searchQuery: '',
    themeMode: 'system'
  });

  return { overviewStore, pinia, selectionStore, uiStore };
};

// This function mounts the desktop toolbar against the split Pinia store contract.
const mountDesktopToolbar = () => shallowMount(DesktopToolbar, {
  global: {
    stubs: {
      Settings: {
        name: 'Settings',
        emits: ['close', 'forceReload'],
        template: '<button class="settings-stub" @click="$emit(\'forceReload\')">Settings</button>'
      }
    }
  }
});

// This function mounts the mobile toolbar against the split Pinia store contract.
const mountMobileToolbar = () => mount(MobileToolbar, {
  global: {}
});

// This function mounts the mobile menu against the split Pinia store contract.
const mountMobileMenu = (mobile = true) => mount(MobileMenuOverlay, {
  props: { mobile },
  global: {}
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

afterEach(() => {
  document.body.classList.remove('mobile-options-open');
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DesktopToolbar behavior coverage', () => {
  it('validates debounced searches and responds to compact-search lifecycle events', async () => {
    vi.useFakeTimers();
    const stores = createStores();
    const selectSearch = vi.spyOn(stores.selectionStore, 'setSelectedSearch')
      .mockImplementation(() => {});
    const setSearchQuery = vi.spyOn(stores.uiStore, 'setSearchQuery');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600, writable: true });
    const wrapper = mountDesktopToolbar();
    const input = wrapper.get('.toolbar-search-input');

    expect(input.attributes('placeholder')).toContain('Search for words');

    window.innerWidth = 1200;
    window.dispatchEvent(new Event('resize'));
    await wrapper.vm.$nextTick();
    expect(input.attributes('placeholder')).toBe('Search');

    await wrapper.get('.toolbar-search-button').trigger('click');
    expect(wrapper.get('.toolbar-search').classes()).toContain('toolbar-search-open');

    await input.setValue('titel:ai');
    await vi.advanceTimersByTimeAsync(300);
    expect(setSearchQuery).toHaveBeenCalledWith('titel:ai');
    expect(selectSearch).not.toHaveBeenCalled();
    expect(wrapper.get('.toolbar-search').classes()).toContain('toolbar-search-invalid');

    await input.setValue('tag:ai');
    await vi.advanceTimersByTimeAsync(300);
    expect(selectSearch).toHaveBeenCalledWith('tag:ai');

    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.vm.isCompactSearchOpen).toBe(false);

    window.dispatchEvent(new Event('rssmonster:focus-search'));
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isCompactSearchOpen).toBe(true);

    await wrapper.get('.toolbar-search-button').trigger('click');
    expect(wrapper.vm.isCompactSearchOpen).toBe(false);
    wrapper.unmount();
  });

  it('routes every dropdown type and leaves an unchanged grouping alone', () => {
    const stores = createStores();
    const setStatus = vi.spyOn(stores.selectionStore, 'setSelectedStatus').mockImplementation(() => {});
    const setViewMode = vi.spyOn(stores.selectionStore, 'setViewMode').mockImplementation(() => {});
    const setSort = vi.spyOn(stores.selectionStore, 'setSelectedSort').mockImplementation(() => {});
    const setGrouping = vi.spyOn(stores.selectionStore, 'setGrouping').mockImplementation(() => {});
    const wrapper = mountDesktopToolbar();

    wrapper.vm.dropdownOptionClicked('status', 'read');
    wrapper.vm.dropdownOptionClicked('viewMode', 'minimal');
    wrapper.vm.dropdownOptionClicked('sort', 'asc');
    wrapper.vm.dropdownOptionClicked('grouping', 'none');
    wrapper.vm.dropdownOptionClicked('grouping', 'event');
    wrapper.vm.dropdownOptionClicked('unknown', 'ignored');

    expect(setStatus).toHaveBeenCalledWith('read');
    expect(setViewMode).toHaveBeenCalledWith('minimal');
    expect(setSort).toHaveBeenCalledWith('asc');
    expect(setGrouping).toHaveBeenCalledOnce();
    expect(setGrouping).toHaveBeenCalledWith('event');
  });

  it('exposes fallback dropdown labels and toggles chat and child reload events', async () => {
    const stores = createStores();
    stores.selectionStore.currentSelection.status = 'archived';
    stores.selectionStore.currentSelection.viewMode = 'compact';
    stores.selectionStore.currentSelection.sort = 'custom';
    stores.selectionStore.currentSelection.grouping = 'custom';
    const setSearchQuery = vi.spyOn(stores.uiStore, 'setSearchQuery');
    const setChatOpen = vi.spyOn(stores.uiStore, 'setChatAssistantOpen');
    const wrapper = mountDesktopToolbar();

    const dropdowns = wrapper.vm.toolbarDropdowns;
    expect(dropdowns.find(item => item.type === 'status').selectedLabel).toBe('Archived');
    expect(dropdowns.find(item => item.type === 'viewMode').selectedLabel).toBe('Compact');
    expect(dropdowns.find(item => item.type === 'sort').selectedLabel).toBe('');
    expect(dropdowns.find(item => item.type === 'grouping').selectedLabel).toBe('None');

    await wrapper.get('.toolbar-chat-button').trigger('click');
    expect(setSearchQuery).toHaveBeenCalledWith(null);
    expect(setChatOpen).toHaveBeenCalledWith(true);

    await wrapper.get('.toolbar-settings-button').trigger('click');
    await flushPromises();
    await wrapper.get('.settings-stub').trigger('click');
    expect(wrapper.emitted('forceReload')).toHaveLength(1);
  });

  it('persists a theme and restores the previous mode when saving fails', async () => {
    const stores = createStores();
    const wrapper = mountDesktopToolbar();

    saveThemeMode.mockResolvedValueOnce({});
    await wrapper.vm.selectThemeMode('dark');
    expect(wrapper.vm.selectedThemeMode).toBe('dark');
    expect(stores.uiStore.themeMode).toBe('dark');

    const error = new Error('settings unavailable');
    saveThemeMode.mockRejectedValueOnce(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await wrapper.vm.selectThemeMode('light');

    expect(wrapper.vm.selectedThemeMode).toBe('dark');
    expect(stores.uiStore.themeMode).toBe('dark');
    expect(console.error).toHaveBeenCalledWith('Error saving theme mode:', error);
  });

  it('syncs a non-empty theme preference from the UI store watcher', async () => {
    const stores = createStores();
    const wrapper = mountDesktopToolbar();

    stores.uiStore.themeMode = 'light';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.selectedThemeMode).toBe('light');

    stores.uiStore.themeMode = '';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.selectedThemeMode).toBe('light');
  });
});

describe('MobileToolbar behavior coverage', () => {
  it('opens, applies, closes, and responsively dismisses mobile search', async () => {
    const stores = createStores();
    const selectSearch = vi.spyOn(stores.selectionStore, 'setSelectedSearch')
      .mockImplementation(() => {});
    const setMobileSearchOpen = vi.spyOn(stores.uiStore, 'setMobileSearchOpen');
    const wrapper = mountMobileToolbar();

    await wrapper.get('.mobile-search-toggle').trigger('click');
    expect(wrapper.find('.mobile-search-panel').exists()).toBe(true);
    expect(setMobileSearchOpen).toHaveBeenLastCalledWith(true);

    const input = wrapper.get('.mobile-search-input');
    await input.setValue('tag:vue');
    expect(selectSearch).toHaveBeenCalledWith('tag:vue');
    await input.trigger('keyup', { key: 'Enter' });
    expect(wrapper.find('.mobile-search-panel').exists()).toBe(false);
    expect(setMobileSearchOpen).toHaveBeenLastCalledWith(false);

    stores.uiStore.searchQuery = '   ';
    wrapper.vm.performSearch();
    expect(wrapper.vm.showSearch).toBe(false);

    window.dispatchEvent(new Event('rssmonster:focus-search'));
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.showSearch).toBe(true);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 700, writable: true });
    window.dispatchEvent(new Event('resize'));
    expect(wrapper.vm.showSearch).toBe(true);
    window.innerWidth = 767;
    window.dispatchEvent(new Event('resize'));
    expect(wrapper.vm.showSearch).toBe(false);
    wrapper.unmount();
  });

  it('routes grouping, sorting, menu events, and count fallbacks', async () => {
    const stores = createStores();
    const setGrouping = vi.spyOn(stores.selectionStore, 'setGrouping').mockImplementation(() => {});
    const setSort = vi.spyOn(stores.selectionStore, 'setSelectedSort').mockImplementation(() => {});
    const wrapper = mountMobileToolbar();

    wrapper.vm.setGrouping('none');
    wrapper.vm.setGrouping('topic');
    wrapper.vm.sortClicked('trust');
    wrapper.vm.emitClickEvent('mobile', 'mobile');

    expect(setGrouping).toHaveBeenCalledOnce();
    expect(setGrouping).toHaveBeenCalledWith('topic');
    expect(setSort).toHaveBeenCalledWith('trust');
    expect(wrapper.emitted('mobile')).toEqual([['mobile']]);
    expect(wrapper.vm.getCategoryCount({})).toBe(0);
    expect(wrapper.vm.capitalize(42)).toBe('');

    stores.selectionStore.currentSelection.status = 'unknown';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.getStatusCount()).toBe(0);
  });
});

describe('MobileMenuOverlay behavior coverage', () => {
  it('syncs body state and routes menu actions before delayed close events', async () => {
    vi.useFakeTimers();
    const stores = createStores();
    const setShowModal = vi.spyOn(stores.uiStore, 'setShowModal');
    const selectCategory = vi.spyOn(stores.selectionStore, 'selectCategory').mockImplementation(() => {});
    const setViewMode = vi.spyOn(stores.selectionStore, 'setViewMode').mockImplementation(() => {});
    const setChatOpen = vi.spyOn(stores.uiStore, 'setChatAssistantOpen');
    const wrapper = mountMobileMenu(false);

    expect(document.body.classList.contains('mobile-options-open')).toBe(false);
    await wrapper.setProps({ mobile: true });
    expect(document.body.classList.contains('mobile-options-open')).toBe(true);
    expect(wrapper.vm.notificationPermission).toBe('unsupported');

    wrapper.vm.showNewFeed();
    wrapper.vm.refreshFeeds();
    wrapper.vm.chatAssistant();
    wrapper.vm.selectCategory(10);
    wrapper.vm.selectViewMode('minimal');

    expect(setShowModal).toHaveBeenCalledWith('NewFeed');
    expect(setChatOpen).toHaveBeenCalledWith(true);
    expect(selectCategory).toHaveBeenCalledWith(10);
    expect(setViewMode).toHaveBeenCalledWith('minimal');
    expect(wrapper.emitted('refresh')).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(150);
    expect(wrapper.emitted('mobile')).toHaveLength(4);
    wrapper.unmount();
    expect(document.body.classList.contains('mobile-options-open')).toBe(false);
  });

  it('reports denied and failed notification requests without leaving a pending state', async () => {
    createStores();
    let permission = 'default';
    const requestPermission = vi.fn()
      .mockImplementationOnce(async () => {
        permission = 'denied';
        return permission;
      })
      .mockRejectedValueOnce(new Error('browser failure'));
    vi.stubGlobal('Notification', {
      get permission() {
        return permission;
      },
      requestPermission
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mountMobileMenu();

    await wrapper.vm.subscribeNotifications();
    expect(wrapper.vm.notificationMessage).toContain('browser settings');
    expect(wrapper.vm.notificationRequestPending).toBe(false);

    permission = 'default';
    await wrapper.vm.subscribeNotifications();
    expect(wrapper.vm.notificationMessage).toContain('Could not request');
    expect(wrapper.vm.notificationRequestPending).toBe(false);
    expect(console.error).toHaveBeenCalledOnce();

    permission = 'granted';
    await wrapper.vm.subscribeNotifications();
    expect(requestPermission).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.notificationButtonLabel).toBe('Notifications enabled');
  });
});
