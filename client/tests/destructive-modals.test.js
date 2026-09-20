import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import Cleanup from '../src/components/dialogs/Cleanup.vue';
import DeleteCategory from '../src/components/dialogs/categories/DeleteCategory.vue';
import DeleteFeed from '../src/components/dialogs/feeds/DeleteFeed.vue';
import { cleanupOldArticles } from '../src/api/cleanup';
import { fetchArchivingSettings, saveArchivingSettings } from '../src/api/settings';
import { deleteCategory } from '../src/api/categories';
import { deleteFeed } from '../src/api/feeds';
import { notifyActionError } from '../src/services/actionNotifications.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/cleanup', () => ({
  cleanupOldArticles: vi.fn()
}));

vi.mock('../src/api/settings', () => ({ fetchArchivingSettings: vi.fn(), saveArchivingSettings: vi.fn() }));

vi.mock('../src/api/categories', () => ({
  deleteCategory: vi.fn()
}));

vi.mock('../src/api/feeds', () => ({
  deleteFeed: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

const defaults = { neverDeleteUnread: true, neverDeleteFavorites: true, neverDeleteClicked: false,
  maximumAgeValue: 7, maximumAgeUnit: 'years', maximumArticlesPerFeed: null, maximumArticlesTotal: null };
let wrapper;
const button = label => wrapper.findAll('button').find(item => item.text() === label);

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
  fetchArchivingSettings.mockImplementation(async () => ({ data: { ...defaults } }));
  saveArchivingSettings.mockImplementation(async data => ({ data }));
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
  it('loads saved values and saves edits without cleanup', async () => {
    mountModal(Cleanup);
    await flushPromises();
    expect(wrapper.get('#cleanup-max-age').element.value).toBe('7');
    await wrapper.get('#cleanup-max-age').setValue(3);
    await wrapper.get('select').setValue('months');
    await wrapper.get('#maximumArticlesPerFeed').setValue(100);
    await button('Save settings').trigger('click');
    await flushPromises();
    expect(saveArchivingSettings).toHaveBeenCalledWith({ ...defaults, maximumAgeValue: 3, maximumAgeUnit: 'months', maximumArticlesPerFeed: 100 });
    expect(cleanupOldArticles).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Archiving settings saved.');
  });

  it('saves the displayed edits before cleanup and blocks actions throughout both requests', async () => {
    const saving = Promise.withResolvers();
    saveArchivingSettings.mockReturnValue(saving.promise);
    cleanupOldArticles.mockResolvedValue({});
    vi.stubGlobal('location', { reload: vi.fn() });
    const { store } = mountModal(Cleanup);
    await flushPromises();
    await wrapper.get('#cleanup-max-age').setValue(14);
    await button('Cleanup now').trigger('click');
    expect(saveArchivingSettings).toHaveBeenCalledWith({ ...defaults, maximumAgeValue: 14 });
    expect(cleanupOldArticles).not.toHaveBeenCalled();
    expect(button('Save settings').element.disabled).toBe(true);
    expect(button('Close').element.disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(store.uiStore.setShowModal).not.toHaveBeenCalled();
    saving.resolve({ data: { ...defaults, maximumAgeValue: 14 } });
    await flushPromises();
    expect(cleanupOldArticles).toHaveBeenCalledOnce();
  });

  it('does not clean up if saving fails and allows retry', async () => {
    saveArchivingSettings.mockRejectedValue(new Error('save failed'));
    mountModal(Cleanup);
    await flushPromises();
    await button('Cleanup now').trigger('click');
    await flushPromises();
    expect(cleanupOldArticles).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalled();
    expect(button('Cleanup now').element.disabled).toBe(false);
  });

  it('blocks actions on load failure and supports retry', async () => {
    fetchArchivingSettings.mockRejectedValueOnce(new Error('load failed'));
    mountModal(Cleanup);
    expect(button('Save settings').element.disabled).toBe(true);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not load');
    expect(button('Cleanup now').element.disabled).toBe(true);
    await button('Retry').trigger('click');
    await flushPromises();
    expect(button('Cleanup now').element.disabled).toBe(false);
  });

  it('validates numeric limits and saves blank counts as unlimited', async () => {
    mountModal(Cleanup);
    await flushPromises();
    await wrapper.get('#maximumArticlesTotal').setValue(1000000001);
    await button('Save settings').trigger('click');
    expect(saveArchivingSettings).not.toHaveBeenCalled();
    await wrapper.get('#maximumArticlesTotal').setValue('');
    await button('Save settings').trigger('click');
    await flushPromises();
    expect(saveArchivingSettings).toHaveBeenCalledWith(defaults);
  });

  // Verifies cleanup resets the selection and reloads after the server succeeds.
  it('cleans old articles and reloads the application', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    cleanupOldArticles.mockResolvedValue({});
    const { store } = mountModal(Cleanup);

    await flushPromises();
    await button('Cleanup now').trigger('click');
    await flushPromises();

    await flushPromises();
    expect(cleanupOldArticles).toHaveBeenCalledOnce();
    expect(store.selectionStore.selectCategory).toHaveBeenCalledWith('%');
    expect(reload).toHaveBeenCalledOnce();
  });

  // Verifies cleanup failures are reported and do not reset the selection.
  it('reports cleanup failures and supports closing', async () => {
    const error = new Error('cleanup failed');
    cleanupOldArticles.mockRejectedValue(error);
    const { store } = mountModal(Cleanup);

    await flushPromises();
    await button('Cleanup now').trigger('click');
    await flushPromises();
    await button('Close').trigger('click');

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
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    cleanupOldArticles.mockReturnValue(pendingRequest.promise);
    const { store } = mountModal(Cleanup);
    await flushPromises();
    const confirmButton = button('Cleanup now');

    await confirmButton.trigger('click');
    await confirmButton.trigger('click');

    await flushPromises();
    expect(cleanupOldArticles).toHaveBeenCalledOnce();
    expect(confirmButton.attributes('disabled')).toBeDefined();
    expect(reload).not.toHaveBeenCalled();
    expect(store.selectionStore.selectCategory).not.toHaveBeenCalled();

    pendingRequest.resolve({});
    await flushPromises();

    expect(confirmButton.attributes('disabled')).toBeUndefined();
    expect(store.selectionStore.selectCategory).toHaveBeenCalledWith('%');
    expect(reload).toHaveBeenCalledOnce();
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
