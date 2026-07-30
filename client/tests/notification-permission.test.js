import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MobileMenuOverlay from '../src/components/MobileMenuOverlay.vue';

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
const mountMobileMenu = () => mount(MobileMenuOverlay, {
  props: { mobile: true },
  global: {
    mocks: {
      $store: {
        data: {
          categories: [],
          chatAssistantOpen: false,
          currentSelection: {
            AIEnabled: false,
            categoryId: '%',
            feedId: '%',
            viewMode: 'full'
          },
          setShowModal: vi.fn()
        }
      }
    }
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mobile notification permission', () => {
  it('does not request permission when the menu opens', () => {
    const notificationApi = createNotificationApi();
    vi.stubGlobal('Notification', notificationApi);

    const wrapper = mountMobileMenu();

    expect(notificationApi.requestPermission).not.toHaveBeenCalled();
    expect(wrapper.get('#notification-options-heading').element.parentElement.nextElementSibling.textContent)
      .toContain('Enable notifications');
    wrapper.unmount();
  });

  it('requests permission only after the user presses Enable notifications', async () => {
    const notificationApi = createNotificationApi();
    vi.stubGlobal('Notification', notificationApi);
    const wrapper = mountMobileMenu();
    const notificationSection = wrapper.get('#notification-options-heading').element.closest('section');
    const button = notificationSection.querySelector('button');

    button.click();
    await flushPromises();

    expect(notificationApi.requestPermission).toHaveBeenCalledOnce();
    expect(button.textContent).toContain('Notifications enabled');
    expect(button.disabled).toBe(true);
    wrapper.unmount();
  });

  it('reflects permission denied in the browser without requesting again', () => {
    const notificationApi = createNotificationApi('denied');
    vi.stubGlobal('Notification', notificationApi);

    const wrapper = mountMobileMenu();
    const notificationSection = wrapper.get('#notification-options-heading').element.closest('section');
    const button = notificationSection.querySelector('button');

    expect(button.textContent).toContain('Notifications blocked in browser');
    expect(button.disabled).toBe(true);
    expect(notificationApi.requestPermission).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
