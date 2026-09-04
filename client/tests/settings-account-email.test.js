import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsAccount from '../src/components/settings/SettingsAccount.vue';
import {
  getAccountSettings,
  requestEmailVerification,
  sendDailyBriefingTest,
  updateAccountSettings
} from '../src/api/auth.js';

vi.mock('../src/api/auth.js', () => ({
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getAccountSettings.mockResolvedValue({ ...settings });
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
