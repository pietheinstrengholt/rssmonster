import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import NewCategory from '../src/components/dialogs/categories/NewCategory.vue';
import RenameCategory from '../src/components/dialogs/categories/RenameCategory.vue';
import { createCategory, updateCategory } from '../src/api/categories';
import { notifyActionError } from '../src/services/actionNotifications.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/categories', () => ({
  createCategory: vi.fn(),
  updateCategory: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

let wrapper;

// Mounts a category modal with the store contract used by both components.
const mountCategoryModal = (component, category = { id: 7, name: 'News', iconName: 'newspaper' }) => {
  const store = createFocusedStores({
    auth: { token: 'token' },
    overview: {
      categories: [category],
      addCategory: vi.fn(),
      updateCategory: vi.fn()
    },
    selection: {
      currentSelection: { categoryId: 7 }
    },
    ui: {
      setShowModal: vi.fn()
    }
  });

  wrapper = mount(component, {
    global: {
      plugins: [store.pinia],
      stubs: { BootstrapIcon: true }
    }
  });

  return { wrapper, store };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('NewCategory', () => {
  // Verifies creation uses the selected icon and reconciles the response through the store.
  it('creates a named category and closes the modal', async () => {
    createCategory.mockResolvedValue({
      data: { id: 8, name: 'Engineering', iconName: 'cpu-fill' }
    });
    const { store } = mountCategoryModal(NewCategory);

    await wrapper.get('#new-category-name').setValue('Engineering');
    await wrapper.get('[aria-label="Technology"]').trigger('click');
    await wrapper.get('.base-dialog__button--primary').trigger('click');
    await flushPromises();

    expect(createCategory).toHaveBeenCalledWith('Engineering', 'cpu-fill');
    expect(store.overviewStore.addCategory).toHaveBeenCalledWith({
      id: 8,
      name: 'Engineering',
      iconName: 'cpu-fill'
    });
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies empty names are ignored and the secondary action closes the dialog.
  it('does not create an unnamed category and supports closing', async () => {
    const { store } = mountCategoryModal(NewCategory);

    await wrapper.get('.base-dialog__button--primary').trigger('click');
    await wrapper.get('.base-dialog__button--secondary').trigger('click');

    expect(createCategory).not.toHaveBeenCalled();
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies whitespace-only category names remain invalid after normalization.
  it('does not create a whitespace-only category', async () => {
    mountCategoryModal(NewCategory);

    await wrapper.get('#new-category-name').setValue('   ');
    await wrapper.get('.base-dialog__button--primary').trigger('click');

    expect(wrapper.get('.base-dialog__button--primary').attributes('disabled')).toBeDefined();
    expect(createCategory).not.toHaveBeenCalled();
  });

  // Verifies category creation trims names and blocks duplicate requests while pending.
  it('normalizes names and blocks duplicate category creation', async () => {
    const pendingRequest = Promise.withResolvers();
    createCategory.mockReturnValue(pendingRequest.promise);
    mountCategoryModal(NewCategory);

    await wrapper.get('#new-category-name').setValue('  Engineering  ');
    const saveButton = wrapper.get('.base-dialog__button--primary');
    await saveButton.trigger('click');
    await saveButton.trigger('click');

    expect(createCategory).toHaveBeenCalledOnce();
    expect(createCategory).toHaveBeenCalledWith('Engineering', 'folder-fill');
    expect(saveButton.attributes('disabled')).toBeDefined();

    pendingRequest.resolve({
      data: { id: 8, name: 'Engineering', iconName: 'folder-fill' }
    });
    await flushPromises();

    expect(saveButton.attributes('disabled')).toBeUndefined();
  });

  // Verifies API failures leave local category state untouched and notify the user.
  it('reports category creation failures', async () => {
    const error = new Error('create failed');
    createCategory.mockRejectedValue(error);
    const { store } = mountCategoryModal(NewCategory);

    await wrapper.get('#new-category-name').setValue('Engineering');
    await wrapper.get('.base-dialog__button--primary').trigger('click');
    await flushPromises();

    expect(store.overviewStore.addCategory).not.toHaveBeenCalled();
    expect(store.uiStore.setShowModal).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not create this category. Please try again.',
      error
    );
  });
});

describe('RenameCategory', () => {
  // Verifies existing values are cloned and unchanged categories cannot be submitted.
  it('initializes selected category state and enables saving only after a change', async () => {
    const category = { id: 7, name: 'News', iconName: 'unsupported-icon' };
    mountCategoryModal(RenameCategory, category);

    expect(wrapper.get('#category-name').element.value).toBe('News');
    expect(wrapper.get('[aria-label="Folder"]').attributes('aria-checked')).toBe('true');
    expect(wrapper.get('.base-dialog__button--primary').attributes('disabled')).toBeDefined();

    await wrapper.get('[aria-label="Books"]').trigger('click');

    expect(wrapper.get('.base-dialog__button--primary').attributes('disabled')).toBeUndefined();
    expect(category.iconName).toBe('unsupported-icon');
  });

  // Verifies edits are sent to the API and normalized into the local store.
  it('updates the selected category and closes the modal', async () => {
    updateCategory.mockResolvedValue({
      data: { id: 7, name: 'Reading' }
    });
    const { store } = mountCategoryModal(RenameCategory);

    await wrapper.get('#category-name').setValue('Reading');
    await wrapper.get('[aria-label="Books"]').trigger('click');
    await wrapper.get('.base-dialog__button--primary').trigger('click');
    await flushPromises();
    await wrapper.get('.base-dialog__button--secondary').trigger('click');

    expect(updateCategory).toHaveBeenCalledWith(7, 'Reading', 'book-fill');
    expect(store.overviewStore.updateCategory).toHaveBeenCalledWith(7, {
      id: 7,
      name: 'Reading',
      iconName: 'book-fill'
    });
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies update failures do not reconcile or dismiss the category dialog.
  it('reports category update failures', async () => {
    const error = new Error('update failed');
    updateCategory.mockRejectedValue(error);
    const { store } = mountCategoryModal(RenameCategory);

    await wrapper.get('#category-name').setValue('Reading');
    await wrapper.get('.base-dialog__button--primary').trigger('click');
    await flushPromises();

    expect(store.overviewStore.updateCategory).not.toHaveBeenCalled();
    expect(store.uiStore.setShowModal).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not save this category. Please try again.',
      error
    );
  });

  // Verifies whitespace-only edits cannot be submitted.
  it('does not update a category to a whitespace-only name', async () => {
    mountCategoryModal(RenameCategory);

    await wrapper.get('#category-name').setValue('   ');
    await wrapper.get('.base-dialog__button--primary').trigger('click');

    expect(wrapper.get('.base-dialog__button--primary').attributes('disabled')).toBeDefined();
    expect(updateCategory).not.toHaveBeenCalled();
  });

  // Verifies category updates trim names and block duplicate requests while pending.
  it('normalizes names and blocks duplicate category updates', async () => {
    const pendingRequest = Promise.withResolvers();
    updateCategory.mockReturnValue(pendingRequest.promise);
    mountCategoryModal(RenameCategory);

    await wrapper.get('#category-name').setValue('  Reading  ');
    const saveButton = wrapper.get('.base-dialog__button--primary');
    await saveButton.trigger('click');
    await saveButton.trigger('click');

    expect(updateCategory).toHaveBeenCalledOnce();
    expect(updateCategory).toHaveBeenCalledWith(7, 'Reading', 'newspaper');
    expect(saveButton.attributes('disabled')).toBeDefined();

    pendingRequest.resolve({
      data: { id: 7, name: 'Reading' }
    });
    await flushPromises();

    expect(saveButton.attributes('disabled')).toBeUndefined();
  });
});
