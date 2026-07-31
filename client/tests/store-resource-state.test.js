import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSettings } from '../src/api/settings';
import {
  fetchOverviewCounts,
  fetchOverviewLite
} from '../src/api/manager';
import {
  fetchSmartFolderCounts,
  fetchSmartFolders
} from '../src/api/smartfolders';
import { fetchTopTags } from '../src/api/tags';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';

vi.mock('../src/api/settings', () => ({
  fetchSettings: vi.fn()
}));

vi.mock('../src/api/manager', () => ({
  fetchOverview: vi.fn(),
  fetchOverviewCounts: vi.fn(),
  fetchOverviewLite: vi.fn()
}));

vi.mock('../src/api/smartfolders', () => ({
  fetchSmartFolderCounts: vi.fn(),
  fetchSmartFolders: vi.fn()
}));

vi.mock('../src/api/tags', () => ({
  fetchTopTags: vi.fn()
}));

// This function creates a request whose resolution order is controlled by the test.
const deferred = () => {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

// This function builds a complete overview-count response for resource tests.
const countResponse = unreadCount => ({
  data: {
    briefingCount: 0,
    unreadCount,
    readCount: 0,
    favoriteCount: 0,
    hotCount: 0,
    clickedCount: 0,
    categories: [{ id: 1, unreadCount, feeds: [] }]
  }
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('focused store resource state', () => {
  // Verifies settings failures preserve selection and retries clear the owned error.
  it('records settings failure and retry success', async () => {
    const store = useSelectionStore();
    fetchSettings.mockRejectedValueOnce(new Error('settings offline'));

    await expect(store.fetchSettings()).rejects.toThrow('settings offline');
    expect(store.settingsStatus).toBe('error');
    expect(store.settingsError).toMatchObject({ message: 'settings offline' });
    expect(store.currentSelection.viewMode).toBe('full');

    fetchSettings.mockResolvedValueOnce({ data: { viewMode: 'minimal' } });
    const retry = store.fetchSettings();
    expect(store.settingsStatus).toBe('loading');
    expect(store.settingsError).toBeNull();
    await retry;

    expect(store.settingsStatus).toBe('success');
    expect(store.settingsError).toBeNull();
    expect(store.currentSelection.viewMode).toBe('minimal');
  });

  // Verifies obsolete settings failures cannot replace newer successful state.
  it('ignores an out-of-order settings failure', async () => {
    const older = deferred();
    fetchSettings
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ data: { grouping: 'topic' } });
    const store = useSelectionStore();

    const olderRequest = store.fetchSettings();
    await store.fetchSettings();
    older.reject(new Error('obsolete settings failure'));
    await expect(olderRequest).rejects.toThrow('obsolete settings failure');

    expect(store.settingsStatus).toBe('success');
    expect(store.settingsError).toBeNull();
    expect(store.currentSelection.grouping).toBe('topic');
  });

  // Verifies overview structure retries retain cached categories and reject stale failures.
  it('tracks overview structure failure, retry, and stale completion', async () => {
    const older = deferred();
    fetchOverviewLite
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ data: { categories: [{ id: 2, feeds: [] }] } });
    fetchOverviewCounts.mockReturnValue(new Promise(() => {}));
    const store = useOverviewStore();
    store.categories = [{ id: 1, feeds: [] }];

    const olderRequest = store.fetchOverviewSplit();
    await store.fetchOverviewSplit();
    older.reject(new Error('obsolete overview failure'));
    await expect(olderRequest).rejects.toThrow('obsolete overview failure');

    expect(store.overviewStructureStatus).toBe('success');
    expect(store.overviewStructureError).toBeNull();
    expect(store.categories.map(category => category.id)).toEqual([2]);

    fetchOverviewLite.mockRejectedValueOnce(new Error('current overview failure'));
    await expect(store.fetchOverviewSplit()).rejects.toThrow('current overview failure');
    expect(store.overviewStructureStatus).toBe('error');
    expect(store.categories.map(category => category.id)).toEqual([2]);
  });

  // Verifies count refresh failures preserve cached counters and retries clear errors.
  it('tracks overview count failure and retry without clearing cached data', async () => {
    const store = useOverviewStore();
    store.$patch({
      unreadCount: 9,
      categories: [{ id: 1, unreadCount: 9, feeds: [] }]
    });
    fetchOverviewCounts.mockRejectedValueOnce(new Error('counts offline'));

    await store.fetchOverviewCounts();
    expect(store.overviewCountsStatus).toBe('error');
    expect(store.overviewCountsError).toMatchObject({ message: 'counts offline' });
    expect(store.unreadCount).toBe(9);
    expect(store.categories[0].unreadCount).toBe(9);

    fetchOverviewCounts.mockResolvedValueOnce(countResponse(12));
    const retry = store.fetchOverviewCounts();
    expect(store.overviewCountsStatus).toBe('loading');
    expect(store.overviewCountsError).toBeNull();
    expect(store.unreadCount).toBe(9);
    await retry;

    expect(store.overviewCountsStatus).toBe('success');
    expect(store.unreadCount).toBe(12);
  });

  // Verifies stale count failures cannot replace a newer successful count refresh.
  it('ignores an out-of-order overview count failure', async () => {
    const older = deferred();
    fetchOverviewCounts
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(countResponse(14));
    const store = useOverviewStore();

    const olderRequest = store.fetchOverviewCounts();
    await store.fetchOverviewCounts();
    older.reject(new Error('obsolete counts failure'));
    await olderRequest;

    expect(store.overviewCountsStatus).toBe('success');
    expect(store.overviewCountsError).toBeNull();
    expect(store.unreadCount).toBe(14);
  });

  // Verifies Smart Folder structure and count failures retain cached folders and can retry.
  it('tracks Smart Folder structure and count retries independently', async () => {
    const store = useOverviewStore();
    store.smartFolders = [{ id: 1, name: 'Cached', ArticleCount: 7 }];
    fetchSmartFolders.mockRejectedValueOnce(new Error('folders offline'));

    await expect(store.fetchSmartFolders()).rejects.toThrow('folders offline');
    expect(store.smartFoldersStatus).toBe('error');
    expect(store.smartFolders[0].ArticleCount).toBe(7);

    fetchSmartFolders.mockResolvedValueOnce({
      data: { smartFolders: [{ id: 1, name: 'Cached', ArticleCount: 7 }] }
    });
    fetchSmartFolderCounts.mockRejectedValueOnce(new Error('folder counts offline'));
    await store.fetchSmartFolders();
    await flushPromises();

    expect(store.smartFoldersStatus).toBe('success');
    expect(store.smartFolderCountsStatus).toBe('error');
    expect(store.smartFolders[0].ArticleCount).toBe(7);

    fetchSmartFolderCounts.mockResolvedValueOnce({
      data: { smartFolders: [{ id: 1, ArticleCount: 11 }] }
    });
    await store.fetchSmartFolderCounts();
    expect(store.smartFolderCountsStatus).toBe('success');
    expect(store.smartFolderCountsError).toBeNull();
    expect(store.smartFolders[0].ArticleCount).toBe(11);
  });

  // Verifies obsolete Smart Folder structure failures cannot replace newer folders or status.
  it('ignores an out-of-order Smart Folder structure failure', async () => {
    const older = deferred();
    fetchSmartFolders
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({
        data: { smartFolders: [{ id: 2, name: 'Current' }] }
      });
    fetchSmartFolderCounts.mockReturnValue(new Promise(() => {}));
    const store = useOverviewStore();

    const olderRequest = store.fetchSmartFolders();
    await store.fetchSmartFolders();
    older.reject(new Error('obsolete folder failure'));
    await expect(olderRequest).rejects.toThrow('obsolete folder failure');

    expect(store.smartFoldersStatus).toBe('success');
    expect(store.smartFoldersError).toBeNull();
    expect(store.smartFolders).toEqual([{
      id: 2,
      name: 'Current',
      ArticleCount: 0
    }]);
  });

  // Verifies Top Tags retries and stale failures preserve the latest successful tags.
  it('tracks Top Tags failure, retry, and out-of-order completion', async () => {
    const older = deferred();
    fetchTopTags
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ data: { tags: [{ name: 'current', count: 3 }] } });
    const store = useOverviewStore();

    const olderRequest = store.fetchTopTags();
    await store.fetchTopTags();
    older.reject(new Error('obsolete tags failure'));
    await olderRequest;

    expect(store.topTagsStatus).toBe('success');
    expect(store.topTagsError).toBeNull();
    expect(store.topTags).toEqual([{ name: 'current', count: 3 }]);

    fetchTopTags.mockRejectedValueOnce(new Error('tags offline'));
    await store.fetchTopTags();
    expect(store.topTagsStatus).toBe('error');
    expect(store.topTags).toEqual([{ name: 'current', count: 3 }]);

    fetchTopTags.mockResolvedValueOnce({ data: { tags: [] } });
    await store.fetchTopTags();
    expect(store.topTagsStatus).toBe('success');
    expect(store.topTagsError).toBeNull();
  });
});
