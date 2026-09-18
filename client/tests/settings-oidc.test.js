import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SettingsOidc from '../src/components/settings/SettingsOidc.vue';
import { fetchOidcSettings, saveOidcSettings, clearOidcSettings } from '../src/api/settings';
vi.mock('../src/api/settings', () => ({ fetchOidcSettings: vi.fn(), saveOidcSettings: vi.fn(), clearOidcSettings: vi.fn() }));
const configuration = () => ({
  fields: { ...Object.fromEntries(Object.entries({ OIDC_ENABLED: false, LOCAL_AUTH_ENABLED: true, OIDC_AUTO_PROVISION: false,
    OIDC_ISSUER_URL: 'https://issuer.example.com', OIDC_REDIRECT_URI: 'https://reader.example.com/api/auth/oidc/callback',
    OIDC_FRONTEND_URL: 'https://reader.example.com', OIDC_SCOPES: 'openid email' }).map(([key, value]) => [key, { value, overridden: false }])), OIDC_CLIENT_ID: { configured: true, overridden: false } },
  secret: { configured: true, overridden: false }
});
beforeEach(() => {
  vi.resetAllMocks();
  fetchOidcSettings.mockResolvedValue({ data: configuration() });
  saveOidcSettings.mockResolvedValue({ data: configuration() });
  clearOidcSettings.mockResolvedValue({ data: configuration() });
});
const render = async () => { const wrapper = mount(SettingsOidc); await flushPromises(); return wrapper; };
describe('OIDC settings', () => {
  it('has only two override checkboxes and disables inherited provider fields', async () => {
    const wrapper = await render();
    expect(wrapper.findAll('input[type=checkbox]')).toHaveLength(2);
    expect(wrapper.get('#OIDC_ENABLED').element.disabled).toBe(true);
    expect(wrapper.get('#OIDC_CLIENT_ID').element.closest('fieldset').disabled).toBe(true);
    await wrapper.findAll('input[type=checkbox]')[0].setValue(true);
    expect(wrapper.get('#OIDC_CLIENT_ID').element.closest('fieldset').disabled).toBe(false);
  });
  it('saves provider fields together and clears replacement secrets after success', async () => {
    const wrapper = await render();
    await wrapper.findAll('input[type=checkbox]')[0].setValue(true);
    await wrapper.get('#OIDC_ENABLED').setValue(true);
    await wrapper.get('#OIDC_CLIENT_ID').setValue('client');
    await wrapper.get('#oidc-secret-action').setValue('replace');
    await wrapper.get('#oidc-secret').setValue('new-test-secret');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(saveOidcSettings).toHaveBeenCalledWith(expect.objectContaining({ secretAction: 'replace', secret: 'new-test-secret', overrides: expect.objectContaining({ OIDC_ENABLED: true, OIDC_CLIENT_ID: 'client', OIDC_AUTO_PROVISION: false }) }));
    expect(saveOidcSettings.mock.calls[0][0].overrides).not.toHaveProperty('LOCAL_AUTH_ENABLED');
    expect(wrapper.find('#oidc-secret').exists()).toBe(false);
    expect(wrapper.get('#OIDC_CLIENT_ID').element.value).toBe('');
    expect(wrapper.get('.app-notice--success').text()).toBe('Authentication settings saved.');
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });
  it('removes the entire provider override when inheritance is restored', async () => {
    const data = configuration(); data.fields.OIDC_ENABLED.overridden = true;
    fetchOidcSettings.mockResolvedValue({ data });
    const wrapper = await render();
    await wrapper.findAll('input[type=checkbox]')[0].setValue(false);
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(saveOidcSettings).toHaveBeenCalledWith({ overrides: {}, secretAction: 'environment' });
  });
  it('retains edits when validation fails and shows the server error', async () => {
    saveOidcSettings.mockRejectedValue({ response: { data: { error: 'At least one authentication method must be enabled' } } });
    const wrapper = await render();
    await wrapper.findAll('input[type=checkbox]')[1].setValue(true);
    await wrapper.get('#LOCAL_AUTH_ENABLED').setValue(false);
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('At least one');
    expect(wrapper.get('#LOCAL_AUTH_ENABLED').element.value).toBe('false');
  });
  it('confirms resetting all overrides', async () => {
    const wrapper = await render();
    await wrapper.findAll('button').find(button => button.text() === 'Restore environment defaults').trigger('click');
    expect(clearOidcSettings).not.toHaveBeenCalled();
    await wrapper.findAll('button').find(button => button.text() === 'Restore defaults').trigger('click'); await flushPromises();
    expect(clearOidcSettings).toHaveBeenCalledOnce();
  });
});

it('masks the client ID and retains it when unchanged', async () => {
  const wrapper = await render();
  expect(wrapper.get('#OIDC_CLIENT_ID').attributes('type')).toBe('password');
  expect(wrapper.get('#OIDC_CLIENT_ID').element.value).toBe('');
  expect(wrapper.get('#OIDC_CLIENT_ID').attributes('placeholder')).toBe('********');
  await wrapper.findAll('input[type=checkbox]')[0].setValue(true);
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(saveOidcSettings.mock.calls[0][0].overrides).not.toHaveProperty('OIDC_CLIENT_ID');
});
