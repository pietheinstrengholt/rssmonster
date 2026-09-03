import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InitialFeeds from '../src/components/onboarding/InitialFeeds.vue';
import SettingsManageUsers from '../src/components/settings/SettingsManageUsers.vue';
import { createCategory } from '../src/api/categories';
import { createFeed } from '../src/api/feeds';
import {
  deleteUser,
  fetchEmailConfiguration,
  fetchUsers,
  testSmtpConnectivity,
  updateUser
} from '../src/api/users';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/categories', () => ({
  createCategory: vi.fn()
}));

vi.mock('../src/api/feeds', () => ({
  createFeed: vi.fn()
}));

vi.mock('../src/api/users', () => ({
  deleteUser: vi.fn(),
  fetchEmailConfiguration: vi.fn(),
  fetchUsers: vi.fn(),
  testSmtpConnectivity: vi.fn(),
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
  fetchUsers.mockResolvedValue({ data: { users: [] } });
  fetchEmailConfiguration.mockResolvedValue({
    data: { configured: false, enabled: false }
  });
  testSmtpConnectivity.mockResolvedValue({
    data: { verified: true, message: 'SMTP connection succeeded.' }
  });
  updateUser.mockResolvedValue({ data: {} });
  deleteUser.mockResolvedValue({ data: {} });
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

  it('shows email configuration, account addresses, and tests SMTP when enabled', async () => {
    fetchEmailConfiguration.mockResolvedValue({
      data: { configured: true, enabled: true }
    });
    fetchUsers.mockResolvedValue({
      data: {
        users: [{
          id: 42,
          role: 'user',
          username: 'reader',
          email: 'reader@example.com',
          emailVerifiedAt: '2026-09-02T08:00:00.000Z'
        }]
      }
    });

    const wrapper = mountManageUsers();
    await flushPromises();

    expect(wrapper.text()).toContain('Configuration: Configured');
    expect(wrapper.text()).toContain('Service: Enabled');
    expect(wrapper.text()).toContain('reader@example.com');
    expect(wrapper.text()).toContain('Verified');

    await findButton(wrapper, 'Test SMTP connection').trigger('click');
    await flushPromises();

    expect(testSmtpConnectivity).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('SMTP connection succeeded.');
  });

  it('allows an administrator to edit an account email address', async () => {
    fetchUsers
      .mockResolvedValueOnce({
        data: {
          users: [{
            id: 42,
            role: 'user',
            username: 'reader',
            email: 'old@example.com',
            emailVerifiedAt: '2026-09-02T08:00:00.000Z'
          }]
        }
      })
      .mockResolvedValueOnce({ data: { users: [] } });

    const wrapper = mountManageUsers();
    await flushPromises();
    await findButton(wrapper, 'Edit').trigger('click');

    expect(wrapper.get('#user-email').element.value).toBe('old@example.com');
    expect(wrapper.text()).toContain('Verified');
    await wrapper.get('#user-email').setValue('new@example.com');
    await findButton(wrapper, 'Save changes').trigger('click');
    await flushPromises();

    expect(updateUser).toHaveBeenCalledWith(42, {
      email: 'new@example.com',
      password: '',
      role: 'user',
      username: 'reader'
    });
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

  it('updates an account with a validated password and refreshes the directory', async () => {
    fetchUsers
      .mockResolvedValueOnce({
        data: {
          users: [{ id: 42, role: 'user', username: 'reader' }]
        }
      })
      .mockResolvedValueOnce({
        data: {
          users: [{ id: 42, role: 'admin', username: 'reader' }]
        }
      });

    const wrapper = mountManageUsers();
    await flushPromises();
    await findButton(wrapper, 'Edit').trigger('click');
    await wrapper.get('#role').setValue('admin');
    await wrapper.get('#password').setValue('new-password');
    await wrapper.get('#password-repeat').setValue('new-password');
    await findButton(wrapper, 'Save changes').trigger('click');
    await flushPromises();

    expect(updateUser).toHaveBeenCalledWith(42, {
      email: null,
      password: 'new-password',
      role: 'admin',
      username: 'reader'
    });
    expect(fetchUsers).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('User updated successfully.');
    expect(wrapper.find('.manage-users__editor').exists()).toBe(false);
  });

  it.each([
    ['short passwords', 'short', 'short', 'Password must be at least 8 characters long.'],
    ['non-matching passwords', 'long-enough', 'different-password', 'Passwords do not match.']
  ])('rejects %s before sending an update', async (_scenario, password, repeatedPassword, message) => {
    fetchUsers.mockResolvedValue({
      data: {
        users: [{ id: 42, role: 'user', username: 'reader' }]
      }
    });

    const wrapper = mountManageUsers();
    await flushPromises();
    await findButton(wrapper, 'Edit').trigger('click');
    await wrapper.get('#password').setValue(password);
    await wrapper.get('#password-repeat').setValue(repeatedPassword);
    await findButton(wrapper, 'Save changes').trigger('click');

    expect(wrapper.get('[role="alert"]').text()).toBe(message);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('cancels editing and reloads the directory', async () => {
    fetchUsers.mockResolvedValue({
      data: {
        users: [{ id: 42, role: 'user', username: 'reader' }]
      }
    });

    const wrapper = mountManageUsers();
    await flushPromises();
    await findButton(wrapper, 'Edit').trigger('click');
    await findButton(wrapper, 'Cancel').trigger('click');
    await flushPromises();

    expect(wrapper.find('.manage-users__editor').exists()).toBe(false);
    expect(fetchUsers).toHaveBeenCalledTimes(2);
  });

  it('deletes another account and refreshes the directory', async () => {
    fetchUsers
      .mockResolvedValueOnce({
        data: {
          users: [{ id: 42, role: 'user', username: 'reader' }]
        }
      })
      .mockResolvedValueOnce({ data: { users: [] } });

    const wrapper = mountManageUsers();
    await flushPromises();
    await findButton(wrapper, 'Delete').trigger('click');
    await findButton(wrapper, 'Delete user').trigger('click');
    await flushPromises();

    expect(deleteUser).toHaveBeenCalledWith(42);
    expect(wrapper.text()).toContain('User deleted successfully.');
    expect(wrapper.find('.manage-users__confirmation').exists()).toBe(false);
  });

  it('cancels deletion and returns to a refreshed directory', async () => {
    fetchUsers.mockResolvedValue({
      data: {
        users: [{ id: 42, role: 'user', username: 'reader' }]
      }
    });

    const wrapper = mountManageUsers();
    await flushPromises();
    await findButton(wrapper, 'Delete').trigger('click');
    await findButton(wrapper, 'Cancel').trigger('click');
    await flushPromises();

    expect(wrapper.find('.manage-users__confirmation').exists()).toBe(false);
    expect(fetchUsers).toHaveBeenCalledTimes(2);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('stops every management action when administrator rights are revoked', async () => {
    fetchUsers.mockResolvedValue({
      data: {
        users: [{ id: 42, role: 'user', username: 'reader' }]
      }
    });
    const wrapper = mountManageUsers();
    await flushPromises();
    wrapper.vm.authStore.role = 'user';

    expect(await wrapper.vm.fetchUsers()).toBe(false);
    wrapper.vm.editUser(42);
    await wrapper.vm.updateUser();
    await wrapper.vm.deleteUser(42);
    wrapper.vm.showDeleteForm(42);

    expect(wrapper.vm.message).toBe('You need admin rights to manage users.');
    expect(wrapper.vm.messageType).toBe('error');
    expect(updateUser).not.toHaveBeenCalled();
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
