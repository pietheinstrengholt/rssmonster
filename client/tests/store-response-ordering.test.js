import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../src/store/data.js';
import {
  fetchOverviewCounts,
  fetchOverviewLite
} from '../src/api/manager';
import {
  fetchSmartFolderCounts,
  fetchSmartFolders
} from '../src/api/smartfolders';

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
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
    const store = useStore();

    await store.fetchOverviewSplit();
    await store.fetchOverviewSplit();

    newerCounts.resolve(overviewCounts(22));
    await flushPromises();
    olderCounts.resolve(overviewCounts(4));
    await flushPromises();

    expect(store.unreadCount).toBe(22);
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
    const store = useStore();

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
  });
});
