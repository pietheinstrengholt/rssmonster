import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SettingsSmtp from '../src/components/settings/SettingsSmtp.vue';
import SettingsServer from '../src/components/settings/SettingsServer.vue';
import { fetchOidcSettings, fetchServerSettings, saveServerSettings, fetchSmtpSettings, saveSmtpSettings, clearSmtpSettings } from '../src/api/settings';
import { testSmtpConnectivity } from '../src/api/users';
vi.mock('../src/api/users', () => ({ testSmtpConnectivity: vi.fn() }));
vi.mock('../src/api/settings', () => ({ fetchOidcSettings: vi.fn(), saveOidcSettings: vi.fn(), clearOidcSettings: vi.fn(), fetchServerSettings: vi.fn(), saveServerSettings: vi.fn(), fetchSmtpSettings: vi.fn(), saveSmtpSettings: vi.fn(), clearSmtpSettings: vi.fn() }));
const smtpConfiguration = (overrides = {}) => ({
  configured: true, enabled: true, password: { configured: true, overridden: false },
  fields: Object.fromEntries(Object.entries({ EMAIL_ENABLED: true, PUBLIC_APP_URL: 'https://reader.example.com', SMTP_HOST: 'smtp.example.com', SMTP_PORT: 587, SMTP_SECURE: false, SMTP_REQUIRE_TLS: true, SMTP_USER: 'reader', EMAIL_FROM: 'RSSMonster <reader@example.com>', EMAIL_REPLY_TO: '' }).map(([key, value]) => [key, { value, overridden: false }])),
  ...overrides
});
const configuration = (override = null, environmentValue = true) => ({
  allowRegistration: { override, environmentValue, effectiveValue: override ?? environmentValue }, localAuthEnabled: true
});
beforeEach(() => {
  vi.resetAllMocks();
  fetchOidcSettings.mockResolvedValue({ data: { fields: {}, secret: { configured: false, overridden: false } } });
  fetchSmtpSettings.mockResolvedValue({ data: smtpConfiguration() });
  saveSmtpSettings.mockResolvedValue({ data: smtpConfiguration() });
  clearSmtpSettings.mockResolvedValue({ data: smtpConfiguration() });
  testSmtpConnectivity.mockResolvedValue({ data: { message: 'SMTP connection succeeded.' } });
  fetchServerSettings.mockResolvedValue({ data: configuration() });
  saveServerSettings.mockImplementation(async ({ allowRegistration }) => ({ data: configuration(allowRegistration) }));
});
const render = async () => {
  const wrapper = mount(SettingsServer);
  await flushPromises();
  return wrapper;
};
describe('Server settings', () => {
  it.each([['allow', true, 'Allowed'], ['disable', false, 'Disabled'], ['environment', null, 'Allowed']])('saves %s and displays the effective value', async (selection, value, label) => {
    const wrapper = await render();
    await wrapper.get('select').setValue(selection);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(saveServerSettings).toHaveBeenCalledWith({ allowRegistration: value });
    expect(wrapper.text()).toContain(`Current registration: ${label}`);
    expect(wrapper.get('[role=status]').text()).toBe('Server settings saved.');
  });
  it('loads the persisted override and shows the environment fallback', async () => {
    fetchServerSettings.mockResolvedValue({ data: configuration(true, false) });
    const wrapper = await render();
    expect(wrapper.get('select').element.value).toBe('allow');
    expect(wrapper.text()).toContain('Use environment default (disabled)');
  });
  it('explains when local authentication prevents registration', async () => {
    fetchServerSettings.mockResolvedValue({ data: { ...configuration(true), localAuthEnabled: false } });
    const wrapper = await render();
    expect(wrapper.text()).toContain('Current registration: Disabled');
    expect(wrapper.text()).toContain('Local authentication is disabled');
  });
  it('retries a failed load without exposing an editable form', async () => {
    fetchServerSettings.mockRejectedValueOnce(new Error('unavailable'));
    const wrapper = await render();
    expect(wrapper.get('[role=alert]').text()).toContain('could not be loaded');
    expect(wrapper.find('#server-account-panel form').exists()).toBe(false);
    await wrapper.findAll('button').find(button => button.text() === 'Retry').trigger('click');
    await flushPromises();
    expect(wrapper.find('#server-account-panel form').exists()).toBe(true);
  });
  it('retains the saved state and draft when saving fails', async () => {
    saveServerSettings.mockRejectedValueOnce(new Error('unavailable'));
    const wrapper = await render();
    await wrapper.get('select').setValue('disable');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('could not be saved');
    expect(wrapper.text()).toContain('Current registration: Allowed');
    expect(wrapper.get('select').element.value).toBe('disable');
  });
});

