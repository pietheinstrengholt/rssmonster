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
  it('routes rendered navigation, retry, and management controls through store contracts', async () => {
    const stores = createStores();
    stores.overviewStore.$patch({
      overviewCountsStatus: 'error',
      smartFoldersStatus: 'error',
      topTagsStatus: 'error',
      unreadsSinceLastUpdate: 3
    });
    const refreshOverviewCounts = vi.spyOn(stores.overviewStore, 'refreshOverviewCounts').mockResolvedValue({});
    const fetchSmartFolderCounts = vi.spyOn(stores.overviewStore, 'fetchSmartFolderCounts').mockResolvedValue({});
    const setShowModal = vi.spyOn(stores.uiStore, 'setShowModal').mockImplementation(() => {});
    const refreshFeeds = vi.spyOn(Sidebar.methods, 'refreshFeeds').mockImplementation(() => {});
    const markAsRead = vi.spyOn(Sidebar.methods, 'markAsRead').mockResolvedValue();
    const selectSmartFolder = vi.spyOn(Sidebar.methods, 'selectSmartFolder').mockImplementation(() => {});
    const loadType = vi.spyOn(Sidebar.methods, 'loadType').mockImplementation(() => {});
    const selectTag = vi.spyOn(Sidebar.methods, 'selectTag').mockImplementation(() => {});
    const wrapper = mountSidebar(stores.pinia);

    const actionButtons = wrapper.findAllComponents({ name: 'SidebarActionButton' });
    const selectAction = label => actionButtons.find(button => button.props('label') === label).vm.$emit('select');
    selectAction('Refresh feeds');
    selectAction('Add new feed');
    selectAction('Mark as read');

    const navItems = wrapper.findAllComponents({ name: 'SidebarNavItem' });
    navItems.find(item => item.props('title') === 'Research').vm.$emit('select');
    navItems.find(item => item.props('title') === 'Click to refresh!').vm.$emit('select');
    navItems.find(item => item.props('title') === 'Tag-0').vm.$emit('select');

    for (const retry of wrapper.findAll('.sidebar-resource-error button')) await retry.trigger('click');
    expect(refreshFeeds).toHaveBeenCalledOnce();
    expect(markAsRead).toHaveBeenCalledWith(stores.selectionStore.currentSelection);
    expect(setShowModal).toHaveBeenCalledWith('NewFeed');
    expect(selectSmartFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 20 }));
    expect(loadType).toHaveBeenCalledWith('refresh');
    expect(selectTag).toHaveBeenCalledWith('tag-0');
    expect(refreshOverviewCounts).toHaveBeenCalledOnce();
    expect(stores.overviewStore.fetchSmartFolders).toHaveBeenCalled();
    expect(stores.overviewStore.fetchTopTags).toHaveBeenCalled();

    stores.overviewStore.smartFoldersStatus = 'ready';
    stores.overviewStore.smartFolderCountsStatus = 'error';
    stores.selectionStore.currentSelection.categoryId = 10;
    stores.selectionStore.currentSelection.feedId = '%';
    await wrapper.vm.$nextTick();
    for (const button of wrapper.findAllComponents({ name: 'SidebarActionButton' })) {
      if (['Delete category', 'Edit category'].includes(button.props('label'))) button.vm.$emit('select');
    }
    const smartFolderCountError = wrapper.findAll('.sidebar-resource-error')
      .find(error => error.text().includes('Smart Folder counts'));
    await smartFolderCountError.get('button').trigger('click');
    expect(setShowModal).toHaveBeenCalledWith('DeleteCategory');
    expect(setShowModal).toHaveBeenCalledWith('RenameCategory');
    expect(fetchSmartFolderCounts).toHaveBeenCalledOnce();

    stores.selectionStore.currentSelection.feedId = 11;
    await wrapper.vm.$nextTick();
    for (const button of wrapper.findAllComponents({ name: 'SidebarActionButton' })) {
      if (['Delete feed', 'Edit feed'].includes(button.props('label'))) button.vm.$emit('select');
    }
    expect(setShowModal).toHaveBeenCalledWith('DeleteFeed');
    expect(setShowModal).toHaveBeenCalledWith('UpdateFeed');
  });

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

  it('marks the complete active Smart Folder selection and refreshes its counts', async () => {
    const stores = createStores();
    stores.selectionStore.setSmartFolder({
      id: 20,
      query: 'unread:true title:"Windows 11" sort:recommended limit:50',
      limitCount: 50,
      markAsReadOnScroll: true
    });
    const fetchSmartFolderCounts = vi.spyOn(
      stores.overviewStore,
      'fetchSmartFolderCounts'
    ).mockResolvedValue(true);
    const wrapper = mountSidebar(stores.pinia);
    const selection = { ...stores.selectionStore.currentSelection };
    markAllAsRead.mockResolvedValueOnce({ data: { updatedCount: 2 } });

    await wrapper.vm.markAsRead(selection);

    expect(markAllAsRead).toHaveBeenCalledWith(selection);
    expect(selection).toMatchObject({
      smartFolderId: 20,
      search: 'unread:true title:"Windows 11" sort:recommended limit:50 limit:50'
    });
    expect(stores.selectionStore.effectiveMarkAsReadOnScroll).toBe(true);
    expect(fetchSmartFolderCounts).toHaveBeenCalledOnce();
    expect(wrapper.emitted('forceReload')).toHaveLength(1);
    expect(wrapper.vm.markingAsRead).toBe(false);
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
