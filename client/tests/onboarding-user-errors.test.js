import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InitialFeeds from '../src/components/onboarding/InitialFeeds.vue';
import SettingsManageUsers from '../src/components/settings/SettingsManageUsers.vue';
import { createCategory } from '../src/api/categories';
import { createFeed } from '../src/api/feeds';
import { deleteUser, fetchUsers, updateUser } from '../src/api/users';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/categories', () => ({
  createCategory: vi.fn()
}));

vi.mock('../src/api/feeds', () => ({
  createFeed: vi.fn()
}));

vi.mock('../src/api/users', () => ({
  deleteUser: vi.fn(),
  fetchUsers: vi.fn(),
  updateUser: vi.fn()
}));

// This function mounts onboarding with action-backed category reconciliation.
const mountInitialFeeds = () => {
  const categories = [];
  const addCategory = vi.fn(category => {
    categories.push({ ...category, feeds: [] });
  });
  const addFeed = vi.fn((categoryId, feed) => {
    categories.find(category => String(category.id) === String(categoryId))
      ?.feeds.push(feed);
  });

  const stores = createFocusedStores({
    overview: { addCategory, addFeed, categories }
  });
  return mount(InitialFeeds, {
    global: { plugins: [stores.pinia] }
  });
};

// This function mounts user management with the requested authorization role.
const mountManageUsers = (role = 'admin', userId = 1) => {
  const stores = createFocusedStores({ auth: { role, token: 'admin-token', userId } });
  return mount(SettingsManageUsers, {
    global: { plugins: [stores.pinia] }
  });
};

// This function finds a button by its visible label.
const findButton = (wrapper, label) => wrapper
  .findAll('button')
  .find(button => button.text() === label);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('onboarding failure handling', () => {
  it('keeps partial success retry-safe and completes after a successful retry', async () => {
    const internalError = new Error('database constraint detail');
    createCategory.mockResolvedValue({
      data: { id: 7, name: 'Technology' }
    });
    createFeed
      .mockResolvedValueOnce({
        data: {
          feed: {
            id: 11,
            feedName: 'First feed',
            url: 'https://example.com/first.xml'
          }
        }
      })
      .mockRejectedValueOnce(internalError)
      .mockResolvedValueOnce({
        data: {
          feed: {
            id: 12,
            feedName: 'Second feed',
            url: 'https://example.com/second.xml'
          }
        }
      });

    const wrapper = mountInitialFeeds();
    await wrapper.setData({
      feeds: [
        {
          category: 'Technology',
          selected: true,
          title: 'First feed',
          url: 'https://example.com/first.xml'
        },
        {
          category: 'Technology',
          selected: true,
          title: 'Second feed',
          url: 'https://example.com/second.xml'
        }
      ]
    });

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('completed')).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toContain('Some starter content was added');
    expect(wrapper.get('[role="alert"]').text()).not.toContain(internalError.message);
    expect(wrapper.vm.overviewStore.categories).toHaveLength(1);
    expect(wrapper.vm.overviewStore.categories[0].feeds).toHaveLength(1);

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('completed')).toHaveLength(1);
    expect(createCategory).toHaveBeenCalledTimes(1);
    expect(createFeed).toHaveBeenCalledTimes(3);
    expect(wrapper.vm.overviewStore.categories[0].feeds).toHaveLength(2);
    expect(console.error).toHaveBeenCalledWith(
      'Error creating onboarding feed "Second feed":',
      internalError
    );
  });

  it('leaves authentication failures to the fatal application flow', async () => {
    createCategory.mockRejectedValue({
      response: { status: 401 }
    });
    const wrapper = mountInitialFeeds();
    await wrapper.setData({
      feeds: [{
        category: 'Technology',
        selected: true,
        title: 'Starter feed',
        url: 'https://example.com/feed.xml'
      }]
    });

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted('completed')).toBeUndefined();
    expect(createFeed).not.toHaveBeenCalled();
  });
});

describe('user-management failure handling', () => {
  it('does not load the user directory for non-administrators', async () => {
    const wrapper = mountManageUsers('user');
    await flushPromises();

    expect(fetchUsers).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('You need admin rights to view or change user accounts.');
  });

  it('shows a concise loading failure instead of an empty directory', async () => {
    fetchUsers.mockRejectedValue({
      response: {
        status: 500,
        data: { message: 'SQL connection failed' }
      }
    });

    const wrapper = mountManageUsers();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Could not load users. Please try again.');
    expect(wrapper.text()).not.toContain('SQL connection failed');
    expect(wrapper.find('.manage-users__empty').exists()).toBe(false);
  });

  it('prevents the current administrator from opening self-deletion', async () => {
    fetchUsers.mockResolvedValue({
      data: {
        users: [
          { id: 1, role: 'admin', username: 'admin' },
          { id: 42, role: 'user', username: 'reader' }
        ]
      }
    });

    const wrapper = mountManageUsers('admin', 1);
    await flushPromises();
    const deleteButtons = wrapper.findAll('.manage-users__action--remove');

    expect(deleteButtons[0].attributes('disabled')).toBeDefined();
    expect(deleteButtons[0].attributes('title')).toBe('You cannot delete your own account.');
    expect(deleteButtons[1].attributes('disabled')).toBeUndefined();

    wrapper.vm.showDeleteForm(1);
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[role="alert"]').text()).toBe('You cannot delete your own account.');
    expect(wrapper.find('.manage-users__confirmation').exists()).toBe(false);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('keeps the editor open and sanitizes update failures', async () => {
    const internalError = new Error('password hash service unavailable');
    fetchUsers.mockResolvedValue({
      data: {
        users: [{ id: 42, role: 'user', username: 'reader' }]
      }
    });
    updateUser.mockRejectedValue(internalError);

    const wrapper = mountManageUsers();
    await flushPromises();
    await findButton(wrapper, 'Edit').trigger('click');
    await findButton(wrapper, 'Save changes').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Could not update this user. Please try again.');
    expect(wrapper.text()).not.toContain(internalError.message);
    expect(wrapper.find('.manage-users__editor').exists()).toBe(true);
    expect(console.error).toHaveBeenCalledWith('Error updating user 42:', internalError);
  });

  it('keeps confirmation open and sanitizes deletion failures', async () => {
    const internalError = {
      response: {
        status: 409,
        data: { message: 'foreign key constraint users_activities' }
      }
    };
    fetchUsers.mockResolvedValue({
      data: {
        users: [{ id: 42, role: 'user', username: 'reader' }]
      }
    });
    deleteUser.mockRejectedValue(internalError);

    const wrapper = mountManageUsers();
    await flushPromises();
    await findButton(wrapper, 'Delete').trigger('click');
    await findButton(wrapper, 'Delete user').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Could not delete this user. Please try again.');
    expect(wrapper.text()).not.toContain('foreign key constraint');
    expect(wrapper.find('.manage-users__confirmation').exists()).toBe(true);
    expect(console.error).toHaveBeenCalledWith('Error deleting user 42:', internalError);
  });
});