const renderSmtp = async () => { const wrapper = mount(SettingsSmtp); await flushPromises(); return wrapper; };
const smtpButton = wrapper => wrapper.findAll('button').find(button => button.text() === 'Test SMTP connection');
describe('Server email delivery', () => {
  it('shows configuration and tests SMTP with success feedback', async () => {
    const wrapper = await renderSmtp();
    expect(wrapper.text()).toContain('Configuration: Configured');
    expect(wrapper.text()).toContain('Service: Enabled');
    await smtpButton(wrapper).trigger('click');
    await flushPromises();
    expect(testSmtpConnectivity).toHaveBeenCalledOnce();
    expect(wrapper.get('[role=status]').text()).toBe('SMTP connection succeeded.');
  });
  it('hides the connection test when email is disabled', async () => {
    fetchSmtpSettings.mockResolvedValue({ data: smtpConfiguration({ configured: false, enabled: false }) });
    const wrapper = await renderSmtp();
    expect(wrapper.text()).toContain('Configuration: Incomplete');
    expect(wrapper.text()).toContain('Service: Disabled');
    expect(smtpButton(wrapper)).toBeUndefined();
  });
  it('disables testing for incomplete configuration', async () => {
    fetchSmtpSettings.mockResolvedValue({ data: smtpConfiguration({ configured: false, enabled: true }) });
    const wrapper = await renderSmtp();
    expect(smtpButton(wrapper).attributes('disabled')).toBeDefined();
  });
  it('retries email loading independently of registration settings', async () => {
    fetchSmtpSettings.mockRejectedValueOnce(new Error('unavailable'));
    const wrapper = await renderSmtp();
    expect(wrapper.get('[role=alert]').text()).toBe('Could not load email configuration status.');
    await wrapper.findAll('button').find(button => button.text() === 'Retry email configuration').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Configuration: Configured');
    expect(wrapper.find('[role=alert]').exists()).toBe(false);
  });
  it('reports SMTP failure and allows retry', async () => {
    testSmtpConnectivity.mockRejectedValueOnce({ response: { data: { message: 'SMTP authentication failed.' } } });
    const wrapper = await renderSmtp();
    await smtpButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toBe('SMTP authentication failed.');
    await smtpButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.find('[role=alert]').exists()).toBe(false);
    expect(wrapper.get('[role=status]').text()).toBe('SMTP connection succeeded.');
  });
  it('prevents repeated testing while the connection check is pending', async () => {
    let complete;
    testSmtpConnectivity.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const wrapper = await renderSmtp();
    await smtpButton(wrapper).trigger('click');
    const pending = wrapper.findAll('button').find(button => button.text() === 'Testing SMTP...');
    expect(pending.attributes('disabled')).toBeDefined();
    await pending.trigger('click');
    expect(testSmtpConnectivity).toHaveBeenCalledOnce();
    complete({ data: { message: 'SMTP connection succeeded.' } });
    await flushPromises();
    expect(smtpButton(wrapper).attributes('disabled')).toBeUndefined();
  });
});

describe('SMTP overrides form', () => {
  it('switches between Account and SMTP tabs with keyboard access', async () => {
    const wrapper = mount(SettingsServer, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.get('#server-account-tab').attributes('aria-selected')).toBe('true');
    expect(wrapper.get('#server-account-panel').isVisible()).toBe(true);
    expect(wrapper.get('#server-smtp-panel').isVisible()).toBe(false);
    await wrapper.get('#server-smtp-tab').trigger('click');
    expect(wrapper.get('#server-smtp-tab').attributes('aria-selected')).toBe('true');
    expect(wrapper.get('#server-account-panel').isVisible()).toBe(false);
    expect(wrapper.get('#server-smtp-panel').isVisible()).toBe(true);
    await wrapper.get('.smtp-settings-default [type=checkbox]').setValue(true);
    await wrapper.get('#smtp-SMTP_HOST').setValue('unsaved.example.com');
    await wrapper.get('#server-smtp-tab').trigger('keydown', { key: 'Home' });
    expect(wrapper.get('#server-account-tab').attributes('aria-selected')).toBe('true');
    expect(wrapper.get('#server-account-panel').isVisible()).toBe(true);
    expect(wrapper.get('#server-smtp-panel').isVisible()).toBe(false);
    await wrapper.get('#server-smtp-tab').trigger('click');
    expect(wrapper.get('#smtp-SMTP_HOST').element.value).toBe('unsaved.example.com');
    wrapper.unmount();
  });
  it('saves all SMTP options under one override and does not send a retained password', async () => {
    const wrapper = await renderSmtp();
    expect(wrapper.get('#smtp-SMTP_HOST').attributes('disabled')).toBeDefined();
    await wrapper.get('.smtp-settings-default [type=checkbox]').setValue(true);
    await wrapper.get('#smtp-SMTP_HOST').setValue('new.example.com');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(saveSmtpSettings).toHaveBeenCalledWith({ overrides: { ...Object.fromEntries(Object.entries(smtpConfiguration().fields).map(([key, field]) => [key, field.value])), SMTP_HOST: 'new.example.com' }, passwordAction: 'keep' });
    expect(wrapper.text()).toContain('SMTP settings saved.');
  });
  it('saves replacement passwords and clears the input after success', async () => {
    const wrapper = await renderSmtp();
    await wrapper.get('.smtp-settings-default [type=checkbox]').setValue(true);
    expect(wrapper.get('#smtp-password').attributes('type')).toBe('password');
    expect(wrapper.find('#smtp-SMTP_PASSWORD_FILE').exists()).toBe(false);
    await wrapper.get('#smtp-password').setValue('test-only-password');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(saveSmtpSettings).toHaveBeenCalledWith({ overrides: Object.fromEntries(Object.entries(smtpConfiguration().fields).map(([key, field]) => [key, field.value])), passwordAction: 'replace', password: 'test-only-password' });
    expect(wrapper.get('#smtp-password').element.value).toBe('');
    expect(wrapper.text()).not.toContain('test-only-password');
  });
  it('restores environment defaults after confirmation', async () => {
    const wrapper = await renderSmtp();
    await wrapper.findAll('button').find(button => button.text() === 'Restore environment defaults').trigger('click');
    expect(clearSmtpSettings).not.toHaveBeenCalled();
    await wrapper.findAll('button').find(button => button.text() === 'Restore defaults').trigger('click');
    await flushPromises();
    expect(clearSmtpSettings).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('SMTP environment defaults restored.');
  });
  it('retains edits and displays validation errors without success feedback', async () => {
    saveSmtpSettings.mockRejectedValue({ response: { data: { error: 'SMTP_SECURE must be false when SMTP_PORT is 587' } } });
    const wrapper = await renderSmtp();
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('SMTP_SECURE');
    expect(wrapper.text()).not.toContain('SMTP settings saved.');
  });
});

