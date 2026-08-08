import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsSmartFolders from '../src/components/settings/SettingsSmartFolders.vue';
import { saveSmartFolders } from '../src/api/smartfolders';
import { notifyActionError } from '../src/services/actionNotifications.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/smartfolders', () => ({
  fetchSmartFolderInsights: vi.fn(),
  saveSmartFolders: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

// Creates a promise whose completion is controlled by the test.
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
};

// Creates a Smart Folder coordinator context with live Options API computed values.
const createContext = (overrides = {}) => {
  const stores = createFocusedStores({
    auth: { token: 'token' },
    overview: {
      fetchSmartFolders: vi.fn().mockResolvedValue(),
      smartFolders: [{
        id: 1,
        name: 'Unread',
        query: 'unread:true limit:25',
        limitCount: 25
      }]
    },
    selection: { currentSelection: { AIEnabled: true } }
  });
  const context = {
    ...SettingsSmartFolders.data(),
    ...stores,
    $emit: vi.fn(),
    ...SettingsSmartFolders.methods,
    ...overrides
  };

  for (const [name, getter] of Object.entries(SettingsSmartFolders.computed)) {
    Object.defineProperty(context, name, {
      configurable: true,
      get: () => getter.call(context)
    });
  }

  return context;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('SettingsSmartFolders coordinator', () => {
  it('loads an isolated Smart Folder collection from authoritative store state', async () => {
    const context = createContext();

    await context.fetchSmartFolders();

    expect(context.overviewStore.fetchSmartFolders).toHaveBeenCalledOnce();
    expect(context.loaded).toBe(true);
    expect(context.loadError).toBe('');
    expect(context.smartFolders).toEqual([{
      localId: 1,
      id: 1,
      name: 'Unread',
      query: 'unread:true limit:25',
      limitCount: 25
    }]);
    context.smartFolders[0].name = 'Local edit';
    expect(context.overviewStore.smartFolders[0].name).toBe('Unread');
  });

  it('adds valid recommendations and prevents duplicate queries', async () => {
    const context = createContext();
    await context.fetchSmartFolders();

    context.applySmartFolderRecommendation(null);
    context.applySmartFolderRecommendation({
      name: 'Suggested',
      query: 'unread:true limit:25'
    });
    expect(context.smartFolders).toHaveLength(1);
    expect(notifyActionError).toHaveBeenCalledWith(
      'That Smart Folder is already in your list.'
    );

    context.applySmartFolderRecommendation({
      name: 'Security',
      query: 'tag:security limit:50'
    });
    expect(context.smartFolders).toHaveLength(2);
  });

  it('coordinates add, edit, copy, cancel, and remove operations', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const context = createContext();
    await context.fetchSmartFolders();

    context.addSmartFolder();
    expect(context.smartFolders.at(-1)).toMatchObject({
      localId: 'local-1234',
      name: 'New Smart Folder',
      query: 'sort:recommended limit:50'
    });
    expect(context.selectedSmartFolderId).toBe('local-1234');

    context.saveSmartFolderConfig(1, {
      name: 'Edited',
      query: 'favorite:true limit:100',
      limitCount: 100
    });
    expect(context.smartFolders[1]).toMatchObject({
      name: 'Edited',
      query: 'favorite:true limit:100',
      limitCount: 100
    });
    expect(context.selectedSmartFolderId).toBeNull();

    context.saveSmartFolderAsCopy({
      name: 'Copied',
      query: 'hot:true limit:50',
      limitCount: 50
    });
    expect(context.smartFolders.at(-1).name).toBe('Copied copy');

    context.selectedSmartFolderId = context.smartFolders[0].localId;
    context.removeSmartFolder(0);
    expect(context.selectedSmartFolderId).toBeNull();
  });

  it('commits an open editor before persisting and refreshes store state', async () => {
    const context = createContext();
    await context.fetchSmartFolders();
    context.overviewStore.fetchSmartFolders.mockClear();
    context.selectedSmartFolderId = 1;
    context.smartFolderEditorRef = {
      getFolderUpdate: vi.fn(() => ({
        name: 'Updated unread',
        query: 'unread:true limit:100',
        limitCount: 100
      }))
    };
    context.smartFolders.push({
      localId: 'blank',
      name: ' ',
      query: 'limit:50',
      limitCount: 50
    });
    saveSmartFolders.mockResolvedValue({ data: { smartFolders: [] } });

    await context.save();

    expect(saveSmartFolders).toHaveBeenCalledOnce();
    expect(saveSmartFolders.mock.calls[0][0]).toHaveLength(1);
    expect(saveSmartFolders.mock.calls[0][0][0]).toMatchObject({
      name: 'Updated unread',
      query: 'unread:true limit:100',
      limitCount: 100
    });
    expect(context.overviewStore.fetchSmartFolders).toHaveBeenCalledOnce();
    expect(context.$emit).toHaveBeenCalledWith('saved');
    expect(context.$emit).toHaveBeenCalledWith('close');
  });

  it('blocks invalid editor state and reports persistence failures', async () => {
    const invalidContext = createContext();
    invalidContext.loaded = true;
    invalidContext.editorQueryInvalid = true;
    await invalidContext.save();
    expect(saveSmartFolders).not.toHaveBeenCalled();

    const context = createContext();
    await context.fetchSmartFolders();
    const error = new Error('save failed');
    saveSmartFolders.mockRejectedValue(error);
    await context.save();

    expect(context.$emit).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not save Smart Folders. Please try again.',
      error
    );
  });

  it('blocks saving while the authoritative Smart Folder refresh is pending', async () => {
    const pendingLoad = deferred();
    const context = createContext();
    context.overviewStore.smartFolders = [];
    context.overviewStore.fetchSmartFolders = vi.fn(async () => {
      await pendingLoad.promise;
      context.overviewStore.smartFolders = [{
        id: 9,
        name: 'Authoritative',
        query: 'favorite:true limit:50',
        limitCount: 50
      }];
    });

    const loadPromise = context.fetchSmartFolders();
    await context.save();

    expect(context.loading).toBe(true);
    expect(context.loaded).toBe(false);
    expect(saveSmartFolders).not.toHaveBeenCalled();

    pendingLoad.resolve();
    await loadPromise;

    expect(context.loaded).toBe(true);
    expect(context.smartFolders[0].name).toBe('Authoritative');
  });

  it('keeps saving blocked when the authoritative refresh fails', async () => {
    const error = new Error('load failed');
    const context = createContext();
    context.overviewStore.smartFolders = [];
    context.overviewStore.fetchSmartFolders = vi.fn().mockRejectedValue(error);

    await context.fetchSmartFolders();
    await context.save();

    expect(context.loaded).toBe(false);
    expect(context.loadError).toContain('Could not load Smart Folders');
    expect(saveSmartFolders).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not load Smart Folders. Please try again.',
      error
    );
  });
});
