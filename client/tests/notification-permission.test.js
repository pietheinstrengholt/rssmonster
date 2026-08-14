import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MobileMenuOverlay from '../src/components/shell/MobileMenuOverlay.vue';
import { createFocusedStores } from './helpers/focusedStores.js';

const pushMocks = vi.hoisted(() => ({
  getState: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn()
}));

vi.mock('../src/services/pushNotifications.js', () => ({
  getPushNotificationState: pushMocks.getState,
  subscribeToPushNotifications: pushMocks.subscribe,
  unsubscribeFromPushNotifications: pushMocks.unsubscribe
}));

// This function creates the browser Notification API with mutable permission state.
const createNotificationApi = (initialPermission = 'default') => {
  let permission = initialPermission;

  return {
    get permission() {
      return permission;
    },
    requestPermission: vi.fn(async () => {
      permission = 'granted';
      return permission;
    })
  };
};

// This function mounts the mobile options menu with the minimal store state it needs.
const mountMobileMenu = () => {
  const stores = createFocusedStores({
    overview: { categories: [] },
    selection: {
      currentSelection: {
        AIEnabled: false,
        categoryId: '%',
        feedId: '%',
        viewMode: 'full'
      }
    },
    ui: {
      chatAssistantOpen: false,
      setShowModal: vi.fn()
    }
  });
  return mount(MobileMenuOverlay, {
    props: { mobile: true },
    global: {
      plugins: [stores.pinia]
    }
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('mobile notification permission', () => {
  it('does not request permission when the menu opens', async () => {
    const notificationApi = createNotificationApi();
    vi.stubGlobal('Notification', notificationApi);
    pushMocks.getState.mockResolvedValue({
      available: true,
      subscribed: false,
      permission: 'default',
      publicKey: 'public-key'
    });

    const wrapper = mountMobileMenu();
    await flushPromises();

    expect(notificationApi.requestPermission).not.toHaveBeenCalled();
    expect(wrapper.get('#notification-options-heading').element.parentElement.nextElementSibling.textContent)
      .toContain('Enable notifications');
    wrapper.unmount();
  });

  it('requests permission only after the user presses Enable notifications', async () => {
    const notificationApi = createNotificationApi();
    vi.stubGlobal('Notification', notificationApi);
    pushMocks.getState
      .mockResolvedValueOnce({ available: true, subscribed: false, permission: 'default', publicKey: 'key' })
      .mockResolvedValueOnce({ available: true, subscribed: true, permission: 'granted', publicKey: 'key' });
    pushMocks.subscribe.mockResolvedValue({ endpoint: 'https://push.example/subscription' });
    const wrapper = mountMobileMenu();
    await flushPromises();
    const notificationSection = wrapper.get('#notification-options-heading').element.closest('section');
    const button = notificationSection.querySelector('button');

    button.click();
    await flushPromises();

    expect(pushMocks.subscribe).toHaveBeenCalledWith('key');
    expect(button.textContent).toContain('Disable notifications');
    expect(button.disabled).toBe(false);
    wrapper.unmount();
  });

  it('reflects permission denied in the browser without requesting again', async () => {
    const notificationApi = createNotificationApi('denied');
    vi.stubGlobal('Notification', notificationApi);
    pushMocks.getState.mockResolvedValue({
      available: true,
      subscribed: false,
      permission: 'denied',
      publicKey: 'key'
    });

    const wrapper = mountMobileMenu();
    await flushPromises();
    const notificationSection = wrapper.get('#notification-options-heading').element.closest('section');
    const button = notificationSection.querySelector('button');

    expect(button.textContent).toContain('Notifications blocked in browser');
    expect(button.disabled).toBe(true);
    expect(notificationApi.requestPermission).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('explains that iOS notifications require the installed Home Screen app', async () => {
    pushMocks.getState.mockResolvedValue({
      available: false,
      reason: 'ios-install-required',
      subscribed: false,
      permission: 'unsupported'
    });

    const wrapper = mountMobileMenu();
    await flushPromises();

    expect(wrapper.vm.notificationButtonLabel).toBe('Home Screen app required');
    expect(wrapper.vm.notificationButtonDisabled).toBe(true);
    expect(wrapper.vm.notificationMessage).toContain('Add RSSMonster to your Home Screen');
    wrapper.unmount();
  });

  it('offers a retry after a transient capability check failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pushMocks.getState
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        available: true,
        reason: null,
        subscribed: false,
        permission: 'default',
        publicKey: 'key'
      });
    const wrapper = mountMobileMenu();
    await flushPromises();

    expect(wrapper.vm.notificationButtonLabel).toBe('Retry notification check');
    expect(wrapper.vm.notificationButtonDisabled).toBe(false);
    await wrapper.get('#notification-options-heading').element.closest('section').querySelector('button').click();
    await flushPromises();

    expect(pushMocks.getState).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.notificationButtonLabel).toBe('Enable notifications');
    wrapper.unmount();
  });
});
