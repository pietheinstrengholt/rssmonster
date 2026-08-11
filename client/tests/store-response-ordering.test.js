import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import {
  fetchOverviewCounts,
  fetchOverviewLite
} from '../src/api/manager';
import {
  fetchSmartFolderCounts,
  fetchSmartFolders
} from '../src/api/smartfolders';
import { fetchTopTags } from '../src/api/tags';

vi.mock('../src/api/manager', () => ({
  fetchOverview: vi.fn(),
  fetchOverviewCounts: vi.fn(),
  fetchOverviewLite: vi.fn()
}));

vi.mock('../src/api/settings', () => ({
  fetchSettings: vi.fn()
}));

vi.mock('../src/api/smartfolders', () => ({
  fetchSmartFolderCounts: vi.fn(),
  fetchSmartFolders: vi.fn()
}));

vi.mock('../src/api/tags', () => ({
  fetchTopTags: vi.fn()
}));

// This function creates a promise whose completion order is controlled by the test.
const deferred = () => {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
};

// This function creates an overview count response with a distinctive unread count.
const overviewCounts = unreadCount => ({
  data: {
    briefingCount: 0,
    unreadCount,
    readCount: 0,
    favoriteCount: 0,
    hotCount: 0,
    clickedCount: 0,
    categories: []
  }
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('store response ordering', () => {
  it('ignores an older overview count response that resolves last', async () => {
    const olderCounts = deferred();
    const newerCounts = deferred();
    fetchOverviewLite.mockResolvedValue({ data: { categories: [] } });
    fetchOverviewCounts
      .mockReturnValueOnce(olderCounts.promise)
      .mockReturnValueOnce(newerCounts.promise);
    const store = useOverviewStore();

    await store.fetchOverviewSplit();
    await store.fetchOverviewSplit();

    newerCounts.resolve(overviewCounts(22));
    await flushPromises();
    olderCounts.resolve(overviewCounts(4));
    await flushPromises();

    expect(store.unreadCount).toBe(22);
    expect(store.overviewCountsStatus).toBe('success');
    expect(store.overviewCountsError).toBeNull();
  });

  it('ignores older smart-folder counts after a newer refresh', async () => {
    const olderCounts = deferred();
    const newerCounts = deferred();
    fetchSmartFolders.mockResolvedValue({
      data: {
        smartFolders: [{ id: 7, name: 'Research', query: 'research' }]
      }
    });
    fetchSmartFolderCounts
      .mockReturnValueOnce(olderCounts.promise)
      .mockReturnValueOnce(newerCounts.promise);
    const store = useOverviewStore();

    await store.fetchSmartFolders();
    await store.fetchSmartFolders();

    newerCounts.resolve({
      data: { smartFolders: [{ id: 7, ArticleCount: 12 }] }
    });
    await flushPromises();
    olderCounts.resolve({
      data: { smartFolders: [{ id: 7, ArticleCount: 2 }] }
    });
    await flushPromises();

    expect(store.smartFolders[0].ArticleCount).toBe(12);
    expect(store.smartFolderCountsStatus).toBe('success');
    expect(store.smartFolderCountsError).toBeNull();
  });

  // Verifies grouping transitions refresh tags and retain only the newest grouping response.
  it('refreshes Top Tags for grouping changes and ignores the older grouping response', async () => {
    const eventTags = deferred();
    const topicTags = deferred();
    fetchTopTags
      .mockReturnValueOnce(eventTags.promise)
      .mockReturnValueOnce(topicTags.promise);
    const store = useOverviewStore();
    const selectionStore = useSelectionStore();
    vi.spyOn(store, 'fetchOverviewSplit').mockResolvedValue(true);

    selectionStore.setGrouping('event');
    selectionStore.setGrouping('topic');
    topicTags.resolve({ data: { tags: [{ name: 'topic-tag', count: 4 }] } });
    await flushPromises();
    eventTags.resolve({ data: { tags: [{ name: 'event-tag', count: 9 }] } });
    await flushPromises();

    expect(fetchTopTags).toHaveBeenNthCalledWith(1, {
      grouping: 'event',
      includeDevelopingEvents: false,
      status: 'unread'
    });
    expect(fetchTopTags).toHaveBeenNthCalledWith(2, {
      grouping: 'topic',
      includeDevelopingEvents: false,
      status: 'unread'
    });
    expect(store.topTags).toEqual([{ name: 'topic-tag', count: 4 }]);
    expect(store.topTagsStatus).toBe('success');
  });

  // Verifies direct count refreshes ignore an obsolete success that resolves last.
  it('keeps the newest direct overview-count success', async () => {
    const olderCounts = deferred();
    const newerCounts = deferred();
    fetchOverviewCounts
      .mockReturnValueOnce(olderCounts.promise)
      .mockReturnValueOnce(newerCounts.promise);
    const store = useOverviewStore();

    const olderRequest = store.fetchOverviewCounts();
    const newerRequest = store.fetchOverviewCounts();
    newerCounts.resolve(overviewCounts(18));
    await newerRequest;
    olderCounts.resolve(overviewCounts(3));
    await olderRequest;

    expect(store.unreadCount).toBe(18);
    expect(store.overviewCountsStatus).toBe('success');
    expect(store.overviewCountsError).toBeNull();
  });

  // Verifies direct count refreshes ignore an obsolete failure that rejects last.
  it('keeps the newest direct overview-count resource state after an old failure', async () => {
    const olderCounts = deferred();
    fetchOverviewCounts
      .mockReturnValueOnce(olderCounts.promise)
      .mockResolvedValueOnce(overviewCounts(21));
    const store = useOverviewStore();

    const olderRequest = store.fetchOverviewCounts();
    await store.fetchOverviewCounts();
    olderCounts.reject(new Error('obsolete count failure'));
    await olderRequest;

    expect(store.unreadCount).toBe(21);
    expect(store.overviewCountsStatus).toBe('success');
    expect(store.overviewCountsError).toBeNull();
  });
});
