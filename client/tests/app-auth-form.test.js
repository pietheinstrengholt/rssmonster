import Cookies from 'js-cookie';
import { createPinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.vue';
import * as authApi from '../src/api/auth';

vi.mock('../src/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  validateSession: vi.fn()
}));

// This function mounts the signed-out authentication form with an isolated store.
const mountAuthForm = async () => {
  const wrapper = mount(App, {
    global: {
      plugins: [createPinia()],
      stubs: {
        AppShell: true
      }
    }
  });

  await flushPromises();
  return wrapper;
};

// This function reproduces the native form submission that follows Enter in a field.
const submitWithEnter = async (wrapper, selector) => {
  const field = wrapper.find(selector);
  field.element.focus();
  field.element.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true
  }));
  wrapper.find('form').element.requestSubmit();
  await flushPromises();
};

// This function creates a controllable request for pending-state assertions.
const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Cookies, 'get').mockReturnValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('App authentication form', () => {
  // Verifies the mount host retains the sole application ID across authentication branches.
  it('uses semantic roots without duplicating the Vue mount ID', async () => {
    const mountHost = document.createElement('div');
    mountHost.id = 'app';
    document.body.appendChild(mountHost);
    const wrapper = mount(App, {
      attachTo: mountHost,
      global: {
        plugins: [createPinia()],
        stubs: {
          AppShell: { template: '<div class="app-shell">Authenticated shell</div>' }
        }
      }
    });
    await flushPromises();

    expect(document.querySelectorAll('#app')).toHaveLength(1);
    expect(wrapper.get('.app-root').element.id).toBe('');
    expect(wrapper.get('.auth-page').exists()).toBe(true);

    await wrapper.setData({ isAuthenticated: true, isLoading: false });
    await flushPromises();

    expect(document.querySelectorAll('#app')).toHaveLength(1);
    expect(wrapper.get('.app-root').element.id).toBe('');
    expect(wrapper.get('#main').exists()).toBe(true);
    expect(wrapper.get('.app-shell').text()).toBe('Authenticated shell');
    wrapper.unmount();
  });

  it('uses the application-owned submit-button styling', async () => {
    const wrapper = await mountAuthForm();

    const submitButton = wrapper.get('button[type="submit"]');

    expect(submitButton.classes()).toContain('auth-submit');
  });

  it('submits login through the form when Enter is pressed in a login field', async () => {
    authApi.login.mockResolvedValueOnce({ message: 'Signed in.' });
    const wrapper = await mountAuthForm();
    await wrapper.find('#username').setValue('reader');
    await wrapper.find('#password').setValue('secret');

    await submitWithEnter(wrapper, '#username');

    expect(authApi.login).toHaveBeenCalledWith({
      username: 'reader',
      password: 'secret'
    });
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('submits registration through the form from the repeat-password field', async () => {
    authApi.register.mockResolvedValueOnce({
      message: 'Account created with new wording.',
      registered: true
    });
    const wrapper = await mountAuthForm();
    await wrapper.find('.auth-register a').trigger('click');
    await wrapper.find('#username').setValue('new-reader');
    await wrapper.find('#password').setValue('secret');
    await wrapper.find('#password_repeat').setValue('secret');

    await submitWithEnter(wrapper, '#password_repeat');

    expect(authApi.register).toHaveBeenCalledWith({
      username: 'new-reader',
      password: 'secret',
      password_repeat: 'secret'
    });
    expect(authApi.login).not.toHaveBeenCalled();
    expect(wrapper.vm.showSignup).toBe(false);
  });

  it('blocks duplicate submissions and restores state after success', async () => {
    const deferred = createDeferred();
    authApi.login.mockReturnValueOnce(deferred.promise);
    const wrapper = await mountAuthForm();

    const firstSubmission = wrapper.find('form').trigger('submit');
    await wrapper.find('form').trigger('submit');

    expect(authApi.login).toHaveBeenCalledOnce();
    expect(wrapper.vm.isSubmitting).toBe(true);
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('button[type="submit"]').text()).toBe('Signing in...');

    deferred.resolve({ message: 'Signed in.' });
    await firstSubmission;
    await flushPromises();

    expect(wrapper.vm.isSubmitting).toBe(false);
  });

  it('restores submitting state after failure', async () => {
    authApi.login.mockRejectedValueOnce(new Error('Network Error'));
    const wrapper = await mountAuthForm();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.vm.isSubmitting).toBe(false);
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
  });

  it('exposes messages as an accessible live status and clears them on mode changes', async () => {
    authApi.login.mockResolvedValueOnce({ message: 'Please check your details.' });
    const wrapper = await mountAuthForm();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const message = wrapper.find('.auth-message');
    expect(message.attributes('role')).toBe('status');
    expect(message.attributes('aria-live')).toBe('polite');

    await wrapper.find('.auth-register a').trigger('click');
    expect(wrapper.find('.auth-message').exists()).toBe(false);
  });
});
