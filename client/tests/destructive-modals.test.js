import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import Cleanup from '../src/components/model/Cleanup.vue';
import DeleteCategory from '../src/components/model/DeleteCategory.vue';
import DeleteFeed from '../src/components/model/DeleteFeed.vue';
import { cleanupOldArticles } from '../src/api/cleanup';
import { deleteCategory } from '../src/api/categories';
import { deleteFeed } from '../src/api/feeds';
import { setAuthToken } from '../src/api/client';
import { notifyActionError } from '../src/services/actionNotifications.js';

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
  const store = {
    auth: { token: 'token' },
    data: {
      currentSelection: { categoryId: 4, feedId: 9 },
      getSelectedCategory: { name: 'Technology' },
      getSelectedFeedDetails: { feed: { feedName: 'Example feed' } },
      removeCategory: vi.fn(),
      removeFeed: vi.fn(),
      selectCategory: vi.fn(),
      selectFeed: vi.fn(),
      setShowModal: vi.fn()
    }
  };

  wrapper = mount(component, {
    global: { mocks: { $store: store } }
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

    await wrapper.get('.btn-primary').trigger('click');
    await flushPromises();

    expect(setAuthToken).toHaveBeenCalledWith('token');
    expect(cleanupOldArticles).toHaveBeenCalledOnce();
    expect(store.data.selectCategory).toHaveBeenCalledWith('%');
    expect(reload).toHaveBeenCalledOnce();
  });

  // Verifies cleanup failures are reported and do not reset the selection.
  it('reports cleanup failures and supports closing', async () => {
    const error = new Error('cleanup failed');
    cleanupOldArticles.mockRejectedValue(error);
    const { store } = mountModal(Cleanup);

    await wrapper.get('.btn-primary').trigger('click');
    await flushPromises();
    await wrapper.get('.btn-secondary').trigger('click');

    expect(store.data.selectCategory).not.toHaveBeenCalled();
    expect(store.data.setShowModal).toHaveBeenCalledWith('');
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not clean up old articles. Please try again.',
      error
    );
  });
});

describe('DeleteCategory', () => {
  // Verifies category deletion reconciles local state before returning to all categories.
  it('deletes the selected category', async () => {
    deleteCategory.mockResolvedValue({});
    const { store } = mountModal(DeleteCategory);

    expect(wrapper.text()).toContain('Technology');
    await wrapper.get('.btn-primary').trigger('click');
    await flushPromises();
    await wrapper.get('.btn-secondary').trigger('click');

    expect(deleteCategory).toHaveBeenCalledWith(4);
    expect(store.data.removeCategory).toHaveBeenCalledWith(4);
    expect(store.data.setShowModal).toHaveBeenCalledWith('');
    expect(store.data.selectCategory).toHaveBeenCalledWith('%');
  });

  // Verifies failed category deletion preserves local state and exposes a user-facing error.
  it('reports category deletion failures', async () => {
    const error = new Error('delete failed');
    deleteCategory.mockRejectedValue(error);
    const { store } = mountModal(DeleteCategory);

    await wrapper.get('.btn-primary').trigger('click');
    await flushPromises();

    expect(store.data.removeCategory).not.toHaveBeenCalled();
    expect(store.data.setShowModal).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not delete this category. Please try again.',
      error
    );
  });
});

describe('DeleteFeed', () => {
  // Verifies feed deletion removes the selected feed and restores the all-feeds view.
  it('deletes the selected feed', async () => {
    deleteFeed.mockResolvedValue({});
    const { store } = mountModal(DeleteFeed);

    expect(wrapper.text()).toContain('Example feed');
    await wrapper.get('.btn-primary').trigger('click');
    await flushPromises();
    await wrapper.get('.btn-secondary').trigger('click');

    expect(deleteFeed).toHaveBeenCalledWith(9);
    expect(store.data.removeFeed).toHaveBeenCalledWith(9);
    expect(store.data.selectFeed).toHaveBeenCalledWith('%');
    expect(store.data.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies failed feed deletion leaves the store unchanged and reports the failure.
  it('reports feed deletion failures', async () => {
    const error = new Error('delete failed');
    deleteFeed.mockRejectedValue(error);
    const { store } = mountModal(DeleteFeed);

    await wrapper.get('.btn-primary').trigger('click');
    await flushPromises();

    expect(store.data.removeFeed).not.toHaveBeenCalled();
    expect(store.data.setShowModal).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not delete this feed. Please try again.',
      error
    );
  });
});
