import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSettings } from '../src/api/settings';
import { fetchTopTags } from '../src/api/tags';
import { useAuthStore } from '../src/store/auth.js';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';

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

// This function creates a request whose completion is controlled by the session-transition test.
const deferred = () => {
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('coordinated Pinia session reset', () => {
  // This test verifies logout clears every user-owned store before an obsolete resource can complete.
  it('resets all focused state and ignores a resource response that resolves after logout', async () => {
    const oldTags = deferred();
    fetchTopTags.mockReturnValueOnce(oldTags.promise);
    const authStore = useAuthStore();
    const selectionStore = useSelectionStore();
    const overviewStore = useOverviewStore();
    const uiStore = useUiStore();

    authStore.setSession({ token: 'old-token', role: 'admin' });
    selectionStore.$patch({
      briefingIncludeOnlyUnreadArticles: true,
      briefingPrioritizeHighTrust: true,
      briefingSelectionPeriod: '24h',
      currentSelection: {
        ...selectionStore.currentSelection,
        categoryId: '4',
        feedId: '8',
        search: 'private query',
        tag: 'private'
      },
      settingsError: { message: 'old settings error' },
      settingsStatus: 'error'
    });
    overviewStore.$patch({
      briefingCount: 1,
      categories: [{ id: 4, feeds: [{ id: 8 }] }],
      clickedCount: 2,
      favoriteCount: 3,
      hotCount: 4,
      overviewCountsError: { message: 'old counts error' },
      overviewCountsStatus: 'error',
      overviewStructureError: { message: 'old overview error' },
      overviewStructureStatus: 'error',
      readCount: 5,
      smartFolderCountsError: { message: 'old folder counts error' },
      smartFolderCountsStatus: 'error',
      smartFolders: [{ id: 6, name: 'Private folder' }],
      smartFoldersError: { message: 'old folders error' },
      smartFoldersStatus: 'error',
      topTags: [{ name: 'private', count: 7 }],
      unreadCount: 8,
      unreadsSinceLastUpdate: 9
    });
    uiStore.$patch({
      chatAssistantOpen: true,
      fatalError: { type: 'offline' },
      mobileSearchOpen: true,
      searchQuery: 'private draft',
      showModal: 'Settings',
      themeMode: 'dark'
    });

    const oldRequest = overviewStore.fetchTopTags();
    const oldRequestIds = {
      overviewCountsRequestId: overviewStore.overviewCountsRequestId,
      overviewStructureRequestId: overviewStore.overviewStructureRequestId,
      settingsRequestId: selectionStore.settingsRequestId,
      smartFolderCountsRequestId: overviewStore.smartFolderCountsRequestId,
      smartFoldersRequestId: overviewStore.smartFoldersRequestId,
      topTagsRequestId: overviewStore.topTagsRequestId
    };
    authStore.clearSession();

    expect(authStore).toMatchObject({ token: null, role: null });
    expect(selectionStore.currentSelection).toMatchObject({
      categoryId: '%',
      feedId: '%',
      search: null,
      status: 'unread',
      tag: null
    });
    expect(selectionStore).toMatchObject({
      briefingIncludeOnlyUnreadArticles: false,
      briefingPrioritizeHighTrust: false,
      briefingSelectionPeriod: '7d',
      settingsError: null,
      settingsStatus: 'idle'
    });
    expect(selectionStore.settingsRequestId).toBeGreaterThan(oldRequestIds.settingsRequestId);
    expect(overviewStore.overviewCountsRequestId)
      .toBeGreaterThan(oldRequestIds.overviewCountsRequestId);
    expect(overviewStore.overviewStructureRequestId)
      .toBeGreaterThan(oldRequestIds.overviewStructureRequestId);
    expect(overviewStore.smartFolderCountsRequestId)
      .toBeGreaterThan(oldRequestIds.smartFolderCountsRequestId);
    expect(overviewStore.smartFoldersRequestId)
      .toBeGreaterThan(oldRequestIds.smartFoldersRequestId);
    expect(overviewStore.topTagsRequestId).toBeGreaterThan(oldRequestIds.topTagsRequestId);
    expect(overviewStore).toMatchObject({
      briefingCount: 0,
      categories: [],
      clickedCount: 0,
      favoriteCount: 0,
      hotCount: 0,
      overviewCountsError: null,
      overviewCountsStatus: 'idle',
      overviewStructureError: null,
      overviewStructureStatus: 'idle',
      readCount: 0,
      smartFolderCountsError: null,
      smartFolderCountsStatus: 'idle',
      smartFolders: [],
      smartFoldersError: null,
      smartFoldersStatus: 'idle',
      topTags: [],
      topTagsError: null,
      topTagsStatus: 'idle',
      unreadCount: 0,
      unreadsSinceLastUpdate: 0
    });
    expect(uiStore).toMatchObject({
      chatAssistantOpen: false,
      fatalError: null,
      mobileSearchOpen: false,
      searchQuery: '',
      showModal: '',
      themeMode: null
    });

    oldTags.resolve({ data: { tags: [{ name: 'leaked', count: 99 }] } });
    await expect(oldRequest).resolves.toBe(false);
    expect(overviewStore.topTags).toEqual([]);
    expect(overviewStore.topTagsStatus).toBe('idle');
  });

  // This test verifies a previous user's settings cannot overwrite the next user's successful state.
  it('keeps the new session state when an old request resolves after the next login', async () => {
    const oldSettings = deferred();
    const newSettings = deferred();
    fetchSettings
      .mockReturnValueOnce(oldSettings.promise)
      .mockReturnValueOnce(newSettings.promise);
    const authStore = useAuthStore();
    const selectionStore = useSelectionStore();
    const uiStore = useUiStore();

    authStore.setSession({ token: 'old-token', role: 'user' });
    const oldRequest = selectionStore.fetchSettings();
    authStore.clearSession();
    authStore.setSession({ token: 'new-token', role: 'admin' });
    const newRequest = selectionStore.fetchSettings();

    newSettings.resolve({
      data: {
        categoryId: '12',
        themeMode: 'dark',
        viewMode: 'minimal'
      }
    });
    await expect(newRequest).resolves.toBe(true);
    oldSettings.resolve({
      data: {
        categoryId: '3',
        themeMode: 'light',
        viewMode: 'reader'
      }
    });
    await expect(oldRequest).resolves.toBe(false);

    expect(authStore).toMatchObject({ token: 'new-token', role: 'admin' });
    expect(selectionStore.currentSelection).toMatchObject({
      categoryId: '12',
      viewMode: 'minimal'
    });
    expect(selectionStore.settingsStatus).toBe('success');
    expect(uiStore.themeMode).toBe('dark');
  });
});
