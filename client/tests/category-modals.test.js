import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import NewCategory from '../src/components/model/NewCategory.vue';
import RenameCategory from '../src/components/model/RenameCategory.vue';
import { createCategory, updateCategory } from '../src/api/categories';
import { setAuthToken } from '../src/api/client';
import { notifyActionError } from '../src/services/actionNotifications.js';

vi.mock('../src/api/categories', () => ({
  createCategory: vi.fn(),
  updateCategory: vi.fn()
}));

vi.mock('../src/api/client', () => ({
  setAuthToken: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

let wrapper;

// Mounts a category modal with the store contract used by both components.
const mountCategoryModal = (component, category = { id: 7, name: 'News', iconName: 'newspaper' }) => {
  const store = {
    auth: { token: 'token' },
    data: {
      categories: [category],
      currentSelection: { categoryId: 7 },
      addCategory: vi.fn(),
      updateCategory: vi.fn(),
      setShowModal: vi.fn()
    }
  };

  wrapper = mount(component, {
    global: {
      mocks: { $store: store },
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
    await wrapper.get('.btn-primary').trigger('click');
    await flushPromises();

    expect(setAuthToken).toHaveBeenCalledWith('token');
    expect(createCategory).toHaveBeenCalledWith('Engineering', 'cpu-fill');
    expect(store.data.addCategory).toHaveBeenCalledWith({
      id: 8,
      name: 'Engineering',
      iconName: 'cpu-fill'
    });
    expect(store.data.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies empty names are ignored and the secondary action closes the dialog.
  it('does not create an unnamed category and supports closing', async () => {
    const { store } = mountCategoryModal(NewCategory);

    await wrapper.get('.btn-primary').trigger('click');
    await wrapper.get('.btn-secondary').trigger('click');

    expect(createCategory).not.toHaveBeenCalled();
    expect(store.data.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies API failures leave local category state untouched and notify the user.
  it('reports category creation failures', async () => {
    const error = new Error('create failed');
    createCategory.mockRejectedValue(error);
    const { store } = mountCategoryModal(NewCategory);

    await wrapper.get('#new-category-name').setValue('Engineering');
    await wrapper.get('.btn-primary').trigger('click');
    await flushPromises();

    expect(store.data.addCategory).not.toHaveBeenCalled();
    expect(store.data.setShowModal).not.toHaveBeenCalled();
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

    expect(setAuthToken).toHaveBeenCalledWith('token');
    expect(wrapper.get('#category-name').element.value).toBe('News');
    expect(wrapper.get('[aria-label="Folder"]').attributes('aria-checked')).toBe('true');
    expect(wrapper.get('.btn-primary').attributes('disabled')).toBeDefined();

    await wrapper.get('[aria-label="Books"]').trigger('click');

    expect(wrapper.get('.btn-primary').attributes('disabled')).toBeUndefined();
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
    await wrapper.get('.btn-primary').trigger('click');
    await flushPromises();
    await wrapper.get('.btn-secondary').trigger('click');

    expect(updateCategory).toHaveBeenCalledWith(7, 'Reading', 'book-fill');
    expect(store.data.updateCategory).toHaveBeenCalledWith(7, {
      id: 7,
      name: 'Reading',
      iconName: 'book-fill'
    });
    expect(store.data.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies update failures do not reconcile or dismiss the category dialog.
  it('reports category update failures', async () => {
    const error = new Error('update failed');
    updateCategory.mockRejectedValue(error);
    const { store } = mountCategoryModal(RenameCategory);

    await wrapper.get('#category-name').setValue('Reading');
    await wrapper.get('.btn-primary').trigger('click');
    await flushPromises();

    expect(store.data.updateCategory).not.toHaveBeenCalled();
    expect(store.data.setShowModal).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not save this category. Please try again.',
      error
    );
  });
});
