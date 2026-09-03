import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsAccount from '../src/components/settings/SettingsAccount.vue';
import {
  getEmailSettings,
  requestEmailVerification,
  updateEmail
} from '../src/api/auth.js';

vi.mock('../src/api/auth.js', () => ({
  getEmailSettings: vi.fn(),
  requestEmailVerification: vi.fn(),
  updateEmail: vi.fn()
}));

const mountAccount = () => mount(SettingsAccount, {
  global: {
    stubs: {
      SettingsPageIntro: { template: '<header><slot /></header>' }
    }
  }
});

describe('account email settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('loads verification state and clears it after replacing the email', async () => {
    getEmailSettings.mockResolvedValueOnce({
      email: 'old@example.com',
      emailVerifiedAt: '2026-09-02T08:00:00.000Z'
    });
    updateEmail.mockResolvedValueOnce({
      email: 'new@example.com',
      emailVerifiedAt: null,
      message: 'Email address saved. Verify it before using email features.'
    });
    const wrapper = mountAccount();
    await flushPromises();

    expect(wrapper.text()).toContain('Status: Verified');
    await wrapper.get('#account-email').setValue('new@example.com');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(updateEmail).toHaveBeenCalledWith('new@example.com');
    expect(wrapper.text()).toContain('Status: Not verified');
    expect(wrapper.text()).toContain('Email address saved');
  });

  it('requests verification only for a saved unverified address', async () => {
    getEmailSettings.mockResolvedValueOnce({
      email: 'reader@example.com',
      emailVerifiedAt: null
    });
    requestEmailVerification.mockResolvedValueOnce({
      message: 'If verification is needed, a verification email has been queued.'
    });
    const wrapper = mountAccount();
    await flushPromises();

    const buttons = wrapper.findAll('button');
    await buttons[1].trigger('click');
    await flushPromises();

    expect(requestEmailVerification).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('verification email has been queued');
  });
});
