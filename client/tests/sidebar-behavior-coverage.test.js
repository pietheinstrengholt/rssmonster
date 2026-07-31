import { config, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/components/sidebar/Sidebar.vue';
import { markAllAsRead } from '../src/api/articles';
import { triggerCrawl } from '../src/api/crawl';
import { openFeedRefreshEvents, startFeedRefresh } from '../src/api/feeds';
import { updateCategoryOrder } from '../src/api/manager';
import { ACTION_ERROR_EVENT } from '../src/services/actionNotifications.js';
import { useAuthStore } from '../src/store/auth.js';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';

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

vi.mock('../src/api/manager', () => ({
  updateCategoryOrder: vi.fn()
}));

// This function creates isolated sidebar stores with representative navigation data.
const createStores = () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  config.global.plugins = [pinia];
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
const mountSidebar = () => mount(Sidebar, {
  global: {
    stubs: {
      draggable: {
        props: ['modelValue'],
        template: '<div><slot name="item" v-for="item in modelValue" :key="item.id" :element="item" /></div>'
      }
    }
  }
});

// This function creates a controllable EventSource-compatible refresh stream.
const createEventSource = () => {
  const handlers = {};
  const eventSource = {
    addEventListener: vi.fn((type, handler) => {
      handlers[type] = handler;
    }),
    close: vi.fn(),
    removeEventListener: vi.fn(),
    onerror: null,
    onopen: null
  };
  return { eventSource, handlers };
};

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
    const wrapper = mountSidebar();

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
    const wrapper = mountSidebar();
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
    const wrapper = mountSidebar();

    updateCategoryOrder.mockResolvedValueOnce({ status: 204 });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    wrapper.vm.applyCategoryOrder([...stores.overviewStore.categories]);
    await flushPromises();
    expect(applyOrder).toHaveBeenCalledOnce();
    expect(updateCategoryOrder).toHaveBeenCalledWith([10]);
    expect(console.log).toHaveBeenCalledWith(204);

    const error = new Error('save failed');
    updateCategoryOrder.mockRejectedValueOnce(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    wrapper.vm.updateSortOrder();
    await flushPromises();
    expect(console.error).toHaveBeenCalledWith('Error saving category order:', error);
  });
});

describe('Sidebar refresh stream coverage', () => {
  it('handles every progress event and invalid stream payloads', async () => {
    createStores();
    const { eventSource, handlers } = createEventSource();
    startFeedRefresh.mockResolvedValue({
      data: {
        jobId: 'job-events',
        reused: false
      }
    });
    openFeedRefreshEvents.mockReturnValue(eventSource);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const wrapper = mountSidebar();

    await wrapper.vm.refreshFeeds();
    eventSource.onopen();
    for (const [type, payload] of [
      ['refresh_started', { totalFeeds: 2 }],
      ['feed_started', { feedId: 1 }],
      ['feed_parsed', { entries: 4, feedName: 'Feed A' }],
      ['articles_inserted_updated', { feedId: 1, feedNewArticles: 2, feedUpdatedArticles: 1 }],
      ['feed_error', { feedId: 1 }],
      ['feed_completed', { feedName: 'Feed A' }],
      ['progress', { currentFeed: 1, errors: 1, newArticles: 2, totalFeeds: 2 }]
    ]) {
      handlers[type]({ data: JSON.stringify(payload), type });
    }
    handlers.progress({ data: '{invalid', type: 'progress' });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.refreshProgress.progressPercent).toBe(50);
    expect(wrapper.vm.refreshProgress.currentFeedLabel).toBe('1/2 feeds');
    expect(wrapper.vm.refreshProgress.logs.join(' ')).toContain('Received invalid progress payload');
    expect(console.log).toHaveBeenCalledWith('Invalid SSE payload', expect.any(SyntaxError));

    eventSource.onerror();
    await vi.advanceTimersByTimeAsync(500);
    expect(wrapper.emitted('forceReload')).toBeUndefined();
    expect(wrapper.vm.refreshing).toBe(false);
  });

  it('ignores stale stream callbacks and handles an explicit terminal error', async () => {
    createStores();
    const { eventSource, handlers } = createEventSource();
    openFeedRefreshEvents.mockReturnValue(eventSource);
    const wrapper = mountSidebar();

    wrapper.vm.openRefreshEventStream('job-stale');
    wrapper.vm.closeRefreshEventSource();
    handlers.progress({
      data: JSON.stringify({ processedFeeds: 1, totalFeeds: 1 }),
      type: 'progress'
    });
    eventSource.onopen?.();
    eventSource.onerror?.();
    expect(wrapper.vm.refreshProgress.processedFeeds).toBe(0);

    const nextStream = createEventSource();
    openFeedRefreshEvents.mockReturnValue(nextStream.eventSource);
    wrapper.vm.openRefreshEventStream('job-error');
    nextStream.handlers.error({
      data: JSON.stringify({ message: 'Refresh failed safely.' }),
      type: 'error'
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(wrapper.vm.refreshProgress.logs.join(' ')).toContain('Refresh failed safely');
    expect(wrapper.emitted('forceReload')).toBeUndefined();
  });

  it('uses and dismisses the standard fallback when live startup lacks a job id', async () => {
    createStores();
    startFeedRefresh.mockResolvedValue({ data: {} });
    triggerCrawl.mockResolvedValue({});
    const wrapper = mountSidebar();

    await wrapper.vm.refreshFeeds();
    expect(triggerCrawl).toHaveBeenCalledOnce();
    expect(wrapper.vm.refreshProgress.visible).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    expect(wrapper.vm.refreshProgress.visible).toBe(false);
    expect(wrapper.vm.refreshing).toBe(false);
    expect(wrapper.vm.refreshProgress.logs[0]).toContain('Standard refresh completed');
  });
});
