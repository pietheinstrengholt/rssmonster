import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsAccount from '../src/components/settings/SettingsAccount.vue';
import {
  getAuthConfiguration,
  linkOidcAccount,
  getAccountSettings,
  requestEmailVerification,
  sendDailyBriefingTest,
  updateAccountSettings
} from '../src/api/auth.js';

vi.mock('../src/api/auth.js', () => ({
  getAuthConfiguration: vi.fn(),
  linkOidcAccount: vi.fn(),
  getAccountSettings: vi.fn(),
  requestEmailVerification: vi.fn(),
  sendDailyBriefingTest: vi.fn(),
  updateAccountSettings: vi.fn()
}));

const settings = {
  username: 'reader',
  email: 'reader@example.com',
  emailVerifiedAt: '2026-09-02T08:00:00.000Z',
  emailServiceEnabled: true,
  serverTimezone: 'UTC',
  emailDigestConfigured: false,
  emailDigestEnabled: false,
  emailDigestTime: '08:00',
  emailDigestTimezone: 'UTC',
  emailDigestSkipWhenEmpty: true
};

const mountAccount = () => mount(SettingsAccount, {
  global: {
    stubs: {
      SettingsPageIntro: { template: '<header><slot /></header>' }
    }
  }
});

describe('account settings', () => {
  it('makes provider-managed email read-only independently of local login policy', async () => {
    getAccountSettings.mockResolvedValueOnce({ ...settings, emailManagedByProvider: true });
    const wrapper = mountAccount();
    await flushPromises();
    expect(wrapper.get('#account-email').attributes('readonly')).toBeDefined();
    expect(wrapper.text()).toContain('Your email address is managed by your identity provider.');
    wrapper.unmount();
    getAccountSettings.mockResolvedValueOnce({ ...settings, localPasswordEnabled: false, emailManagedByProvider: false });
    const local = mountAccount();
    await flushPromises();
    expect(local.get('#account-email').attributes('readonly')).toBeUndefined();
    local.unmount();
  });

  it('hides local password and linking controls for a provider-only account', async () => {
    getAccountSettings.mockResolvedValueOnce({ ...settings, localPasswordEnabled: false });
    getAuthConfiguration.mockResolvedValueOnce({ oidcEnabled: true });
    const wrapper = mountAccount();
    await flushPromises();
    expect(wrapper.find('#account-password').exists()).toBe(false);
    expect(wrapper.find('#account-link-password').exists()).toBe(false);
    expect(wrapper.text()).toContain('Manage your password with your identity provider');
    wrapper.unmount();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getAccountSettings.mockResolvedValue({ ...settings });
    getAuthConfiguration.mockResolvedValue({ oidcEnabled: false });
  });

  it('offers linking when configured and clears the confirmation password after failure', async () => {
    getAuthConfiguration.mockResolvedValueOnce({ oidcEnabled: true });
    linkOidcAccount.mockRejectedValueOnce(new Error('Incorrect password'));
    const wrapper = mountAccount();
    await flushPromises();
    await wrapper.get('#account-link-password').setValue('current-password');
    await wrapper.get('#account-link-password').element.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(linkOidcAccount).toHaveBeenCalledWith('current-password');
    expect(wrapper.get('#account-link-password').element.value).toBe('');
    expect(wrapper.text()).toContain('Could not link the provider');
    wrapper.unmount();
  });

  it('shows the fixed username and suggests the browser timezone for a disabled digest', async () => {
    const wrapper = mountAccount();
    await flushPromises();

    expect(wrapper.get('#account-username').element.readOnly).toBe(true);
    expect(wrapper.get('#account-username').element.value).toBe('reader');
    expect(wrapper.get('#account-digest-time').element.value).toBe('08:00');
    expect(wrapper.get('#account-digest-timezone').element.value).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    );
    expect(wrapper.get('#account-digest-skip-empty').element.checked).toBe(true);
  });

  it('saves email, digest, timezone, and optional password fields together', async () => {
    updateAccountSettings.mockResolvedValueOnce({
      ...settings,
      emailDigestConfigured: true,
      emailDigestEnabled: true,
      emailDigestTime: '09:30',
      emailDigestTimezone: 'Europe/Amsterdam',
      message: 'Account settings updated.',
      passwordChanged: false
    });
    const wrapper = mountAccount();
    await flushPromises();

    await wrapper.get('#account-digest-enabled').setValue(true);
    await wrapper.get('#account-digest-time').setValue('09:30');
    await wrapper.get('#account-digest-timezone').setValue('Europe/Amsterdam');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(updateAccountSettings).toHaveBeenCalledWith(expect.objectContaining({
      email: 'reader@example.com',
      password: '',
      passwordRepeat: '',
      emailDigestEnabled: true,
      emailDigestTime: '09:30',
      emailDigestTimezone: 'Europe/Amsterdam',
      emailDigestSkipWhenEmpty: true
    }));
    expect(wrapper.text()).toContain('Account settings updated.');
    expect(wrapper.get('.account-settings__message').classes())
      .toContain('account-settings__message--success');
  });

  it('does not submit when the two new passwords differ', async () => {
    const wrapper = mountAccount();
    await flushPromises();

    await wrapper.get('#account-password').setValue('new-password');
    await wrapper.get('#account-password-repeat').setValue('different-password');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.text()).toContain('Both passwords must match.');
    expect(updateAccountSettings).not.toHaveBeenCalled();
  });

  it('requests verification only for the saved unverified address', async () => {
    getAccountSettings.mockResolvedValueOnce({ ...settings, emailVerifiedAt: null });
    requestEmailVerification.mockResolvedValueOnce({
      message: 'If verification is needed, a verification email has been queued.'
    });
    const wrapper = mountAccount();
    await flushPromises();

    await wrapper.get('.account-settings__verify').trigger('click');
    await flushPromises();

    expect(requestEmailVerification).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('verification email has been queued');
  });

  it('requests a daily briefing test for a verified address', async () => {
    sendDailyBriefingTest.mockResolvedValueOnce({
      queued: true,
      message: 'Daily briefing test email queued.'
    });
    const wrapper = mountAccount();
    await flushPromises();

    await wrapper.get('.account-settings__digest-test').trigger('click');
    await flushPromises();

    expect(sendDailyBriefingTest).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Daily briefing test email queued.');
    expect(wrapper.get('.account-settings__message').classes())
      .toContain('account-settings__message--success');
  });
});
