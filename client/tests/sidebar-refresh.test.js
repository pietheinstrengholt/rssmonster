import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/components/Sidebar.vue';
import { triggerCrawl } from '../src/api/crawl';
import {
  openFeedRefreshEvents,
  startFeedRefresh
} from '../src/api/feeds';
import { ACTION_ERROR_EVENT } from '../src/services/actionNotifications.js';

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

// This function creates the data store contract consumed by the sidebar.
const createDataStore = () => reactive({
  briefingCount: 0,
  categories: [],
  clickedCount: 0,
  currentSelection: {
    AIEnabled: false,
    categoryId: '%',
    feedId: '%',
    smartFolderId: null,
    status: 'unread',
    tag: null
  },
  favoriteCount: 0,
  fetchSmartFolders: vi.fn().mockResolvedValue({}),
  fetchTopTags: vi.fn().mockResolvedValue({}),
  hotCount: 0,
  readCount: 0,
  setSelectedCategoryId: vi.fn(),
  setSelectedFeedId: vi.fn(),
  setSelectedStatus: vi.fn(),
  setShowModal: vi.fn(),
  setSmartFolder: vi.fn(),
  setTag: vi.fn(),
  smartFolders: [],
  topTags: [],
  unreadCount: 2,
  unreadsSinceLastUpdate: 0
});

// This function mounts the sidebar with stable child-component boundaries.
const mountSidebar = () => mount(Sidebar, {
  global: {
    mocks: {
      $store: {
        auth: {
          getToken: 'refresh-token',
          setRole: vi.fn(),
          setToken: vi.fn()
        },
        data: createDataStore()
      }
    },
    stubs: {
      BootstrapIcon: true,
      draggable: {
        template: '<div><slot /></div>'
      }
    }
  }
});

// This function creates an event source whose server events are controlled by the test.
const createEventSource = () => {
  const handlers = {};
  const eventSource = {
    addEventListener: vi.fn((type, handler) => {
      handlers[type] = handler;
    }),
    close: vi.fn(),
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

describe('Sidebar feed refresh', () => {
  it('opens one authenticated progress stream and reloads after completion', async () => {
    const { eventSource, handlers } = createEventSource();
    startFeedRefresh.mockResolvedValue({
      data: {
        jobId: 'job-7',
        reused: true
      }
    });
    openFeedRefreshEvents.mockReturnValue(eventSource);
    const wrapper = mountSidebar();

    await wrapper.vm.refreshFeeds();
    await wrapper.vm.refreshFeeds();

    expect(startFeedRefresh).toHaveBeenCalledOnce();
    expect(openFeedRefreshEvents).toHaveBeenCalledWith('job-7', 'refresh-token');
    expect(wrapper.text()).toContain('Resuming live updates');

    handlers.progress({
      data: JSON.stringify({
        feedName: 'Example feed',
        newArticles: 3,
        processedFeeds: 1,
        totalFeeds: 2
      }),
      type: 'progress'
    });
    handlers.done({
      data: JSON.stringify({
        processedFeeds: 2,
        totalFeeds: 2
      }),
      type: 'done'
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Processed: 2/2');
    expect(eventSource.close).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(500);

    expect(wrapper.emitted('forceReload')).toHaveLength(1);
    expect(wrapper.find('.sidebar-refresh-progress-panel').exists()).toBe(false);
  });

  it('falls back once and reports a safe error when both refresh paths fail', async () => {
    const liveFailure = new Error('live endpoint unavailable');
    const fallbackFailure = new Error('crawler database detail');
    const notifications = [];
    // This function retains recoverable notification details for assertions.
    const handleNotification = event => notifications.push(event.detail);
    window.addEventListener(ACTION_ERROR_EVENT, handleNotification);
    startFeedRefresh.mockRejectedValue(liveFailure);
    triggerCrawl.mockRejectedValue(fallbackFailure);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mountSidebar();

    await wrapper.vm.refreshFeeds();
    await flushPromises();

    expect(triggerCrawl).toHaveBeenCalledOnce();
    expect(notifications).toEqual([{
      message: 'Could not refresh feeds. Please try again.'
    }]);
    expect(wrapper.find('.sidebar-refresh-progress-panel').exists()).toBe(false);
    expect(wrapper.text()).not.toContain(fallbackFailure.message);
    expect(console.error).toHaveBeenCalledWith(
      'Error refreshing feeds after stream fallback:',
      fallbackFailure
    );

    window.removeEventListener(ACTION_ERROR_EVENT, handleNotification);
  });
});