it('includes OIDC in keyboard navigation and preserves its panel on tab switches', async () => {
  const wrapper = mount(SettingsServer, { attachTo: document.body });
  await flushPromises();
  await wrapper.get('#server-oidc-tab').trigger('click');
  await flushPromises();
  expect(wrapper.get('#server-oidc-tab').attributes('aria-selected')).toBe('true');
  expect(wrapper.get('#server-oidc-panel').isVisible()).toBe(true);
  await wrapper.get('#server-oidc-tab').trigger('keydown', { key: 'ArrowRight' });
  expect(wrapper.get('#server-account-tab').attributes('aria-selected')).toBe('true');
  expect(wrapper.get('#server-oidc-panel').isVisible()).toBe(false);
  wrapper.unmount();
});

it('uses one SMTP inheritance checkbox and restores the entire group when cleared', async () => {
  const wrapper = await renderSmtp();
  expect(wrapper.findAll('input[type=checkbox]')).toHaveLength(1);
  expect(wrapper.get('#smtp-password').element.disabled).toBe(true);
  await wrapper.get('input[type=checkbox]').setValue(true);
  expect(wrapper.get('#smtp-SMTP_HOST').element.disabled).toBe(false);
  expect(wrapper.get('#smtp-password').element.disabled).toBe(false);
  await wrapper.get('#smtp-EMAIL_ENABLED').setValue(false);
  expect(wrapper.get('#smtp-SMTP_HOST').element.disabled).toBe(false);
  await wrapper.get('#smtp-password').setValue('discarded-test-secret');
  await wrapper.get('input[type=checkbox]').setValue(false);
  expect(wrapper.get('#smtp-password').element.disabled).toBe(true);
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  expect(saveSmtpSettings).toHaveBeenCalledWith({ overrides: {}, passwordAction: 'environment' });
});

it('retains a masked saved password until it is edited and allows clearing it', async () => {
  const data = smtpConfiguration({ password: { configured: true, overridden: true } });
  data.fields.EMAIL_ENABLED.overridden = true;
  fetchSmtpSettings.mockResolvedValue({ data });
  saveSmtpSettings.mockResolvedValue({ data });
  const wrapper = await renderSmtp();
  expect(wrapper.get('#smtp-password').attributes('placeholder')).toBe('********');
  expect(wrapper.get('#smtp-password').element.value).toBe('');
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  expect(saveSmtpSettings).toHaveBeenLastCalledWith(expect.objectContaining({ passwordAction: 'keep' }));
  await wrapper.get('#smtp-password').setValue('replacement');
  await wrapper.get('#smtp-password').setValue('');
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  expect(saveSmtpSettings).toHaveBeenLastCalledWith(expect.objectContaining({ passwordAction: 'clear' }));
});
it('does not suggest that an environment password is retained when overrides are enabled', async () => {
  const wrapper = await renderSmtp();
  expect(wrapper.get('#smtp-password').attributes('placeholder')).toBe('********');
  await wrapper.get('input[type=checkbox]').setValue(true);
  expect(wrapper.get('#smtp-password').attributes('placeholder')).toBe('');
  expect(wrapper.text()).not.toContain('Manage the SMTP password');
  expect(wrapper.text()).not.toContain('Password configured');
});
