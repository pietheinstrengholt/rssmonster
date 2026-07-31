import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import Cleanup from '../src/components/dialogs/Cleanup.vue';
import DeleteCategory from '../src/components/dialogs/categories/DeleteCategory.vue';
import DeleteFeed from '../src/components/dialogs/feeds/DeleteFeed.vue';
import { cleanupOldArticles } from '../src/api/cleanup';
import { deleteCategory } from '../src/api/categories';
import { deleteFeed } from '../src/api/feeds';
import { setAuthToken } from '../src/api/client';
import { notifyActionError } from '../src/services/actionNotifications.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/cleanup', () => ({
  cleanupOldArticles: vi.fn()
}));

vi.mock('../src/api/categories', () => ({
  deleteCategory: vi.fn()
}));

vi.mock('../src/api/feeds', () => ({
  deleteFeed: vi.fn()
}));

vi.mock('../src/api/client', () => ({
  setAuthToken: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

let wrapper;

// Mounts destructive modals with selected entities and observable store actions.
const mountModal = (component) => {
  const store = createFocusedStores({
    auth: { token: 'token' },
    overview: {
      categories: [{
        id: 4,
        name: 'Technology',
        feeds: [{ id: 9, feedName: 'Example feed' }]
      }],
      removeCategory: vi.fn(),
      removeFeed: vi.fn()
    },
    selection: {
      currentSelection: { categoryId: 4, feedId: 9 },
      selectCategory: vi.fn(),
      selectFeed: vi.fn()
    },
    ui: {
      setShowModal: vi.fn()
    }
  });

  wrapper = mount(component, {
    global: { plugins: [store.pinia] }
  });

  return { wrapper, store };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Cleanup', () => {
  // Verifies cleanup resets the selection and reloads after the server succeeds.
  it('cleans old articles and reloads the application', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    cleanupOldArticles.mockResolvedValue({});
    const { store } = mountModal(Cleanup);

    await wrapper.get('.confirm-dialog__confirm').trigger('click');
    await flushPromises();

    expect(setAuthToken).toHaveBeenCalledWith('token');
    expect(cleanupOldArticles).toHaveBeenCalledOnce();
    expect(store.selectionStore.selectCategory).toHaveBeenCalledWith('%');
    expect(reload).toHaveBeenCalledOnce();
  });

  // Verifies cleanup failures are reported and do not reset the selection.
  it('reports cleanup failures and supports closing', async () => {
    const error = new Error('cleanup failed');
    cleanupOldArticles.mockRejectedValue(error);
    const { store } = mountModal(Cleanup);

    await wrapper.get('.confirm-dialog__confirm').trigger('click');
    await flushPromises();
    await wrapper.get('.confirm-dialog__cancel').trigger('click');

    expect(store.selectionStore.selectCategory).not.toHaveBeenCalled();
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('');
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not clean up old articles. Please try again.',
      error
    );
  });

  // Verifies repeated cleanup confirmation cannot start concurrent requests.
  it('blocks duplicate cleanup requests while pending', async () => {
    const pendingRequest = Promise.withResolvers();
    vi.stubGlobal('location', { reload: vi.fn() });
    cleanupOldArticles.mockReturnValue(pendingRequest.promise);
    mountModal(Cleanup);
    const confirmButton = wrapper.get('.confirm-dialog__confirm');

    await confirmButton.trigger('click');
    await confirmButton.trigger('click');

    expect(cleanupOldArticles).toHaveBeenCalledOnce();
    expect(confirmButton.attributes('disabled')).toBeDefined();

    pendingRequest.resolve({});
    await flushPromises();

    expect(confirmButton.attributes('disabled')).toBeUndefined();
  });
});

describe('DeleteCategory', () => {
  // Verifies category deletion reconciles local state before returning to all categories.
  it('deletes the selected category', async () => {
    deleteCategory.mockResolvedValue({});
    const { store } = mountModal(DeleteCategory);

    expect(wrapper.text()).toContain('Technology');
    await wrapper.get('.confirm-dialog__confirm').trigger('click');
    await flushPromises();
    await wrapper.get('.confirm-dialog__cancel').trigger('click');

    expect(deleteCategory).toHaveBeenCalledWith(4);
    expect(store.overviewStore.removeCategory).toHaveBeenCalledWith(4);
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('');
    expect(store.selectionStore.selectCategory).toHaveBeenCalledWith('%');
  });

  // Verifies failed category deletion preserves local state and exposes a user-facing error.
  it('reports category deletion failures', async () => {
    const error = new Error('delete failed');
    deleteCategory.mockRejectedValue(error);
    const { store } = mountModal(DeleteCategory);

    await wrapper.get('.confirm-dialog__confirm').trigger('click');
    await flushPromises();

    expect(store.overviewStore.removeCategory).not.toHaveBeenCalled();
    expect(store.uiStore.setShowModal).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not delete this category. Please try again.',
      error
    );
  });

  // Verifies repeated category confirmation cannot start concurrent deletions.
  it('blocks duplicate category deletion requests while pending', async () => {
    const pendingRequest = Promise.withResolvers();
    deleteCategory.mockReturnValue(pendingRequest.promise);
    mountModal(DeleteCategory);
    const confirmButton = wrapper.get('.confirm-dialog__confirm');

    await confirmButton.trigger('click');
    await confirmButton.trigger('click');

    expect(deleteCategory).toHaveBeenCalledOnce();
    expect(confirmButton.attributes('disabled')).toBeDefined();

    pendingRequest.resolve({});
    await flushPromises();

    expect(confirmButton.attributes('disabled')).toBeUndefined();
  });
});

describe('DeleteFeed', () => {
  // Verifies feed deletion removes the selected feed and restores the all-feeds view.
  it('deletes the selected feed', async () => {
    deleteFeed.mockResolvedValue({});
    const { store } = mountModal(DeleteFeed);

    expect(wrapper.text()).toContain('Example feed');
    await wrapper.get('.confirm-dialog__confirm').trigger('click');
    await flushPromises();
    await wrapper.get('.confirm-dialog__cancel').trigger('click');

    expect(deleteFeed).toHaveBeenCalledWith(9);
    expect(store.overviewStore.removeFeed).toHaveBeenCalledWith(9);
    expect(store.selectionStore.selectFeed).toHaveBeenCalledWith('%');
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies failed feed deletion leaves the store unchanged and reports the failure.
  it('reports feed deletion failures', async () => {
    const error = new Error('delete failed');
    deleteFeed.mockRejectedValue(error);
    const { store } = mountModal(DeleteFeed);

    await wrapper.get('.confirm-dialog__confirm').trigger('click');
    await flushPromises();

    expect(store.overviewStore.removeFeed).not.toHaveBeenCalled();
    expect(store.uiStore.setShowModal).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not delete this feed. Please try again.',
      error
    );
  });

  // Verifies repeated feed confirmation cannot start concurrent deletions.
  it('blocks duplicate feed deletion requests while pending', async () => {
    const pendingRequest = Promise.withResolvers();
    deleteFeed.mockReturnValue(pendingRequest.promise);
    mountModal(DeleteFeed);
    const confirmButton = wrapper.get('.confirm-dialog__confirm');

    await confirmButton.trigger('click');
    await confirmButton.trigger('click');

    expect(deleteFeed).toHaveBeenCalledOnce();
    expect(confirmButton.attributes('disabled')).toBeDefined();

    pendingRequest.resolve({});
    await flushPromises();

    expect(confirmButton.attributes('disabled')).toBeUndefined();
  });
});
