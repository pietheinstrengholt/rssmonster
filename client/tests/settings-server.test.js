import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SettingsServer from '../src/components/settings/SettingsServer.vue';
import { fetchServerSettings, saveServerSettings } from '../src/api/settings';
vi.mock('../src/api/settings', () => ({ fetchServerSettings: vi.fn(), saveServerSettings: vi.fn() }));
const configuration = (override = null, environmentValue = true) => ({
  allowRegistration: { override, environmentValue, effectiveValue: override ?? environmentValue }, localAuthEnabled: true
});
beforeEach(() => {
  vi.resetAllMocks();
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
    expect(wrapper.find('form').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('form').exists()).toBe(true);
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
