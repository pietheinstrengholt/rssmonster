import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/components/sidebar/Sidebar.vue';
import { markAllAsRead } from '../src/api/articles';
import { updateCategoryOrder } from '../src/api/manager';
import { ACTION_ERROR_EVENT } from '../src/services/actionNotifications.js';
import { useAuthStore } from '../src/store/auth.js';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';

vi.mock('../src/api/articles', () => ({
  markAllAsRead: vi.fn()
}));

vi.mock('../src/api/manager', () => ({
  updateCategoryOrder: vi.fn()
}));

// This function creates isolated sidebar stores with representative navigation data.
const createStores = () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const authStore = useAuthStore(pinia);
  const overviewStore = useOverviewStore(pinia);
  const selectionStore = useSelectionStore(pinia);
  const uiStore = useUiStore(pinia);

  selectionStore.$patch({
    currentSelection: {
      ...selectionStore.currentSelection,
      AIEnabled: true,
      categoryId: '%',
      feedId: '%',
      smartFolderId: null,
      status: 'unread',
      tag: null
    }
  });
  overviewStore.$patch({
    categories: [{
      id: 10,
      name: 'Technology',
      unreadCount: 5,
      feeds: [{
        id: 11,
        categoryId: 10,
        feedName: 'Example',
        unreadCount: 3
      }]
    }],
    smartFolders: [{
      id: 20,
      name: 'Research',
      ArticleCount: 2,
      query: 'tag:research'
    }],
    topTags: Array.from({ length: 7 }, (_, index) => ({
      name: `tag-${index}`,
      count: index
    })),
    unreadCount: 5
  });
  vi.spyOn(overviewStore, 'fetchTopTags').mockResolvedValue({});
  vi.spyOn(overviewStore, 'fetchSmartFolders').mockResolvedValue({});

  return { authStore, overviewStore, pinia, selectionStore, uiStore };
};

// This function mounts the sidebar while keeping drag-and-drop at a stable boundary.
const mountSidebar = pinia => mount(Sidebar, {
  global: {
    plugins: [pinia],
    stubs: {
      draggable: {
        props: ['modelValue'],
        template: '<div><slot name="item" v-for="item in modelValue" :key="item.id" :element="item" /></div>'
      }
    }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Sidebar navigation and action coverage', () => {
  it('covers status, navigation, tag, and smart-folder selection branches', () => {
    const stores = createStores();
    const setStatus = vi.spyOn(stores.selectionStore, 'setSelectedStatus').mockImplementation(() => {});
    const setSmartFolder = vi.spyOn(stores.selectionStore, 'setSmartFolder').mockImplementation(() => {});
    const selectCategory = vi.spyOn(stores.selectionStore, 'selectCategory').mockImplementation(() => {});
    const selectFeed = vi.spyOn(stores.selectionStore, 'selectFeed').mockImplementation(() => {});
    const setTag = vi.spyOn(stores.selectionStore, 'setTag').mockImplementation(() => {});
    const wrapper = mountSidebar(stores.pinia);

    expect(wrapper.vm.topTagsDisplay).toHaveLength(5);
    expect(wrapper.vm.getStatusCount('unread')).toBe(5);
    expect(wrapper.vm.getItemStatusCount({})).toBeNull();
    expect(wrapper.vm.getItemStatusCount({ unreadCount: 4 })).toBe(4);

    wrapper.vm.loadType('refresh');
    expect(setSmartFolder).toHaveBeenCalledWith(null);
    expect(wrapper.emitted('forceReload')).toHaveLength(1);

    wrapper.vm.loadType('read');
    expect(setStatus).toHaveBeenCalledWith('read');

    stores.selectionStore.currentSelection.smartFolderId = 20;
    wrapper.vm.loadType('unread');
    expect(setStatus).toHaveBeenCalledWith('unread');

    stores.selectionStore.currentSelection.smartFolderId = null;
    setStatus.mockClear();
    wrapper.vm.loadType('unread');
    expect(setStatus).not.toHaveBeenCalled();

    wrapper.vm.loadCategory({ id: 10 });
    wrapper.vm.loadFeed({ id: 11, categoryId: 10 });
    wrapper.vm.loadAll();
    expect(selectCategory).toHaveBeenNthCalledWith(1, 10);
    expect(selectCategory).toHaveBeenNthCalledWith(2, '%');
    expect(selectFeed).toHaveBeenCalledWith(11, 10);

    wrapper.vm.selectTag('tag-1');
    stores.selectionStore.currentSelection.tag = 'tag-1';
    wrapper.vm.selectTag('tag-1');
    expect(setTag).toHaveBeenNthCalledWith(1, 'tag-1');
    expect(setTag).toHaveBeenNthCalledWith(2, '');

    wrapper.vm.selectSmartFolder({ id: 20 });
    stores.selectionStore.currentSelection.smartFolderId = 20;
    wrapper.vm.selectSmartFolder({ id: 20 });
    expect(setSmartFolder).toHaveBeenCalledTimes(2);
  });

  it('reloads after marking as read and reports a recoverable failure', async () => {
    const stores = createStores();
    const wrapper = mountSidebar(stores.pinia);
    const notifications = [];
    // This handler retains action-error details for assertions.
    const handleNotification = event => notifications.push(event.detail);
    window.addEventListener(ACTION_ERROR_EVENT, handleNotification);

    markAllAsRead.mockResolvedValueOnce({});
    await wrapper.vm.markAsRead(stores.selectionStore.currentSelection);
    expect(wrapper.emitted('forceReload')).toHaveLength(1);
    expect(wrapper.vm.markingAsRead).toBe(false);

    const error = new Error('database detail');
    markAllAsRead.mockRejectedValueOnce(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await wrapper.vm.markAsRead(stores.selectionStore.currentSelection);

    expect(console.error).toHaveBeenCalledWith(
      'Error marking the current selection as read:',
      error
    );
    expect(notifications.at(-1)).toEqual({
      message: 'Could not mark these articles as read. Please try again.'
    });
    window.removeEventListener(ACTION_ERROR_EVENT, handleNotification);
  });

  it('persists category ordering and reports persistence failures', async () => {
    const stores = createStores();
    const applyOrder = vi.spyOn(stores.overviewStore, 'applyCategoryOrder');
    const wrapper = mountSidebar(stores.pinia);

    updateCategoryOrder.mockResolvedValueOnce({ status: 204 });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    wrapper.vm.applyCategoryOrder([...stores.overviewStore.categories]);
    await flushPromises();
    expect(applyOrder).toHaveBeenCalledOnce();
    expect(updateCategoryOrder).toHaveBeenCalledWith([10]);

    const error = new Error('save failed');
    updateCategoryOrder.mockRejectedValueOnce(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    wrapper.vm.updateSortOrder();
    await flushPromises();
    expect(console.error).toHaveBeenCalledWith('Error saving category order:', error);
  });
});
