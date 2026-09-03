import Cookies from 'js-cookie';
import { createPinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.vue';
import * as authApi from '../src/api/auth';

vi.mock('../src/api/auth', () => ({
  confirmEmailVerification: vi.fn(),
  confirmPasswordReset: vi.fn(),
  developmentLogin: vi.fn().mockRejectedValue({ response: { status: 404 } }),
  getAuthConfiguration: vi.fn(),
  getEmailEnrollmentStatus: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendEmailEnrollment: vi.fn(),
  updateEmailEnrollment: vi.fn(),
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
  authApi.getAuthConfiguration.mockResolvedValue({ emailEnabled: false });
  authApi.getEmailEnrollmentStatus.mockResolvedValue({ email: null, verified: false });
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

  it('moves an unverified legacy account into email enrollment without a normal session', async () => {
    authApi.login.mockResolvedValueOnce({
      message: 'A verified email address is required before signing in.',
      emailVerificationRequired: true,
      email: null,
      emailEnrollmentToken: 'enrollment-token'
    });
    authApi.updateEmailEnrollment.mockResolvedValueOnce({
      email: 'reader@example.com',
      verified: false,
      message: 'Verification email queued. Waiting for confirmation.'
    });
    const wrapper = await mountAuthForm();
    await wrapper.get('#username').setValue('legacy-reader');
    await wrapper.get('#password').setValue('password');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('#username').exists()).toBe(false);
    expect(wrapper.get('#enrollment-email').element.value).toBe('');
    await wrapper.get('#enrollment-email').setValue('reader@example.com');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(authApi.updateEmailEnrollment).toHaveBeenCalledWith(
      'enrollment-token',
      'reader@example.com'
    );
    expect(wrapper.get('#enrollment-email').element.value).toBe('reader@example.com');
    expect(wrapper.text()).toContain('Waiting for confirmation');

    authApi.getEmailEnrollmentStatus.mockResolvedValueOnce({
      email: 'reader@example.com',
      verified: true
    });
    await wrapper.vm.checkEmailEnrollmentStatus();
    await flushPromises();
    expect(wrapper.text()).toContain('Email address verified. Return to sign in');
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps an unverified address editable and resends from enrollment', async () => {
    authApi.login.mockResolvedValueOnce({
      message: 'A verified email address is required before signing in.',
      emailVerificationRequired: true,
      email: 'mistake@example.com',
      emailEnrollmentToken: 'enrollment-token'
    });
    authApi.resendEmailEnrollment.mockResolvedValueOnce({
      email: 'mistake@example.com',
      verified: false,
      message: 'Verification email queued. Waiting for confirmation.'
    });
    const wrapper = await mountAuthForm();
    await wrapper.get('#username').setValue('legacy-reader');
    await wrapper.get('#password').setValue('password');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    const email = wrapper.get('#enrollment-email');
    expect(email.element.value).toBe('mistake@example.com');
    await wrapper.findAll('button').find(button =>
      button.text().includes('Resend verification email')
    ).trigger('click');
    await flushPromises();
    expect(authApi.resendEmailEnrollment).toHaveBeenCalledWith('enrollment-token');

    await email.setValue('corrected@example.com');
    expect(email.element.value).toBe('corrected@example.com');
    expect(wrapper.text()).not.toContain('Resend verification email');
    authApi.updateEmailEnrollment.mockResolvedValueOnce({
      email: 'corrected@example.com',
      verified: false,
      message: 'Verification email queued. Waiting for confirmation.'
    });
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(authApi.updateEmailEnrollment).toHaveBeenCalledWith(
      'enrollment-token',
      'corrected@example.com'
    );
    wrapper.unmount();
  });

  it('submits registration through the form from the repeat-password field', async () => {
    authApi.getAuthConfiguration.mockResolvedValueOnce({ emailEnabled: true });
    authApi.register.mockResolvedValueOnce({
      message: 'Account created with new wording.',
      registered: true
    });
    const wrapper = await mountAuthForm();
    await wrapper.find('.auth-register a').trigger('click');
    await wrapper.find('#username').setValue('new-reader');
    await wrapper.find('#email').setValue('Reader@Example.COM');
    await wrapper.find('#password').setValue('secret');
    await wrapper.find('#password_repeat').setValue('secret');

    await submitWithEnter(wrapper, '#password_repeat');

    expect(authApi.register).toHaveBeenCalledWith({
      username: 'new-reader',
      email: 'Reader@Example.COM',
      password: 'secret',
      password_repeat: 'secret'
    });
    expect(authApi.login).not.toHaveBeenCalled();
    expect(wrapper.vm.showSignup).toBe(false);
  });

  it('keeps email off login and disabled registration forms', async () => {
    const wrapper = await mountAuthForm();

    expect(wrapper.find('#email').exists()).toBe(false);
    await wrapper.find('.auth-register a').trigger('click');
    expect(wrapper.find('#email').exists()).toBe(false);
    await wrapper.find('#username').setValue('username-only');
    await wrapper.find('#password').setValue('password');
    await wrapper.find('#password_repeat').setValue('password');
    authApi.register.mockResolvedValueOnce({ registered: true, message: 'Registered!' });
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(authApi.register).toHaveBeenCalledWith({
      username: 'username-only',
      password: 'password',
      password_repeat: 'password'
    });
  });

  it('shows and requires email only on registration when email is enabled', async () => {
    authApi.getAuthConfiguration.mockResolvedValueOnce({ emailEnabled: true });
    const wrapper = await mountAuthForm();

    expect(wrapper.find('#email').exists()).toBe(false);
    await wrapper.find('.auth-register a').trigger('click');

    const email = wrapper.get('#email');
    expect(email.attributes('required')).toBeDefined();
    expect(wrapper.get('label[for="email"]').text()).toBe('Email address');
  });

  it('confirms a verification token from the URL and removes it from browser history', async () => {
    authApi.confirmEmailVerification.mockResolvedValueOnce({ message: 'Email address verified.' });
    window.history.replaceState({}, '', '/#verify-email-token=opaque-token');

    const wrapper = await mountAuthForm();

    expect(authApi.confirmEmailVerification).toHaveBeenCalledWith('opaque-token');
    expect(wrapper.get('.email-verification-banner').text()).toBe('Email address verified.');
    expect(window.location.hash).toBe('');
  });

  it('requests a reset from the forgot-password state', async () => {
    authApi.requestPasswordReset.mockResolvedValueOnce({
      message: 'If that address can receive password resets, an email has been queued.'
    });
    const wrapper = await mountAuthForm();

    await wrapper.findAll('.auth-register a')[1].trigger('click');
    await wrapper.get('#reset-email').setValue('reader@example.com');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(authApi.requestPasswordReset).toHaveBeenCalledWith('reader@example.com');
    expect(wrapper.text()).toContain('If that address can receive password resets');
  });

  it('loads and completes the reset-password state from a URL fragment', async () => {
    authApi.confirmPasswordReset.mockResolvedValueOnce({
      message: 'Password updated. You can now sign in.'
    });
    window.history.replaceState({}, '', '/#reset-password-token=opaque-reset-token');
    const wrapper = await mountAuthForm();

    expect(wrapper.get('#reset-password').exists()).toBe(true);
    expect(window.location.hash).toBe('');
    await wrapper.get('#reset-password').setValue('replacement-password');
    await wrapper.get('#reset-password-repeat').setValue('replacement-password');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(authApi.confirmPasswordReset).toHaveBeenCalledWith({
      token: 'opaque-reset-token',
      password: 'replacement-password',
      passwordRepeat: 'replacement-password'
    });
    expect(wrapper.vm.passwordResetMode).toBeNull();
    expect(wrapper.text()).toContain('Password updated');
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
